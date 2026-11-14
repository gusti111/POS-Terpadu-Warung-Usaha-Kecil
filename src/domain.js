import { uid, dateKey } from './format.js';

const clone = (value) => structuredClone(value);
const positiveInt = (value, label) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${label} harus berupa bilangan bulat lebih dari 0.`);
  return n;
};
const nonNegativeMoney = (value, label) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} tidak boleh negatif.`);
  return Math.round(n);
};

export function findOpenShift(state, cashierId) {
  return state.shifts.find((shift) => shift.cashier_id === cashierId && shift.status === 'open') || null;
}

export function expectedCash(shift) {
  return Math.round(Number(shift.opening_cash || 0)
    + Number(shift.cash_sales || 0)
    - Number(shift.cash_expenses || 0)
    - Number(shift.cash_refunds || 0));
}

function addMovement(state, { product, actorId, type, change, referenceType, referenceId, note }) {
  const before = product.stock_qty;
  const after = before + change;
  if (after < 0) throw new Error(`Stok ${product.name} tidak mencukupi. Tersedia ${before}.`);
  product.stock_qty = after;
  state.stock_movements.unshift({
    id: uid('mov'), store_id: state.store.id, product_id: product.id,
    performed_by: actorId, movement_type: type, qty_change: change,
    stock_before: before, stock_after: after, reference_type: referenceType,
    reference_id: referenceId, note, created_at: new Date().toISOString(),
  });
}

export function createSale(state, input) {
  const next = clone(state);
  const { actorId, items, method, cashReceived = 0, verified = false, referenceNo = '', idempotencyKey } = input;
  if (idempotencyKey && next.sales.some((sale) => sale.idempotency_key === idempotencyKey)) {
    return { state: next, sale: next.sales.find((sale) => sale.idempotency_key === idempotencyKey), replayed: true };
  }
  const actor = next.users.find((user) => user.id === actorId && user.is_active);
  if (!actor) throw new Error('Akun kasir tidak aktif atau sesi tidak valid.');
  const shift = findOpenShift(next, actorId);
  if (!shift) throw new Error('Buka shift terlebih dahulu sebelum melakukan transaksi.');
  if (!Array.isArray(items) || items.length === 0) throw new Error('Keranjang masih kosong.');
  if (!['cash', 'qris', 'bank_transfer'].includes(method)) throw new Error('Metode pembayaran tidak valid.');

  const snapshots = items.map((item) => {
    const product = next.products.find((entry) => entry.id === item.product_id && entry.is_active);
    if (!product) throw new Error('Ada produk yang sudah tidak aktif. Segarkan katalog.');
    const quantity = positiveInt(item.quantity, 'Jumlah produk');
    if (quantity > product.stock_qty) throw new Error(`Stok ${product.name} hanya ${product.stock_qty}.`);
    return {
      product_id: product.id,
      product_name_snapshot: product.name,
      sku_snapshot: product.sku || '',
      unit_price: nonNegativeMoney(product.selling_price, 'Harga jual'),
      unit_cost: nonNegativeMoney(product.cost_price, 'HPP'),
      quantity,
      subtotal: Math.round(product.selling_price * quantity),
    };
  });
  const subtotal = snapshots.reduce((sum, item) => sum + item.subtotal, 0);
  const isPaid = method === 'cash' ? Number(cashReceived) >= subtotal : Boolean(verified);
  if (method === 'cash' && Number(cashReceived) < subtotal) throw new Error('Uang diterima kurang dari total transaksi.');
  const now = new Date().toISOString();
  const invoiceDay = dateKey(now).replaceAll('-', '');
  const countToday = next.sales.filter((sale) => sale.invoice_no.startsWith(`INV-${invoiceDay}`)).length + 1;
  const id = uid('sale');
  const sale = {
    id, store_id: next.store.id, shift_id: shift.id, cashier_id: actorId,
    invoice_no: `INV-${invoiceDay}-${String(countToday).padStart(3, '0')}`,
    status: isPaid ? 'completed' : 'pending_payment', subtotal, grand_total: subtotal,
    idempotency_key: idempotencyKey || uid('intent'), created_at: now,
    completed_at: isPaid ? now : null, void_reason: null,
    items: snapshots,
    payment: {
      id: uid('pay'), method, status: isPaid ? 'paid' : 'pending', amount: subtotal,
      cash_received: method === 'cash' ? Number(cashReceived) : null,
      change_amount: method === 'cash' && isPaid ? Number(cashReceived) - subtotal : null,
      reference_no: referenceNo.trim(), paid_at: isPaid ? now : null,
    },
  };
  next.sales.unshift(sale);
  if (isPaid) {
    snapshots.forEach((item) => {
      const product = next.products.find((entry) => entry.id === item.product_id);
      addMovement(next, { product, actorId, type: 'sale', change: -item.quantity, referenceType: 'sale', referenceId: id, note: `Penjualan ${sale.invoice_no}` });
    });
    if (method === 'cash') shift.cash_sales += subtotal;
    else shift.non_cash_sales += subtotal;
  }
  next.audit_logs.unshift({ id: uid('audit'), store_id: next.store.id, actor_id: actorId, entity_type: 'sale', entity_id: id, action: isPaid ? 'create_completed' : 'create_pending', before_data: null, after_data: { invoice_no: sale.invoice_no, amount: subtotal, method, status: sale.status }, created_at: now });
  return { state: next, sale, replayed: false };
}

