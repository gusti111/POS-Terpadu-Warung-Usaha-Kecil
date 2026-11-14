import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSale,
  verifyPendingSale,
  failPendingSale,
  voidSale,
  adjustStock,
  openShift,
  closeShift,
  expectedCash,
  createExpense,
  voidExpense,
  computeReport,
} from '../src/domain.js';

function fixture() {
  const ownerId = 'user-owner';
  const cashierId = 'user-cashier';
  const storeId = 'store-1';
  return {
    meta: { mode: 'test' },
    store: { id: storeId, name: 'Warung Uji', cashier_expense_permission: true },
    users: [
      { id: ownerId, store_id: storeId, role: 'owner', is_active: true, full_name: 'Owner' },
      { id: cashierId, store_id: storeId, role: 'cashier', is_active: true, full_name: 'Kasir' },
    ],
    categories: [{ id: 'cat-1', name: 'Minuman', is_active: true }],
    products: [
      { id: 'prod-1', store_id: storeId, name: 'Air Mineral', sku: 'AM-001', selling_price: 5000, cost_price: 2500, stock_qty: 10, min_stock: 2, category_id: 'cat-1', is_active: true },
      { id: 'prod-2', store_id: storeId, name: 'Teh Botol', sku: 'TB-001', selling_price: 7000, cost_price: 3500, stock_qty: 4, min_stock: 1, category_id: 'cat-1', is_active: true },
    ],
    shifts: [{
      id: 'shift-1', store_id: storeId, cashier_id: cashierId,
      opening_cash: 100000, cash_sales: 0, non_cash_sales: 0,
      cash_expenses: 0, cash_refunds: 0, non_cash_refunds: 0,
      expected_cash: 100000, counted_cash: null, cash_difference: null,
      status: 'open', opened_at: new Date().toISOString(), closed_at: null,
    }],
    sales: [], expenses: [], stock_movements: [], audit_logs: [],
    expense_categories: [{ id: 'ecat-1', name: 'Operasional', is_active: true }],
  };
}

test('cash sale is completed, snapshots items and updates stock and cash shift', () => {
  const state = fixture();
  const result = createSale(state, {
    actorId: 'user-cashier', items: [{ product_id: 'prod-1', quantity: 2 }],
    method: 'cash', cashReceived: 15000, idempotencyKey: 'checkout-1',
  });
  assert.equal(result.sale.status, 'completed');
  assert.equal(result.sale.grand_total, 10000);
  assert.equal(result.sale.payment.change_amount, 5000);
  assert.equal(result.state.products.find((p) => p.id === 'prod-1').stock_qty, 8);
  assert.equal(result.state.shifts[0].cash_sales, 10000);
  assert.equal(result.state.stock_movements.length, 1);
  assert.equal(state.products.find((p) => p.id === 'prod-1').stock_qty, 10, 'input state must stay immutable');
});

test('QRIS payment pending does not reduce stock or count as paid sales', () => {
  const state = fixture();
  const result = createSale(state, {
    actorId: 'user-cashier', items: [{ product_id: 'prod-1', quantity: 1 }],
    method: 'qris', referenceNo: 'REF-TEST-1',
  });
  assert.equal(result.sale.status, 'pending_payment');
  assert.equal(result.sale.payment.status, 'pending');
  assert.equal(result.state.products[0].stock_qty, 10);
  assert.equal(result.state.stock_movements.length, 0);
  assert.equal(result.state.shifts[0].cash_sales, 0);
  assert.equal(result.state.shifts[0].non_cash_sales, 0);
});

test('Owner verification completes pending sale and only then decreases stock', () => {
  const pending = createSale(fixture(), {
    actorId: 'user-cashier', items: [{ product_id: 'prod-1', quantity: 3 }], method: 'bank_transfer',
  });
  assert.throws(() => verifyPendingSale(pending.state, pending.sale.id, 'user-cashier'), /Hanya Owner/);
  const paid = verifyPendingSale(pending.state, pending.sale.id, 'user-owner');
  assert.equal(paid.sale.status, 'completed');
  assert.equal(paid.sale.payment.status, 'paid');
  assert.equal(paid.state.products[0].stock_qty, 7);
  assert.equal(paid.state.shifts[0].non_cash_sales, 15000);
});

