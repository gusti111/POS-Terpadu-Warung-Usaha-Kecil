import { uid, dateKey } from './format.js';

const STORAGE_KEY = 'pos-terpadu-app-v1';
const SESSION_KEY = 'pos-terpadu-session-v1';

export function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.error('Gagal membaca data lokal:', error);
    return null;
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getSessionUserId() {
  return sessionStorage.getItem(SESSION_KEY);
}

export function setSessionUserId(userId) {
  sessionStorage.setItem(SESSION_KEY, userId);
}

export function clearSession() {
  sessionStorage.removeItem(SESSION_KEY);
}

async function derivePin(pin, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('Browser ini tidak mendukung Web Crypto. Buka aplikasi melalui localhost atau HTTPS.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: 120000, hash: 'SHA-256' }, material, 256);
  return [...new Uint8Array(bits)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashPin(pin) {
  const salt = uid('salt');
  return { pin_salt: salt, pin_hash: await derivePin(pin, salt) };
}

export async function verifyPin(pin, user) {
  if (!/^\d{4,6}$/.test(pin || '') || !user?.pin_salt || !user?.pin_hash) return false;
  const hash = await derivePin(pin, user.pin_salt);
  return hash === user.pin_hash;
}

function makeSale({ storeId, invoice, cashierId, shiftId, createdAt, items, method, amount, status = 'completed', cashReceived = null, referenceNo = '' }) {
  const total = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const paid = status === 'completed';
  return {
    id: uid('sale'), store_id: storeId, shift_id: shiftId, cashier_id: cashierId,
    invoice_no: invoice, status, subtotal: total, grand_total: total,
    idempotency_key: uid('sample_intent'), created_at: createdAt,
    completed_at: paid ? createdAt : null, void_reason: null, items,
    payment: { id: uid('pay'), method, status: paid ? 'paid' : 'pending', amount: total, cash_received: cashReceived, change_amount: cashReceived === null ? null : Math.max(0, cashReceived - total), reference_no: referenceNo, paid_at: paid ? createdAt : null },
  };
}

export async function createWorkspace({ storeName, ownerName, ownerUsername, ownerPin, sampleData = true }) {
  if (!storeName?.trim() || !ownerName?.trim()) throw new Error('Nama toko dan nama Owner wajib diisi.');
  if (!/^[a-z0-9._-]{3,30}$/i.test(ownerUsername?.trim() || '')) throw new Error('Username Owner harus 3–30 karakter dan hanya berisi huruf, angka, titik, garis bawah, atau minus.');
  if (!/^\d{4,6}$/.test(ownerPin || '')) throw new Error('PIN Owner harus terdiri dari 4–6 angka.');
  const ownerAuth = await hashPin(ownerPin);
  const now = new Date();
  const storeId = uid('store');
  const ownerId = uid('user');
  const state = {
    meta: { version: 1, mode: 'local-demo', created_at: now.toISOString() },
    store: { id: storeId, name: storeName.trim(), address: '', phone: '', timezone: 'Asia/Pontianak', receipt_width: '80', theme: 'light', cashier_expense_permission: false },
    users: [{ id: ownerId, store_id: storeId, full_name: ownerName.trim(), username: ownerUsername.trim().toLowerCase(), role: 'owner', is_active: true, permissions: { can_create_expense: true }, ...ownerAuth, created_at: now.toISOString() }],
    categories: [],
    expense_categories: ['Operasional', 'Belanja Stok', 'Utilitas', 'Transportasi'].map((name) => ({ id: uid('ecat'), store_id: storeId, name, is_active: true, created_at: now.toISOString() })),
    products: [], shifts: [], sales: [], expenses: [], stock_movements: [], audit_logs: [],
  };

  if (sampleData) seedSampleData(state, ownerId, now);
  saveState(state);
  setSessionUserId(ownerId);
  return state;
}

function seedSampleData(state, ownerId, now) {
  const cat = (name) => ({ id: uid('cat'), store_id: state.store.id, name, is_active: true, created_at: now.toISOString() });
  const categories = ['Minuman', 'Makanan', 'Camilan', 'Kebutuhan Harian'].map(cat);
  state.categories = categories;
  state.expense_categories = ['Operasional', 'Belanja Stok', 'Utilitas', 'Transportasi'].map((name) => ({ id: uid('ecat'), store_id: state.store.id, name, is_active: true }));
  const productDefs = [
    ['Kopi Susu 250 ml', 'MIN-001', 12000, 6500, 23, 8, 0, '#EDE3D2'],
    ['Air Mineral 600 ml', 'MIN-002', 5000, 2500, 34, 12, 0, '#DCEBFA'],
    ['Teh Botol', 'MIN-003', 6000, 3200, 19, 8, 0, '#F5E9CF'],
    ['Roti Cokelat', 'FOOD-001', 8000, 4200, 16, 6, 1, '#F4E0D2'],
    ['Roti Keju', 'FOOD-002', 9000, 4800, 14, 6, 1, '#F4E6D1'],
    ['Keripik Singkong', 'SNK-001', 10000, 5200, 8, 8, 2, '#E9E8D8'],
    ['Biskuit Gandum', 'SNK-002', 7500, 3900, 28, 8, 2, '#E3E9DD'],
    ['Tisu Saku', 'KHB-001', 4000, 2100, 42, 10, 3, '#E8E5F2'],
    ['Mi Instan', 'KHB-002', 3500, 2300, 31, 10, 3, '#F4E1D2'],
  ];
  state.products = productDefs.map(([name, sku, price, cost, stock, min, idx, color]) => ({ id: uid('prod'), store_id: state.store.id, category_id: categories[idx].id, name, sku, selling_price: price, cost_price: cost, stock_qty: stock, min_stock: min, is_active: true, unit: 'pcs', color, created_at: now.toISOString(), updated_at: now.toISOString() }));
  const shiftToday = { id: uid('shift'), store_id: state.store.id, cashier_id: ownerId, opening_cash: 250000, cash_sales: 32000, non_cash_sales: 24000, cash_expenses: 25000, cash_refunds: 0, non_cash_refunds: 0, expected_cash: 257000, counted_cash: null, cash_difference: null, status: 'open', opened_at: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 30).toISOString(), closed_at: null };
  state.shifts.unshift(shiftToday);
  const product = (sku) => state.products.find((item) => item.sku === sku);
  const snapshot = (sku, quantity) => { const p = product(sku); return { product_id: p.id, product_name_snapshot: p.name, sku_snapshot: p.sku, unit_price: p.selling_price, unit_cost: p.cost_price, quantity, subtotal: p.selling_price * quantity }; };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = (dayOffset, hour, minute) => { const d = new Date(today); d.setDate(d.getDate() + dayOffset); d.setHours(hour, minute, 0, 0); return d.toISOString(); };
  const sales = [
    makeSale({ storeId: state.store.id, invoice: `INV-${dateKey(at(0, 9, 12)).replaceAll('-', '')}-001`, cashierId: ownerId, shiftId: shiftToday.id, createdAt: at(0, 9, 12), items: [snapshot('MIN-001', 2), snapshot('FOOD-001', 1)], method: 'cash', cashReceived: 40000, status: 'completed' }),
    makeSale({ storeId: state.store.id, invoice: `INV-${dateKey(at(0, 10, 42)).replaceAll('-', '')}-002`, cashierId: ownerId, shiftId: shiftToday.id, createdAt: at(0, 10, 42), items: [snapshot('MIN-002', 2), snapshot('SNK-001', 1), snapshot('KHB-001', 1)], method: 'qris', status: 'completed' }),
    makeSale({ storeId: state.store.id, invoice: `INV-${dateKey(at(0, 11, 8)).replaceAll('-', '')}-003`, cashierId: ownerId, shiftId: shiftToday.id, createdAt: at(0, 11, 8), items: [snapshot('FOOD-002', 2), snapshot('SNK-002', 2)], method: 'bank_transfer', status: 'pending_payment', referenceNo: 'TRF-DEMO-03' }),
    makeSale({ storeId: state.store.id, invoice: `INV-${dateKey(at(-1, 14, 15)).replaceAll('-', '')}-001`, cashierId: ownerId, shiftId: null, createdAt: at(-1, 14, 15), items: [snapshot('MIN-003', 3), snapshot('KHB-002', 4)], method: 'cash', cashReceived: 40000, status: 'completed' }),
  ];
  state.sales = sales;
  // Seed paid sample sales into inventory history. Pending sales do not reserve or reduce stock.
  for (const sale of sales.filter((entry) => entry.status === 'completed')) {
    for (const item of sale.items) {
      const p = state.products.find((entry) => entry.id === item.product_id);
      const before = p.stock_qty; p.stock_qty = Math.max(0, p.stock_qty - item.quantity);
      state.stock_movements.unshift({ id: uid('mov'), store_id: state.store.id, product_id: p.id, performed_by: ownerId, movement_type: 'sale', qty_change: -item.quantity, stock_before: before, stock_after: p.stock_qty, reference_type: 'sale', reference_id: sale.id, note: `Data contoh ${sale.invoice_no}`, created_at: sale.created_at });
    }
  }
  state.expenses.unshift({ id: uid('exp'), store_id: state.store.id, shift_id: shiftToday.id, category_id: state.expense_categories[0].id, created_by: ownerId, title: 'Kebutuhan operasional', amount: 25000, payment_method: 'cash', status: 'active', occurred_at: at(0, 8, 10), notes: 'Data contoh', created_at: at(0, 8, 10) });
  state.audit_logs.unshift({ id: uid('audit'), store_id: state.store.id, actor_id: ownerId, entity_type: 'workspace', entity_id: state.store.id, action: 'sample_seeded', before_data: null, after_data: { products: state.products.length, sales: state.sales.length }, created_at: now.toISOString() });
}

export function resetWorkspace() {
  localStorage.removeItem(STORAGE_KEY);
  clearSession();
}

export function exportBackup(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `pos-terpadu-backup-${dateKey()}.json`;
  link.click(); URL.revokeObjectURL(url);
}