export function verifyPendingSale(state, saleId, actorId) {
  const next = clone(state);
  const actor = next.users.find((user) => user.id === actorId && user.is_active);
  if (actor?.role !== 'owner') throw new Error('Hanya Owner yang dapat memverifikasi pembayaran pending.');
  const sale = next.sales.find((entry) => entry.id === saleId);
  if (!sale || sale.status !== 'pending_payment' || sale.payment.status !== 'pending') throw new Error('Transaksi tidak lagi berstatus pending.');
  const shift = next.shifts.find((entry) => entry.id === sale.shift_id);
  if (!shift || shift.status !== 'open') throw new Error('Shift asal sudah ditutup; verifikasi perlu prosedur rekonsiliasi Owner.');
  sale.items.forEach((item) => {
    const product = next.products.find((entry) => entry.id === item.product_id && entry.is_active);
    if (!product || product.stock_qty < item.quantity) throw new Error(`Stok ${item.product_name_snapshot} tidak lagi mencukupi untuk menyelesaikan transaksi.`);
  });
  const now = new Date().toISOString();
  sale.items.forEach((item) => {
    const product = next.products.find((entry) => entry.id === item.product_id);
    addMovement(next, { product, actorId, type: 'sale', change: -item.quantity, referenceType: 'sale', referenceId: sale.id, note: `Pembayaran diverifikasi ${sale.invoice_no}` });
  });
  sale.status = 'completed'; sale.completed_at = now; sale.payment.status = 'paid'; sale.payment.paid_at = now;
  if (sale.payment.method === 'cash') shift.cash_sales += sale.grand_total;
  else shift.non_cash_sales += sale.grand_total;
  next.audit_logs.unshift({ id: uid('audit'), store_id: next.store.id, actor_id: actorId, entity_type: 'sale', entity_id: sale.id, action: 'verify_payment', before_data: { status: 'pending_payment' }, after_data: { status: 'completed' }, created_at: now });
  return { state: next, sale };
}