test('checkout rejects insufficient stock without partial mutation', () => {
  const state = fixture();
  assert.throws(() => createSale(state, {
    actorId: 'user-cashier', items: [{ product_id: 'prod-1', quantity: 11 }], method: 'cash', cashReceived: 100000,
  }), /Stok Air Mineral hanya 10/);
  assert.equal(state.products[0].stock_qty, 10);
  assert.equal(state.sales.length, 0);
});

test('idempotency key prevents duplicate sale replay', () => {
  const state = fixture();
  const input = { actorId: 'user-cashier', items: [{ product_id: 'prod-1', quantity: 1 }], method: 'cash', cashReceived: 5000, idempotencyKey: 'same-intent' };
  const first = createSale(state, input);
  const second = createSale(first.state, input);
  assert.equal(second.replayed, true);
  assert.equal(second.sale.id, first.sale.id);
  assert.equal(second.state.sales.length, 1);
  assert.equal(second.state.products[0].stock_qty, 9);
});

test('Owner void restores stock and reverses cash expected balance', () => {
  const created = createSale(fixture(), {
    actorId: 'user-cashier', items: [{ product_id: 'prod-1', quantity: 2 }], method: 'cash', cashReceived: 10000,
  });
  assert.throws(() => voidSale(created.state, created.sale.id, 'user-cashier', 'Salah input'), /Hanya Owner/);
  const result = voidSale(created.state, created.sale.id, 'user-owner', 'Salah input');
  assert.equal(result.sale.status, 'voided');
  assert.equal(result.sale.payment.status, 'refunded');
  assert.equal(result.state.products[0].stock_qty, 10);
  assert.equal(result.state.shifts[0].cash_refunds, 10000);
  assert.equal(expectedCash(result.state.shifts[0]), 100000);
  assert.equal(result.state.stock_movements[0].movement_type, 'void_return');
});

test('shift opening and closing calculate expected cash from cash movements only', () => {
  const state = fixture();
  const opened = openShift({ ...state, shifts: [] }, 'user-cashier', 125000);
  opened.shift.cash_sales = 35000;
  opened.shift.non_cash_sales = 90000;
  opened.shift.cash_expenses = 10000;
  opened.shift.cash_refunds = 5000;
  assert.equal(expectedCash(opened.shift), 145000);
  const closed = closeShift(opened.state, opened.shift.id, 'user-cashier', 144000);
  assert.equal(closed.shift.expected_cash, 145000);
  assert.equal(closed.shift.cash_difference, -1000);
  assert.equal(closed.shift.status, 'closed');
});

test('stock adjustment requires reason and never allows negative inventory', () => {
  const state = fixture();
  assert.throws(() => adjustStock(state, { productId: 'prod-1', actorId: 'user-owner', quantity: 1, direction: 'in', reason: '' }), /Alasan/);
  assert.throws(() => adjustStock(state, { productId: 'prod-1', actorId: 'user-owner', quantity: 11, direction: 'out', reason: 'Hitung ulang' }), /tidak mencukupi/);
  const changed = adjustStock(state, { productId: 'prod-1', actorId: 'user-owner', quantity: 5, direction: 'in', reason: 'Restock' });
  assert.equal(changed.products[0].stock_qty, 15);
  assert.equal(changed.stock_movements[0].qty_change, 5);
});

test('cash expense reduces expected shift cash and void restores it', () => {
  const state = fixture();
  const created = createExpense(state, { actorId: 'user-cashier', title: 'Parkir', amount: 3000, categoryId: 'ecat-1', paymentMethod: 'cash' });
  assert.equal(created.state.shifts[0].cash_expenses, 3000);
  assert.equal(expectedCash(created.state.shifts[0]), 97000);
  const voided = voidExpense(created.state, created.expense.id, 'user-owner', 'Salah catat');
  assert.equal(voided.expenses[0].status, 'voided');
  assert.equal(voided.shifts[0].cash_expenses, 0);
  assert.equal(expectedCash(voided.shifts[0]), 100000);
});