export function failPendingSale(state, saleId, actorId, reason) {
  const next = clone(state);
  const actor = next.users.find((user) => user.id === actorId && user.is_active);
  if (actor?.role !== 'owner') throw new Error('Hanya Owner yang dapat menandai pembayaran pending sebagai gagal.');
  if (!reason?.trim()) throw new Error('Alasan pembatalan pembayaran wajib diisi.');
  const sale = next.sales.find((entry) => entry.id === saleId);
  if (!sale || sale.status !== 'pending_payment' || sale.payment?.status !== 'pending') throw new Error('Transaksi tidak lagi menunggu pembayaran.');
  const now = new Date().toISOString();
  sale.status = 'failed';
  sale.failure_reason = reason.trim();
  sale.failed_at = now;
  sale.payment.status = 'failed';
  sale.payment.failed_at = now;
  next.audit_logs.unshift({ id: uid('audit'), store_id: next.store.id, actor_id: actorId, entity_type: 'sale', entity_id: sale.id, action: 'fail_pending_payment', before_data: { status: 'pending_payment', payment_status: 'pending' }, after_data: { status: 'failed', payment_status: 'failed', reason: reason.trim() }, created_at: now });
  return { state: next, sale };
}

export function voidSale(state, saleId, actorId, reason) {
  const next = clone(state);
  const actor = next.users.find((user) => user.id === actorId && user.is_active);
  if (actor?.role !== 'owner') throw new Error('Hanya Owner yang dapat melakukan void transaksi.');
  if (!reason?.trim()) throw new Error('Alasan void wajib diisi.');
  const sale = next.sales.find((entry) => entry.id === saleId);
  if (!sale || sale.status !== 'completed') throw new Error('Hanya transaksi lunas yang dapat di-void.');
  const now = new Date().toISOString();
  sale.items.forEach((item) => {
    const product = next.products.find((entry) => entry.id === item.product_id);
    if (product) addMovement(next, { product, actorId, type: 'void_return', change: item.quantity, referenceType: 'sale_void', referenceId: sale.id, note: `Pembalikan ${sale.invoice_no}: ${reason.trim()}` });
  });
  const shift = next.shifts.find((entry) => entry.id === sale.shift_id);
  if (shift) {
    if (sale.payment.method === 'cash') {
      shift.cash_refunds += sale.grand_total;
      if (shift.status === 'closed' && shift.counted_cash !== null) {
        shift.expected_cash = expectedCash(shift);
        shift.cash_difference = shift.counted_cash - shift.expected_cash;
      }
    } else shift.non_cash_refunds += sale.grand_total;
  }
  sale.status = 'voided'; sale.void_reason = reason.trim(); sale.voided_at = now;
  sale.payment.status = 'refunded'; sale.payment.refunded_at = now;
  next.audit_logs.unshift({ id: uid('audit'), store_id: next.store.id, actor_id: actorId, entity_type: 'sale', entity_id: sale.id, action: 'void', before_data: { status: 'completed' }, after_data: { status: 'voided', reason: reason.trim() }, created_at: now });
  return { state: next, sale };
}

export function adjustStock(state, input) {
  const next = clone(state);
  const { productId, actorId, quantity, direction, reason } = input;
  if (!reason?.trim()) throw new Error('Alasan penyesuaian stok wajib diisi.');
  const product = next.products.find((entry) => entry.id === productId && entry.is_active);
  if (!product) throw new Error('Produk tidak ditemukan atau tidak aktif.');
  const qty = positiveInt(quantity, 'Jumlah stok');
  if (!['in', 'out'].includes(direction)) throw new Error('Jenis mutasi stok tidak valid.');
  addMovement(next, { product, actorId, type: direction === 'in' ? 'adjustment_in' : 'adjustment_out', change: direction === 'in' ? qty : -qty, referenceType: 'manual_adjustment', referenceId: null, note: reason.trim() });
  next.audit_logs.unshift({ id: uid('audit'), store_id: next.store.id, actor_id: actorId, entity_type: 'product', entity_id: product.id, action: 'stock_adjustment', before_data: { stock_qty: product.stock_qty - (direction === 'in' ? qty : -qty) }, after_data: { stock_qty: product.stock_qty, reason }, created_at: new Date().toISOString() });
  return next;
}

export function openShift(state, cashierId, openingCash) {
  const next = clone(state);
  if (findOpenShift(next, cashierId)) throw new Error('Kasir masih memiliki shift aktif.');
  const actor = next.users.find((user) => user.id === cashierId && user.is_active);
  if (!actor) throw new Error('Kasir tidak aktif.');
  const now = new Date().toISOString();
  const shift = { id: uid('shift'), store_id: next.store.id, cashier_id: cashierId, opening_cash: nonNegativeMoney(openingCash, 'Kas awal'), cash_sales: 0, non_cash_sales: 0, cash_expenses: 0, cash_refunds: 0, non_cash_refunds: 0, expected_cash: Number(openingCash), counted_cash: null, cash_difference: null, status: 'open', opened_at: now, closed_at: null };
  next.shifts.unshift(shift);
  next.audit_logs.unshift({ id: uid('audit'), store_id: next.store.id, actor_id: cashierId, entity_type: 'shift', entity_id: shift.id, action: 'open', before_data: null, after_data: { opening_cash: shift.opening_cash }, created_at: now });
  return { state: next, shift };
}

export function closeShift(state, shiftId, cashierId, countedCash) {
  const next = clone(state);
  const shift = next.shifts.find((entry) => entry.id === shiftId && entry.cashier_id === cashierId && entry.status === 'open');
  if (!shift) throw new Error('Shift aktif tidak ditemukan.');
  const pending = next.sales.some((sale) => sale.shift_id === shiftId && sale.status === 'pending_payment' && sale.payment?.status === 'pending');
  if (pending) throw new Error('Masih ada pembayaran Pending pada shift ini. Owner perlu memverifikasi atau menandainya gagal sebelum shift ditutup.');
  const expected = expectedCash(shift);
  const counted = nonNegativeMoney(countedCash, 'Kas aktual');
  const now = new Date().toISOString();
  shift.expected_cash = expected; shift.counted_cash = counted;
  shift.cash_difference = counted - expected; shift.status = 'closed'; shift.closed_at = now;
  next.audit_logs.unshift({ id: uid('audit'), store_id: next.store.id, actor_id: cashierId, entity_type: 'shift', entity_id: shift.id, action: 'close', before_data: { status: 'open' }, after_data: { expected_cash: expected, counted_cash: counted, cash_difference: shift.cash_difference }, created_at: now });
  return { state: next, shift };
}

export function createExpense(state, input) {
  const next = clone(state);
  const { actorId, title, amount, categoryId, paymentMethod, occurredAt, notes, expenseId } = input;
  const actor = next.users.find((user) => user.id === actorId && user.is_active);
  if (!actor) throw new Error('Akun pengguna tidak aktif atau sesi tidak valid.');
  if (actor.role !== 'owner' && !next.store.cashier_expense_permission) throw new Error('Kasir belum diberi izin mencatat pengeluaran.');
  if (!title?.trim()) throw new Error('Nama pengeluaran wajib diisi.');
  const value = nonNegativeMoney(amount, 'Nominal');
  if (value <= 0) throw new Error('Nominal harus lebih dari 0.');
  if (!['cash', 'bank_transfer'].includes(paymentMethod)) throw new Error('Metode pengeluaran tidak valid.');

  const openShift = findOpenShift(next, actorId);
  const existing = expenseId ? next.expenses.find((entry) => entry.id === expenseId && entry.status === 'active') : null;
  if (expenseId && !existing) throw new Error('Pengeluaran tidak ditemukan atau sudah di-void.');
  if (existing && actor.role !== 'owner' && existing.created_by !== actorId) throw new Error('Kasir hanya dapat mengubah pengeluaran miliknya.');

  const oldShift = existing?.shift_id ? next.shifts.find((entry) => entry.id === existing.shift_id) : null;
  if (oldShift?.status === 'closed') throw new Error('Pengeluaran pada shift yang sudah ditutup tidak dapat diedit.');
  const targetShift = existing ? oldShift : openShift;
  if (paymentMethod === 'cash' && actor.role === 'cashier' && !targetShift) {
    throw new Error('Kasir perlu memiliki shift aktif untuk mencatat pengeluaran tunai.');
  }

  const now = new Date().toISOString();
  const expense = existing || { id: uid('exp'), store_id: next.store.id, created_by: actorId, status: 'active', created_at: now };
  const beforeData = existing ? { title: existing.title, amount: existing.amount, payment_method: existing.payment_method, shift_id: existing.shift_id } : null;

  if (existing && existing.payment_method === 'cash' && oldShift) {
    oldShift.cash_expenses = Math.max(0, oldShift.cash_expenses - existing.amount);
  }
  if (paymentMethod === 'cash' && targetShift) targetShift.cash_expenses += value;
  if (existing) Object.assign(expense, { updated_at: now });
  Object.assign(expense, {
    shift_id: targetShift?.id || null,
    category_id: categoryId || null,
    title: title.trim(),
    amount: value,
    payment_method: paymentMethod,
    occurred_at: occurredAt || now,
    notes: notes?.trim() || '',
  });
  if (!existing) next.expenses.unshift(expense);
  next.audit_logs.unshift({ id: uid('audit'), store_id: next.store.id, actor_id: actorId, entity_type: 'expense', entity_id: expense.id, action: existing ? 'update' : 'create', before_data: beforeData, after_data: { title: expense.title, amount: expense.amount, payment_method: expense.payment_method, shift_id: expense.shift_id }, created_at: now });
  return { state: next, expense };
}