test('report excludes pending and voided transactions and calculates gross profit', () => {
  const state = fixture();
  const paid = createSale(state, { actorId: 'user-cashier', items: [{ product_id: 'prod-1', quantity: 2 }], method: 'cash', cashReceived: 10000 });
  const start = new Date().toISOString().slice(0, 10);
  const report = computeReport(paid.state, start, start);
  assert.equal(report.count, 1);
  assert.equal(report.omzet, 10000);
  assert.equal(report.cogs, 5000);
  assert.equal(report.grossProfit, 5000);
});

test('post-close cash void recalculates expected cash and shift difference', () => {
  const created = createSale(fixture(), {
    actorId: 'user-cashier', items: [{ product_id: 'prod-1', quantity: 1 }], method: 'cash', cashReceived: 5000,
  });
  const closed = closeShift(created.state, 'shift-1', 'user-cashier', 105000);
  const voided = voidSale(closed.state, created.sale.id, 'user-owner', 'Refund setelah shift tutup');
  const shift = voided.state.shifts[0];
  assert.equal(shift.status, 'closed');
  assert.equal(shift.expected_cash, 100000);
  assert.equal(shift.cash_difference, 5000);
});

test('editing an expense keeps the original shift assignment', () => {
  const state = fixture();
  const created = createExpense(state, { actorId: 'user-cashier', title: 'Parkir', amount: 3000, categoryId: 'ecat-1', paymentMethod: 'cash' });
  const edited = createExpense(created.state, { actorId: 'user-owner', title: 'Parkir dan tol', amount: 5000, categoryId: 'ecat-1', paymentMethod: 'cash', expenseId: created.expense.id });
  assert.equal(edited.expense.shift_id, 'shift-1');
  assert.equal(edited.state.shifts[0].cash_expenses, 5000);
  assert.equal(edited.expense.created_by, 'user-cashier');
});

test('only Owner can void an expense', () => {
  const created = createExpense(fixture(), { actorId: 'user-cashier', title: 'Parkir', amount: 3000, categoryId: 'ecat-1', paymentMethod: 'cash' });
  assert.throws(() => voidExpense(created.state, created.expense.id, 'user-cashier', 'Salah catat'), /Hanya Owner/);
});

test('voiding a cash expense after shift close recalculates expected cash and difference', () => {
  const created = createExpense(fixture(), { actorId: 'user-cashier', title: 'Parkir', amount: 3000, categoryId: 'ecat-1', paymentMethod: 'cash' });
  const closed = closeShift(created.state, 'shift-1', 'user-cashier', 97000);
  const voided = voidExpense(closed.state, created.expense.id, 'user-owner', 'Salah input');
  assert.equal(voided.shifts[0].expected_cash, 100000);
  assert.equal(voided.shifts[0].cash_difference, -3000);
});


test('Owner can close a pending payment as failed without touching stock or revenue', () => {
  const pending = createSale(fixture(), {
    actorId: 'user-cashier', items: [{ product_id: 'prod-1', quantity: 2 }], method: 'qris',
  });
  assert.throws(() => closeShift(pending.state, 'shift-1', 'user-cashier', 100000), /masih ada pembayaran Pending/i);
  assert.throws(() => failPendingSale(pending.state, pending.sale.id, 'user-cashier', 'Tidak dibayar'), /Hanya Owner/);
  const failed = failPendingSale(pending.state, pending.sale.id, 'user-owner', 'Dana tidak diterima');
  assert.equal(failed.sale.status, 'failed');
  assert.equal(failed.sale.payment.status, 'failed');
  assert.equal(failed.state.products[0].stock_qty, 10);
  assert.equal(failed.state.shifts[0].non_cash_sales, 0);
  const closed = closeShift(failed.state, 'shift-1', 'user-cashier', 100000);
  assert.equal(closed.shift.status, 'closed');
});