export function voidExpense(state, expenseId, actorId, reason) {
  const next = clone(state);
  const actor = next.users.find((user) => user.id === actorId && user.is_active);
  if (actor?.role !== 'owner') throw new Error('Hanya Owner yang dapat melakukan void pengeluaran.');
  const expense = next.expenses.find((entry) => entry.id === expenseId && entry.status === 'active');
  if (!expense) throw new Error('Pengeluaran aktif tidak ditemukan.');
  if (!reason?.trim()) throw new Error('Alasan void wajib diisi.');
  const shift = next.shifts.find((entry) => entry.id === expense.shift_id);
  if (expense.payment_method === 'cash' && shift) {
    shift.cash_expenses = Math.max(0, shift.cash_expenses - expense.amount);
    if (shift.status === 'closed' && shift.counted_cash !== null) {
      shift.expected_cash = expectedCash(shift);
      shift.cash_difference = shift.counted_cash - shift.expected_cash;
    }
  }
  expense.status = 'voided'; expense.void_reason = reason.trim(); expense.voided_at = new Date().toISOString();
  next.audit_logs.unshift({ id: uid('audit'), store_id: next.store.id, actor_id: actorId, entity_type: 'expense', entity_id: expense.id, action: 'void', before_data: { status: 'active' }, after_data: { status: 'voided', reason: reason.trim() }, created_at: expense.voided_at });
  return next;
}

export function computeReport(state, start, end) {
  const from = new Date(`${start}T00:00:00`);
  const to = new Date(`${end}T23:59:59.999`);
  const inRange = (value) => { const time = new Date(value); return time >= from && time <= to; };
  const sales = state.sales.filter((sale) => sale.status === 'completed' && sale.payment.status === 'paid' && inRange(sale.completed_at || sale.created_at));
  const expenses = state.expenses.filter((expense) => expense.status === 'active' && inRange(expense.occurred_at));
  const omzet = sales.reduce((sum, sale) => sum + sale.grand_total, 0);
  const cogs = sales.reduce((sum, sale) => sum + sale.items.reduce((subtotal, item) => subtotal + item.unit_cost * item.quantity, 0), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const paymentMix = ['cash', 'qris', 'bank_transfer'].map((method) => ({ method, amount: sales.filter((sale) => sale.payment.method === method).reduce((sum, sale) => sum + sale.grand_total, 0) }));
  return { sales, expenses, omzet, cogs, grossProfit: omzet - cogs, totalExpenses, operatingEstimate: omzet - cogs - totalExpenses, average: sales.length ? Math.round(omzet / sales.length) : 0, count: sales.length, paymentMix };
}
