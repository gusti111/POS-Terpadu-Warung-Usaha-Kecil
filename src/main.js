import { rupiah, number, dateTime, shortDate, dateKey, escapeHtml, percent, uid, initials } from './format.js';
import { createSale, verifyPendingSale, failPendingSale, voidSale, adjustStock, openShift, closeShift, createExpense, voidExpense, computeReport, findOpenShift, expectedCash } from './domain.js';
import { readState, saveState, createWorkspace, getSessionUserId, setSessionUserId, clearSession, verifyPin, hashPin, exportBackup } from './store.js';
import { icon } from './icons.js';

const app = document.querySelector('#app');
const toastRoot = document.querySelector('#toast-root');
const ui = {
  data: readState(), userId: getSessionUserId(), view: 'dashboard', modal: null,
  cart: [], search: '', category: 'all', txSearch: '', txStatus: 'all', period: 'today',
  mobileNav: false, busy: false,
};

const currentUser = () => ui.data?.users.find((user) => user.id === ui.userId && user.is_active) || null;
const isOwner = () => currentUser()?.role === 'owner';
const activeShift = () => ui.data ? findOpenShift(ui.data, ui.userId) : null;
const selectedCashier = () => ui.data?.users.find((user) => user.id === ui.userId);
const commit = (state) => { ui.data = state; saveState(state); render(); };
const cartTotal = () => ui.cart.reduce((sum, item) => {
  const product = ui.data.products.find((p) => p.id === item.product_id);
  return sum + (product ? product.selling_price * item.quantity : 0);
}, 0);

const fieldLabel = (label, required = true) => `<span>${label}${required ? ' <b class="text-danger">*</b>' : ''}</span>`;
const moneyInput = (id, label, value = '', required = true, hint = '') => `<label class="field"><span>${label}${required ? ' <b class="text-danger">*</b>' : ''}</span><input id="${id}" name="${id}" inputmode="numeric" type="number" min="0" step="1" value="${escapeHtml(value)}" ${required ? 'required' : ''} />${hint ? `<small>${escapeHtml(hint)}</small>` : ''}</label>`;
const textInput = (id, label, value = '', required = true, placeholder = '') => `<label class="field">${fieldLabel(label, required)}<input id="${id}" name="${id}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" ${required ? 'required' : ''}/></label>`;
const selectInput = (id, label, options, selected = '', required = true) => `<label class="field">${fieldLabel(label, required)}<select id="${id}" name="${id}" ${required ? 'required' : ''}>${options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select></label>`;
const badge = (text, type = 'neutral') => `<span class="badge ${type}"><i></i>${escapeHtml(text)}</span>`;
const iconBtn = (action, ico, label, cls = 'icon-btn') => `<button class="${cls}" data-action="${action}" aria-label="${escapeHtml(label)}">${icon(ico, 18)}</button>`;
const methodLabel = (method) => ({ cash: 'Tunai', qris: 'QRIS', bank_transfer: 'Transfer' }[method] || method || 'â€”');
const statusLabel = (status) => ({ completed: ['Lunas', 'success'], paid: ['Lunas', 'success'], pending_payment: ['Pending', 'warning'], pending: ['Pending', 'warning'], failed: ['Gagal', 'danger'], voided: ['Void', 'danger'], refunded: ['Dikembalikan', 'neutral'], open: ['Aktif', 'success'], closed: ['Ditutup', 'neutral'], active: ['Aktif', 'success'] }[status] || [status || 'â€”', 'neutral']);
const statusBadge = (status) => { const [label, tone] = statusLabel(status); return badge(label, tone); };
const initialsIcon = (name, cls = '') => `<span class="avatar ${cls}">${escapeHtml(initials(name))}</span>`;
const pageTitle = (title, subtitle, action = '') => `<div class="page-heading"><div><div class="eyebrow">WORKSPACE / ${escapeHtml(title.toUpperCase())}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div><div class="page-actions">${action}</div></div>`;
const card = (content, cls = '') => `<section class="card ${cls}">${content}</section>`;
const cardHead = (title, desc, action = '') => `<div class="card-header"><div class="card-heading"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p></div>${action}</div>`;
const button = (label, action, variant = 'primary', extra = '') => `<button class="btn btn-${variant}" data-action="${action}" ${extra}>${label}</button>`;
const getUserName = (id) => ui.data.users.find((user) => user.id === id)?.full_name || 'Akun tidak ditemukan';
const filteredSales = () => {
  const term = ui.txSearch.toLowerCase();
  return [...ui.data.sales].filter((sale) => (isOwner() || sale.cashier_id === ui.userId)
    && (ui.txStatus === 'all' || sale.status === ui.txStatus)
    && (!term || sale.invoice_no.toLowerCase().includes(term) || getUserName(sale.cashier_id).toLowerCase().includes(term)))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
};
const rangeForPeriod = (period) => {
  const end = new Date(); const start = new Date();
  if (period === '7d') start.setDate(start.getDate() - 6);
  else if (period === '30d') start.setDate(start.getDate() - 29);
  return { start: dateKey(start), end: dateKey(end) };
};

function render() {
  document.documentElement.dataset.theme = ui.data?.store?.theme || 'light';
  document.body.classList.toggle('nav-open', ui.mobileNav);
  if (!ui.data) { app.innerHTML = renderSetup(); bind(); return; }
  if (!currentUser()) { app.innerHTML = renderLogin(); bind(); return; }
  app.innerHTML = `${renderShell()}${ui.modal ? renderModal() : ''}`;
  bind();
}

function renderSetup() {
  return `<main class="auth-shell"><div class="auth-decoration"><div class="auth-orbit orbit-a"></div><div class="auth-orbit orbit-b"></div><div class="auth-message"><div class="brand-mark large">P</div><span class="eyebrow light">POINT OF SALE WORKSPACE</span><h1>Kelola toko dengan lebih <em>terarah.</em></h1><p>Satu tempat untuk transaksi, stok, shift, pengeluaran, dan laporan harian.</p><div class="auth-points"><span>${icon('shield', 16)} Data demo tersimpan di perangkat</span><span>${icon('package', 16)} Stok dan transaksi saling terhubung</span><span>${icon('chart', 16)} Ringkasan operasional yang jelas</span></div></div><div class="auth-decoration-footer">POS TERPADU Â· LOCAL DEMO</div></div><section class="auth-panel"><div class="auth-panel-inner"><div class="mobile-brand"><div class="brand-mark">P</div><b>POS Terpadu</b></div><span class="eyebrow">PENGATURAN AWAL</span><h2>Buat ruang kerja toko</h2><p class="auth-lead">Isi informasi dasar untuk membuat workspace pertama. PIN ini digunakan untuk masuk ke mode demo lokal.</p><form id="setup-form" class="form-grid">${textInput('storeName', 'Nama toko', 'Warung Saya')}${textInput('ownerName', 'Nama Owner', '', true, 'Nama lengkap')}${textInput('ownerUsername', 'Username Owner', 'owner', true, 'huruf kecil tanpa spasi')}<div class="field"><span>PIN Owner <b>*</b></span><input id="ownerPin" name="ownerPin" inputmode="numeric" type="password" minlength="4" maxlength="6" pattern="[0-9]{4,6}" required placeholder="4â€“6 digit" /><small>Gunakan PIN milikmu sendiri. Tidak ada PIN bawaan.</small></div><label class="check-row"><input type="checkbox" id="sampleData" checked/><span><b>Isi data contoh</b><small>Tambahkan produk, transaksi, stok, dan shift simulasi agar dashboard langsung terisi.</small></span></label><button class="btn btn-primary btn-wide" type="submit">Buat workspace ${icon('arrow', 17)}</button></form><div class="auth-note">Mode Lokal Demo Â· Data tersimpan di browser ini, belum terhubung ke server atau Supabase.</div></div></section></main>`;
}

function renderLogin() {
  const users = ui.data.users.filter((user) => user.is_active);
  return `<main class="auth-shell"><div class="auth-decoration"><div class="auth-orbit orbit-a"></div><div class="auth-orbit orbit-b"></div><div class="auth-message"><div class="brand-mark large">P</div><span class="eyebrow light">SELAMAT DATANG KEMBALI</span><h1>Ritme usaha tetap <em>terjaga.</em></h1><p>Masuk untuk melanjutkan aktivitas operasional toko.</p><div class="auth-points"><span>${icon('store', 16)} ${escapeHtml(ui.data.store.name)}</span><span>${icon('shield', 16)} Akses berdasarkan peran pengguna</span></div></div><div class="auth-decoration-footer">POS TERPADU Â· LOCAL DEMO</div></div><section class="auth-panel"><div class="auth-panel-inner"><div class="mobile-brand"><div class="brand-mark">P</div><b>POS Terpadu</b></div><span class="eyebrow">MASUK WORKSPACE</span><h2>Masuk ke toko</h2><p class="auth-lead">Pilih akun dan masukkan PIN yang dibuat saat pengaturan awal.</p><form id="login-form" class="form-grid">${selectInput('loginUser', 'Pilih akun', users.map((user) => [user.id, `${user.full_name} Â· ${user.role === 'owner' ? 'Owner' : 'Kasir'}`]), users[0]?.id || '')}<div class="field"><span>PIN <b>*</b></span><input id="loginPin" name="loginPin" type="password" inputmode="numeric" minlength="4" maxlength="6" required placeholder="Masukkan PIN" /></div><button class="btn btn-primary btn-wide" type="submit">Masuk ${icon('arrow', 17)}</button></form><div class="auth-note">Mode Lokal Demo Â· Jangan gunakan data sensitif atau operasional produksi pada mode ini.</div><button class="btn btn-ghost btn-wide" data-action="back-setup">Reset workspace demo di perangkat ini</button></div></section></main>`;
}

const navGroups = [
  { label: 'Operasional', items: [['dashboard', 'Ringkasan', 'grid'], ['pos', 'Kasir / POS', 'cart'], ['transactions', 'Transaksi', 'receipt'], ['shifts', 'Shift kasir', 'clock']] },
  { label: 'Manajemen', items: [['products', 'Produk', 'package'], ['inventory', 'Persediaan', 'boxes'], ['expenses', 'Pengeluaran', 'wallet']] },
  { label: 'Analisis & Toko', items: [['reports', 'Laporan', 'chart'], ['employees', 'Karyawan', 'users'], ['settings', 'Pengaturan', 'settings']] },
];
const allowedView = (view) => {
  if (isOwner()) return true;
  if (['pos', 'transactions', 'shifts'].includes(view)) return true;
  return view === 'expenses' && Boolean(ui.data?.store?.cashier_expense_permission);
};
function renderShell() {
  if (!allowedView(ui.view)) ui.view = 'pos';
  const user = currentUser();
  const active = activeShift();
  const nav = navGroups.map((group) => `<div class="nav-group"><div class="nav-label">${group.label}</div>${group.items.filter(([view]) => isOwner() || ['pos', 'transactions', 'shifts'].includes(view) || (view === 'expenses' && ui.data.store.cashier_expense_permission)).map(([view, label, ico]) => `<button class="nav-link ${ui.view === view ? 'active' : ''}" data-view="${view}">${icon(ico, 18)}<span>${label}</span>${view === 'pos' && ui.cart.length ? `<b class="nav-count">${ui.cart.reduce((sum, item) => sum + item.quantity, 0)}</b>` : ''}</button>`).join('')}</div>`).join('');
  return `<div class="app-shell"><div class="mobile-overlay" data-action="close-nav"></div><aside class="sidebar ${ui.mobileNav ? 'show' : ''}"><div class="brand-lockup"><div class="brand-mark">P</div><div><b>POS Terpadu</b><small>Retail workspace</small></div><button class="icon-btn sidebar-close" data-action="close-nav" aria-label="Tutup menu">${icon('close', 18)}</button></div><div class="workspace-selector"><div class="workspace-icon">${icon('store', 17)}</div><div><b>${escapeHtml(ui.data.store.name)}</b><small>Workspace lokal</small></div><span class="workspace-dot"></span></div><nav>${nav}</nav><div class="sidebar-bottom"><div class="side-status"><span class="status-dot"></span><div><b>${active ? 'Shift sedang aktif' : 'Belum ada shift aktif'}</b><small>${active ? `Dibuka ${dateTime(active.opened_at)}` : 'Buka shift untuk mulai kasir'}</small></div></div><div class="side-profile">${initialsIcon(user.full_name, 'sidebar-avatar')}<div class="profile-meta"><b>${escapeHtml(user.full_name)}</b><small>${user.role === 'owner' ? 'Owner' : 'Kasir'}</small></div><button class="icon-btn side-logout" data-action="logout" aria-label="Keluar">${icon('logout', 17)}</button></div></div></aside><div class="workspace"><header class="topbar"><div class="topbar-left"><button class="icon-btn mobile-menu-btn" data-action="open-nav" aria-label="Buka menu">${icon('menu', 19)}</button><div class="breadcrumb"><span>Workspace</span>${icon('chevron', 13)}<b>${navGroups.flatMap((g) => g.items).find((item) => item[0] === ui.view)?.[1] || 'Ringkasan'}</b></div></div><div class="topbar-right"><div class="connection-pill"><span class="status-dot"></span><span>Mode Demo Lokal</span></div><button class="icon-btn theme-toggle" data-action="toggle-theme" aria-label="Ubah tema">${icon(ui.data.store.theme === 'dark' ? 'sun' : 'moon', 17)}</button><div class="top-profile">${initialsIcon(user.full_name)}<div><b>${escapeHtml(user.full_name)}</b><small>${user.role === 'owner' ? 'Owner' : 'Kasir'}</small></div></div></div></header><main class="main-content">${renderView()}</main></div>${ui.modal ? renderModal() : ''}</div>`;
}

function renderView() {
  const views = { dashboard: renderDashboard, pos: renderPOS, products: renderProducts, inventory: renderInventory, transactions: renderTransactions, shifts: renderShifts, expenses: renderExpenses, reports: renderReports, employees: renderEmployees, settings: renderSettings };
  return (views[ui.view] || renderDashboard)();
}

function renderDashboard() {
  const today = dateKey();
  const paid = ui.data.sales.filter((sale) => sale.status === 'completed' && sale.payment.status === 'paid' && dateKey(sale.completed_at || sale.created_at) === today);
  const omzet = paid.reduce((sum, sale) => sum + sale.grand_total, 0);
  const cogs = paid.reduce((sum, sale) => sum + sale.items.reduce((value, item) => value + item.unit_cost * item.quantity, 0), 0);
  const expenseToday = ui.data.expenses.filter((expense) => expense.status === 'active' && dateKey(expense.occurred_at) === today).reduce((sum, expense) => sum + expense.amount, 0);
  const lowStock = ui.data.products.filter((product) => product.is_active && product.stock_qty <= product.min_stock);
  const shift = activeShift();
  const sales7 = Array.from({ length: 7 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - (6 - index)); const key = dateKey(date); const sum = ui.data.sales.filter((sale) => sale.status === 'completed' && dateKey(sale.completed_at || sale.created_at) === key).reduce((a, sale) => a + sale.grand_total, 0); return { key, label: new Intl.DateTimeFormat('id-ID', { weekday: 'short' }).format(date), sum }; });
  const maxSales = Math.max(...sales7.map((day) => day.sum), 1);
  const recent = [...ui.data.sales].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
  const profit = omzet - cogs;
  return `${pageTitle('Ringkasan usaha', 'Pantau performa penjualan dan kondisi operasional toko.', `<span class="date-chip">${icon('calendar', 15)} ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'full' }).format(new Date())}</span>`)}
  ${!shift ? `<div class="notice notice-warning">${icon('alert', 18)}<div><b>Belum ada shift aktif</b><span>Buka shift untuk mulai menerima transaksi melalui kasir.</span></div>${button('Buka shift', 'open-shift', 'btn primary sm')}</div>` : ''}
  <div class="metric-grid"><article class="metric-card metric-highlight"><div class="metric-top"><span>Omzet hari ini</span><span class="metric-icon blue">${icon('wallet', 18)}</span></div><strong>${rupiah(omzet)}</strong><small>${paid.length} transaksi lunas hari ini</small><div class="metric-spark spark-blue"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></article><article class="metric-card"><div class="metric-top"><span>Laba kotor</span><span class="metric-icon green">${icon('chart', 18)}</span></div><strong>${rupiah(profit)}</strong><small>Omzet dikurangi HPP</small><div class="metric-foot positive">${icon('arrowUp', 13)} Berdasarkan transaksi lunas</div></article><article class="metric-card"><div class="metric-top"><span>Pengeluaran hari ini</span><span class="metric-icon amber">${icon('receipt', 18)}</span></div><strong>${rupiah(expenseToday)}</strong><small>Pengeluaran aktif hari ini</small><div class="metric-foot">Tunai & non-tunai</div></article><article class="metric-card"><div class="metric-top"><span>Produk stok rendah</span><span class="metric-icon red">${icon('package', 18)}</span></div><strong>${number(lowStock.length)} <em>produk</em></strong><small>Stok menyentuh batas minimum</small><button class="metric-link" data-view="inventory">Lihat persediaan ${icon('arrow', 13)}</button></article></div>
  <div class="dashboard-grid"><div class="dashboard-main">${card(`<div class="card-heading"><div><h3>Tren penjualan</h3><p>Penjualan yang lunas selama 7 hari terakhir</p></div><span class="soft-label">7 hari</span></div><div class="chart-legend"><span><i class="legend-dot"></i> Omzet</span><b>${rupiah(sales7.reduce((sum, day) => sum + day.sum, 0))}</b></div><div class="bar-chart">${sales7.map((day) => `<div class="bar-column"><div class="bar-tooltip">${rupiah(day.sum)}</div><div class="bar-outer"><div class="bar-inner ${day.key === today ? 'today' : ''}" style="height:${Math.max(4, percent(day.sum, maxSales))}%"></div></div><small>${day.label}</small></div>`).join('')}</div>`, 'chart-card')}
  ${card(`<div class="card-heading"><div><h3>Transaksi terbaru</h3><p>Aktivitas penjualan terakhir di toko</p></div><button class="text-action" data-view="transactions">Semua transaksi ${icon('arrow', 13)}</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Invoice</th><th>Kasir</th><th>Metode</th><th>Status</th><th class="align-right">Total</th></tr></thead><tbody>${recent.map((sale) => `<tr><td><b class="mono">${escapeHtml(sale.invoice_no)}</b><small>${dateTime(sale.created_at)}</small></td><td>${escapeHtml(getUserName(sale.cashier_id))}</td><td>${methodLabel(sale.payment.method)}</td><td>${statusBadge(sale.status)}</td><td class="align-right money">${rupiah(sale.grand_total)}</td></tr>`).join('') || `<tr><td colspan="5"><div class="empty-state compact">Belum ada transaksi.</div></td></tr>`}</tbody></table></div>`, 'table-card')}</div>
  <div class="dashboard-side">${card(`<div class="card-heading"><div><h3>Ringkasan shift</h3><p>${shift ? `Dibuka ${dateTime(shift.opened_at)}` : 'Belum ada shift berjalan'}</p></div>${statusBadge(shift ? 'open' : 'closed')}</div>${shift ? `<div class="shift-total"><small>Kas diharapkan</small><strong>${rupiah(expectedCash(shift))}</strong></div><div class="mini-stats"><div><span>Kas awal</span><b>${rupiah(shift.opening_cash)}</b></div><div><span>Penjualan tunai</span><b>${rupiah(shift.cash_sales)}</b></div><div><span>Penjualan non-tunai</span><b>${rupiah(shift.non_cash_sales)}</b></div><div><span>Pengeluaran tunai</span><b>${rupiah(shift.cash_expenses)}</b></div></div>${button('Lihat detail shift', 'go-shifts', 'btn secondary wide')} ` : `${button('Buka shift sekarang', 'open-shift', 'btn primary wide')}`}`, 'side-card')}
  ${card(`<div class="card-heading"><div><h3>Perlu perhatian</h3><p>Produk yang perlu dicek stoknya</p></div><span class="count-badge">${lowStock.length}</span></div><div class="low-list">${lowStock.slice(0, 5).map((product) => `<div class="low-item"><span class="product-symbol" style="--product-tint:${product.color || '#eaf0f8'}">${icon('package', 17)}</span><div><b>${escapeHtml(product.name)}</b><small>Min. ${number(product.min_stock)} ${escapeHtml(product.unit || 'pcs')}</small></div><strong>${number(product.stock_qty)}</strong></div>`).join('') || `<div class="empty-state compact">Semua stok berada di atas batas minimum.</div>`}</div><button class="text-action full-action" data-view="inventory">Kelola persediaan ${icon('arrow', 13)}</button>`, 'side-card')}
  </div></div>`;
}

function productCard(product) {
  const category = ui.data.categories.find((entry) => entry.id === product.category_id)?.name || 'Tanpa kategori';
  const low = product.stock_qty <= product.min_stock;
  const out = product.stock_qty <= 0;
  const inCart = ui.cart.find((entry) => entry.product_id === product.id)?.quantity || 0;
  return `<button class="product-card ${out ? 'disabled' : ''} ${inCart ? 'selected' : ''}" data-action="add-cart" data-id="${product.id}" ${out || !activeShift() ? 'disabled' : ''}><div class="product-visual" style="--product-tint:${product.color || '#eaf0f8'}"><span>${escapeHtml(product.name.slice(0, 1).toUpperCase())}</span>${inCart ? `<i class="cart-counter">${inCart}</i>` : ''}</div><div class="product-info"><small>${escapeHtml(category)}</small><b>${escapeHtml(product.name)}</b><strong>${rupiah(product.selling_price)}</strong><span class="stock-hint ${out ? 'out' : low ? 'low' : ''}">${out ? 'Stok habis' : `Stok ${number(product.stock_qty)} ${low ? 'Â· Menipis' : ''}`}</span></div></button>`;
}

function renderPOS() {
  const products = ui.data.products.filter((product) => product.is_active && (ui.category === 'all' || product.category_id === ui.category) && (!ui.search || `${product.name} ${product.sku}`.toLowerCase().includes(ui.search.toLowerCase())));
  const categories = ui.data.categories.filter((category) => category.is_active);
  const total = cartTotal();
  const qty = ui.cart.reduce((sum, item) => sum + item.quantity, 0);
  const shift = activeShift();
  return `${pageTitle('Kasir / POS', 'Pilih produk, atur jumlah, dan selesaikan pembayaran.', `<div class="shift-chip ${shift ? 'live' : 'off'}"><span class="status-dot"></span>${shift ? 'Shift aktif' : 'Shift belum dibuka'}</div>`)}
  ${!shift ? `<div class="notice notice-warning">${icon('alert', 18)}<div><b>Transaksi belum dapat dilakukan</b><span>Kasir wajib memiliki shift aktif. Buka shift untuk melanjutkan.</span></div>${button('Buka shift', 'open-shift', 'btn primary sm')}</div>` : ''}
  <div class="pos-layout"><section class="pos-catalog"><div class="catalog-toolbar"><label class="search-box">${icon('search', 18)}<input id="pos-search" type="search" placeholder="Cari nama produk atau SKU..." value="${escapeHtml(ui.search)}" autocomplete="off"/><kbd>Ctrl K</kbd></label><button class="icon-btn filter-button" data-action="clear-search" title="Reset pencarian">${icon('filter', 17)}</button></div><div class="category-tabs"><button class="category-tab ${ui.category === 'all' ? 'active' : ''}" data-action="category-filter" data-id="all">Semua produk</button>${categories.map((category) => `<button class="category-tab ${ui.category === category.id ? 'active' : ''}" data-action="category-filter" data-id="${category.id}">${escapeHtml(category.name)}</button>`).join('')}</div><div class="catalog-summary"><b>${products.length} produk</b><span>Harga jual Â· Stok tersedia</span></div><div class="product-grid" id="product-grid">${products.map(productCard).join('') || `<div class="empty-state">${icon('search', 24)}<b>Produk tidak ditemukan</b><span>Coba kata kunci atau kategori lain.</span></div>`}</div></section><aside class="cart-panel"><div class="cart-head"><div><h3>Keranjang</h3><p>${qty} item dipilih</p></div><button class="icon-btn" data-action="clear-cart" title="Kosongkan keranjang" ${!ui.cart.length ? 'disabled' : ''}>${icon('trash', 17)}</button></div><div class="cart-items">${ui.cart.length ? ui.cart.map((item) => { const product = ui.data.products.find((entry) => entry.id === item.product_id); return `<div class="cart-item"><div class="cart-product-icon" style="--product-tint:${product?.color || '#eaf0f8'}">${escapeHtml((product?.name || item.name)[0].toUpperCase())}</div><div class="cart-product-text"><b>${escapeHtml(product?.name || item.name)}</b><small>${rupiah(product?.selling_price || item.price)} / pcs</small><div class="qty-control"><button data-action="cart-minus" data-id="${item.product_id}" aria-label="Kurangi jumlah">${icon('minus', 13)}</button><b>${item.quantity}</b><button data-action="cart-plus" data-id="${item.product_id}" aria-label="Tambah jumlah" ${product && item.quantity >= product.stock_qty ? 'disabled' : ''}>${icon('plus', 13)}</button></div></div><strong>${rupiah((product?.selling_price || item.price) * item.quantity)}</strong></div>`; }).join('') : `<div class="cart-empty"><div class="cart-empty-icon">${icon('cart', 28)}</div><b>Keranjang masih kosong</b><span>Pilih produk untuk memulai transaksi.</span></div>`}</div><div class="cart-footer"><div class="cart-total-line"><span>Subtotal</span><b>${rupiah(total)}</b></div><div class="cart-total-line"><span>Diskon</span><b>Rp 0</b></div><div class="cart-grand"><span>Total pembayaran</span><strong>${rupiah(total)}</strong></div><button class="btn primary wide checkout-button" data-action="open-checkout" ${!ui.cart.length || !shift ? 'disabled' : ''}>Lanjut pembayaran ${icon('arrow', 17)}</button><small class="cart-footnote">Pembayaran pending tidak mengurangi stok sampai diverifikasi.</small></div></aside></div>`;
}

function cartTotal() { return ui.cart.reduce((sum, item) => { const product = ui.data.products.find((entry) => entry.id === item.product_id); return sum + Number(product?.selling_price || 0) * item.quantity; }, 0); }

function renderProducts() {
  const term = (ui.productSearch || '').toLowerCase();
  const products = ui.data.products.filter((product) => (!term || `${product.name} ${product.sku}`.toLowerCase().includes(term)) && (ui.productStatus === 'all' || (ui.productStatus === 'active' ? product.is_active : !product.is_active)));
  const low = products.filter((product) => product.is_active && product.stock_qty <= product.min_stock).length;
  return `${pageTitle('Produk', 'Kelola katalog, harga jual, HPP, dan status produk.', `${button(`${icon('plus', 16)} Tambah produk`, 'add-product', 'btn primary')}`)}
  <div class="summary-strip"><div><span>Produk aktif</span><b>${ui.data.products.filter((p) => p.is_active).length}</b></div><div><span>Stok rendah</span><b class="text-warning">${low}</b></div><div><span>Kategori aktif</span><b>${ui.data.categories.filter((c) => c.is_active).length}</b></div><div><span>Total item stok</span><b>${number(ui.data.products.filter((p) => p.is_active).reduce((a, p) => a + p.stock_qty, 0))}</b></div></div>
  ${card(`<div class="table-toolbar"><label class="search-box small-search">${icon('search', 16)}<input id="product-search" type="search" placeholder="Cari nama produk / SKU" value="${escapeHtml(ui.productSearch || '')}"/></label><div class="toolbar-actions">${selectInput('product-status', 'Status', [['all', 'Semua status'], ['active', 'Aktif'], ['archived', 'Diarsipkan']], ui.productStatus || 'all', false).replace('class="field"', 'class="inline-field"')}${button(`${icon('plus', 15)} Kategori`, 'add-category', 'btn secondary')}${button('Kelola kategori', 'manage-category', 'btn secondary small')}</div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Produk</th><th>SKU</th><th>Kategori</th><th class="align-right">Harga jual</th><th class="align-right">HPP</th><th class="align-right">Stok</th><th>Status</th><th></th></tr></thead><tbody>${products.map((product) => `<tr><td><div class="product-table-cell"><span class="tiny-product" style="--product-tint:${product.color}">${escapeHtml(product.name[0])}</span><div><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.unit || 'pcs')}</small></div></div></td><td class="mono">${escapeHtml(product.sku || 'â€”')}</td><td>${escapeHtml(ui.data.categories.find((category) => category.id === product.category_id)?.name || 'â€”')}</td><td class="align-right money">${rupiah(product.selling_price)}</td><td class="align-right">${rupiah(product.cost_price)}</td><td class="align-right"><b>${number(product.stock_qty)}</b></td><td>${product.is_active ? (product.stock_qty <= product.min_stock ? badge('Stok rendah', 'warning') : badge('Aktif', 'success')) : badge('Diarsipkan', 'neutral')}</td><td><div class="row-actions"><button class="icon-btn" data-action="edit-product" data-id="${product.id}" title="Edit">${icon('edit', 15)}</button><button class="icon-btn" data-action="toggle-product" data-id="${product.id}" title="${product.is_active ? 'Arsipkan' : 'Aktifkan'}">${icon(product.is_active ? 'trash' : 'check', 15)}</button></div></td></tr>`).join('') || `<tr><td colspan="8"><div class="empty-state compact">Produk belum tersedia.</div></td></tr>`}</tbody></table></div><div class="table-foot"><span>Menampilkan ${products.length} produk</span><span>Data disimpan pada perangkat ini</span></div>`, 'table-card')}`;
}

function renderInventory() {
  const products = ui.data.products.filter((product) => product.is_active);
  const low = products.filter((product) => product.stock_qty <= product.min_stock);
  const movements = ui.data.stock_movements.slice(0, 12);
  return `${pageTitle('Persediaan', 'Pantau stok, batas minimum, dan riwayat mutasi barang.', `${button(`${icon('plus', 16)} Penyesuaian stok`, 'adjust-stock', 'btn primary')}`)}
  <div class="summary-strip"><div><span>SKU aktif</span><b>${products.length}</b></div><div><span>Stok rendah</span><b class="text-warning">${low.length}</b></div><div><span>Stok habis</span><b class="text-danger">${products.filter((p) => p.stock_qty === 0).length}</b></div><div><span>Nilai modal stok</span><b>${rupiah(products.reduce((sum, p) => sum + p.stock_qty * p.cost_price, 0))}</b></div></div>
  <div class="split-grid"><div>${card(`<div class="card-heading"><div><h3>Ringkasan stok</h3><p>Daftar produk aktif dan status persediaannya</p></div><span class="soft-label">${products.length} SKU</span></div><div class="inventory-list">${products.map((product) => `<div class="inventory-row"><span class="tiny-product" style="--product-tint:${product.color}">${escapeHtml(product.name[0])}</span><div class="inventory-name"><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.sku || 'Tanpa SKU')} Â· Min. ${product.min_stock}</small></div><div class="inventory-bar-wrap"><div class="inventory-bar"><i class="${product.stock_qty <= product.min_stock ? 'warning' : ''}" style="width:${Math.min(100, product.stock_qty / Math.max(product.min_stock * 2, 1) * 100)}%"></i></div><small>${product.stock_qty <= product.min_stock ? 'Perlu restock' : 'Stok aman'}</small></div><strong class="inventory-qty ${product.stock_qty <= product.min_stock ? 'text-warning' : ''}">${number(product.stock_qty)}</strong><button class="icon-btn" data-action="adjust-one" data-id="${product.id}" title="Sesuaikan stok">${icon('edit', 15)}</button></div>`).join('') || `<div class="empty-state">Belum ada produk aktif.</div>`}</div>`, 'panel-card')}</div><div>${card(`<div class="card-heading"><div><h3>Perlu restock</h3><p>Stok sama dengan atau di bawah minimum</p></div><span class="count-badge">${low.length}</span></div>${low.map((product) => `<div class="restock-item"><div><b>${escapeHtml(product.name)}</b><small>SKU ${escapeHtml(product.sku || 'â€”')}</small></div><span>${product.stock_qty} / ${product.min_stock}</span></div>`).join('') || `<div class="empty-state compact">Tidak ada stok rendah.</div>`}`, 'panel-card')}</div></div>
  ${card(`<div class="card-heading"><div><h3>Mutasi stok terbaru</h3><p>Riwayat perubahan stok tidak dapat dihapus</p></div><span class="soft-label">12 aktivitas</span></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Waktu</th><th>Produk</th><th>Jenis mutasi</th><th>Alasan / referensi</th><th class="align-right">Perubahan</th><th class="align-right">Saldo akhir</th></tr></thead><tbody>${movements.map((movement) => { const product = ui.data.products.find((p) => p.id === movement.product_id); return `<tr><td>${dateTime(movement.created_at)}</td><td><b>${escapeHtml(product?.name || 'Produk diarsipkan')}</b></td><td>${escapeHtml(({ sale: 'Penjualan', adjustment_in: 'Stok masuk', adjustment_out: 'Stok keluar', void_return: 'Pengembalian void' }[movement.movement_type] || movement.movement_type))}</td><td>${escapeHtml(movement.note || movement.reference_type || 'â€”')}</td><td class="align-right ${movement.qty_change > 0 ? 'text-success' : 'text-danger'}">${movement.qty_change > 0 ? '+' : ''}${movement.qty_change}</td><td class="align-right">${movement.stock_after}</td></tr>`; }).join('') || `<tr><td colspan="6"><div class="empty-state compact">Belum ada mutasi stok.</div></td></tr>`}</tbody></table></div>`, 'table-card')}`;
}

function renderTransactions() {
  const sales = filteredSales();
  const owner = isOwner();
  const visibleSales = owner ? ui.data.sales : ui.data.sales.filter((sale) => sale.cashier_id === ui.userId);
  return `${pageTitle('Transaksi', 'Telusuri invoice, status pembayaran, dan detail penjualan.', `<button class="btn secondary" data-action="export-transactions">${icon('download', 15)} Ekspor CSV</button>`)}
  <div class="summary-strip"><div><span>Total transaksi</span><b>${visibleSales.length}</b></div><div><span>Lunas</span><b class="text-success">${visibleSales.filter((s) => s.status === 'completed').length}</b></div><div><span>Pending</span><b class="text-warning">${visibleSales.filter((s) => s.status === 'pending_payment').length}</b></div><div><span>Gagal / Void</span><b>${visibleSales.filter((s) => ['failed', 'voided'].includes(s.status)).length}</b></div></div>
  ${card(`<div class="table-toolbar"><label class="search-box small-search">${icon('search', 16)}<input id="tx-search" type="search" placeholder="Cari nomor invoice atau kasir" value="${escapeHtml(ui.txSearch)}"/></label>${selectInput('tx-status', 'Status pembayaran', [['all', 'Semua status'], ['completed', 'Lunas'], ['pending_payment', 'Pending'], ['failed', 'Gagal'], ['voided', 'Void']], ui.txStatus, false).replace('class="field"', 'class="inline-field"')}</div><div class="table-scroll"><table class="data-table"><thead><tr><th>Invoice</th><th>Tanggal</th><th>Kasir</th><th>Metode</th><th>Status pembayaran</th><th class="align-right">Total</th><th></th></tr></thead><tbody>${sales.filter((sale) => owner || sale.cashier_id === ui.userId).map((sale) => `<tr><td><b class="mono">${escapeHtml(sale.invoice_no)}</b><small>${sale.items.length} item produk</small></td><td>${dateTime(sale.created_at)}</td><td>${escapeHtml(getUserName(sale.cashier_id))}</td><td>${methodLabel(sale.payment.method)}</td><td>${statusBadge(sale.status)}</td><td class="align-right money">${rupiah(sale.grand_total)}</td><td><button class="btn small" data-action="sale-detail" data-id="${sale.id}">Detail</button></td></tr>`).join('') || `<tr><td colspan="7"><div class="empty-state compact">Tidak ada transaksi yang cocok dengan filter.</div></td></tr>`}</tbody></table></div><div class="table-foot"><span>${sales.length} transaksi ditemukan</span><span>Transaksi selesai tidak dapat diedit langsung.</span></div>`, 'table-card')}`;
}

function renderShifts() {
  const shifts = isOwner() ? ui.data.shifts : ui.data.shifts.filter((shift) => shift.cashier_id === ui.userId);
  const open = shifts.filter((shift) => shift.status === 'open');
  const closed = shifts.filter((shift) => shift.status === 'closed');
  return `${pageTitle('Shift kasir', 'Kelola kas awal, pergerakan kas, dan rekonsiliasi akhir shift.', `${activeShift() ? button('Tutup shift', 'close-shift', 'btn primary') : button(`${icon('plus', 16)} Buka shift`, 'open-shift', 'btn primary')}`)}
  <div class="summary-strip"><div><span>Shift aktif</span><b>${open.length}</b></div><div><span>Shift ditutup</span><b>${closed.length}</b></div><div><span>Kas awal aktif</span><b>${rupiah(open.reduce((sum, s) => sum + s.opening_cash, 0))}</b></div><div><span>Kas diharapkan</span><b>${rupiah(open.reduce((sum, s) => sum + expectedCash(s), 0))}</b></div></div>
  ${card(`<div class="card-heading"><div><h3>Riwayat shift</h3><p>Setiap shift menyimpan perhitungan kas dan selisih</p></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Kasir</th><th>Mulai</th><th>Selesai</th><th>Status</th><th class="align-right">Kas awal</th><th class="align-right">Kas diharapkan</th><th class="align-right">Kas aktual / selisih</th><th></th></tr></thead><tbody>${shifts.map((shift) => `<tr><td><b>${escapeHtml(getUserName(shift.cashier_id))}</b></td><td>${dateTime(shift.opened_at)}</td><td>${dateTime(shift.closed_at)}</td><td>${statusBadge(shift.status)}</td><td class="align-right">${rupiah(shift.opening_cash)}</td><td class="align-right money">${rupiah(shift.status === 'open' ? expectedCash(shift) : shift.expected_cash)}</td><td class="align-right">${shift.status === 'closed' ? `<b>${rupiah(shift.counted_cash)}</b><small class="${shift.cash_difference < 0 ? 'text-danger' : shift.cash_difference > 0 ? 'text-warning' : 'text-success'}">${shift.cash_difference > 0 ? '+' : ''}${rupiah(shift.cash_difference)}</small>` : 'â€”'}</td><td>${shift.status === 'open' && shift.cashier_id === ui.userId ? `<button class="btn small" data-action="close-shift">Tutup</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="8"><div class="empty-state compact">Belum ada riwayat shift.</div></td></tr>`}</tbody></table></div>`, 'table-card')}`;
}

function renderExpenses() {
  const canManage = isOwner() || ui.data.store.cashier_expense_permission;
  const rows = ui.data.expenses.filter((expense) => isOwner() || expense.created_by === ui.userId).sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
  const total = rows.filter((e) => e.status === 'active').reduce((sum, e) => sum + e.amount, 0);
  const cash = rows.filter((e) => e.status === 'active' && e.payment_method === 'cash').reduce((sum, e) => sum + e.amount, 0);
  return `${pageTitle('Pengeluaran', 'Catat biaya operasional dan lihat pengaruhnya pada kas shift.', `${canManage ? button(`${icon('plus', 16)} Catat pengeluaran`, 'add-expense', 'btn primary') : ''}`)}
  <div class="summary-strip"><div><span>Pengeluaran aktif</span><b>${rupiah(total)}</b></div><div><span>Pengeluaran tunai</span><b>${rupiah(cash)}</b></div><div><span>Non-tunai</span><b>${rupiah(total - cash)}</b></div><div><span>Catatan tercatat</span><b>${rows.length}</b></div></div>
  ${card(`<div class="card-heading"><div><h3>Daftar pengeluaran</h3><p>Void digunakan untuk koreksi; riwayat tidak dihapus.</p></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Keterangan</th><th>Kategori</th><th>Tanggal</th><th>Metode</th><th>Status</th><th class="align-right">Nominal</th><th></th></tr></thead><tbody>${rows.map((expense) => `<tr><td><b>${escapeHtml(expense.title)}</b><small>${escapeHtml(expense.notes || 'Tanpa catatan')}</small></td><td>${escapeHtml(ui.data.expense_categories.find((c) => c.id === expense.category_id)?.name || 'â€”')}</td><td>${dateTime(expense.occurred_at)}</td><td>${methodLabel(expense.payment_method)}</td><td>${statusBadge(expense.status === 'active' ? 'active' : 'voided')}</td><td class="align-right money">${rupiah(expense.amount)}</td><td>${expense.status === 'active' && canManage ? `<div class="row-actions"><button class="icon-btn" data-action="edit-expense" data-id="${expense.id}" title="Edit">${icon('edit', 15)}</button>${isOwner() ? `<button class="icon-btn" data-action="void-expense" data-id="${expense.id}" title="Void">${icon('trash', 15)}</button>` : ''}</div>` : 'â€”'}</td></tr>`).join('') || `<tr><td colspan="7"><div class="empty-state compact">Belum ada pengeluaran.</div></td></tr>`}</tbody></table></div>`, 'table-card')}`;
}

function renderReports() {
  if (!isOwner()) return `${pageTitle('Laporan tidak tersedia', 'Akses laporan lengkap hanya dimiliki Owner.')}${card('<div class="empty-state">Hubungi Owner untuk melihat laporan usaha.</div>')}`;
  const range = rangeForPeriod(ui.period);
  const report = computeReport(ui.data, range.start, range.end);
  const maxPayment = Math.max(...report.paymentMix.map((p) => p.amount), 1);
  return `${pageTitle('Laporan', 'Analisis omzet, HPP, laba kotor, dan pengeluaran usaha.', `<button class="btn secondary" data-action="print-report">${icon('download', 15)} Cetak / PDF</button>`)}
  <div class="report-filter">${selectInput('report-period', 'Periode laporan', [['today', 'Hari ini'], ['7d', '7 hari terakhir'], ['30d', '30 hari terakhir']], ui.period, false).replace('class="field"', 'class="inline-field"')}<span>${shortDate(range.start)} â€” ${shortDate(range.end)} Â· Waktu lokal perangkat</span></div>
  <div class="metric-grid report-metrics"><article class="metric-card"><div class="metric-top"><span>Omzet lunas</span><span class="metric-icon blue">${icon('wallet', 18)}</span></div><strong>${rupiah(report.omzet)}</strong><small>${report.count} transaksi berhasil</small></article><article class="metric-card"><div class="metric-top"><span>HPP / COGS</span><span class="metric-icon amber">${icon('package', 18)}</span></div><strong>${rupiah(report.cogs)}</strong><small>Harga modal dari snapshot penjualan</small></article><article class="metric-card"><div class="metric-top"><span>Laba kotor</span><span class="metric-icon green">${icon('chart', 18)}</span></div><strong>${rupiah(report.grossProfit)}</strong><small>Omzet dikurangi HPP</small></article><article class="metric-card"><div class="metric-top"><span>Pengeluaran</span><span class="metric-icon red">${icon('receipt', 18)}</span></div><strong>${rupiah(report.totalExpenses)}</strong><small>Catatan pengeluaran aktif</small></article></div>
  <div class="report-layout"><div>${card(`<div class="card-heading"><div><h3>Rincian metode pembayaran</h3><p>Hanya pembayaran completed dan paid.</p></div></div><div class="payment-bars">${report.paymentMix.map((row) => `<div class="payment-row"><div><b>${methodLabel(row.method)}</b><strong>${rupiah(row.amount)}</strong></div><div class="progress-track"><i style="width:${percent(row.amount, maxPayment)}%"></i></div></div>`).join('')}</div>`, 'panel-card')}${card(`<div class="card-heading"><div><h3>Ringkasan transaksi</h3><p>Nilai finansial berdasarkan periode terpilih</p></div></div><div class="report-lines"><div><span>Jumlah transaksi lunas</span><b>${number(report.count)}</b></div><div><span>Rata-rata nilai transaksi</span><b>${rupiah(report.average)}</b></div><div><span>Laba kotor</span><b>${rupiah(report.grossProfit)}</b></div><div><span>Pengeluaran</span><b>${rupiah(report.totalExpenses)}</b></div><div class="report-grand"><span>Estimasi laba operasional</span><strong>${rupiah(report.operatingEstimate)}</strong></div></div>`, 'panel-card')}</div><aside>${card(`<div class="report-highlight"><span>Estimasi laba operasional</span><strong>${rupiah(report.operatingEstimate)}</strong><small>Laba kotor dikurangi pengeluaran tercatat. Bukan laporan akuntansi penuh.</small></div><div class="report-hint">${icon('info', 16)} <span>Transaksi Pending, Gagal, dan Void tidak dimasukkan ke omzet.</span></div>`, 'panel-card')}</aside></div>
  <div class="report-print-only"><h2>${escapeHtml(ui.data.store.name)} â€” Laporan Penjualan</h2><p>Periode ${range.start} sampai ${range.end}</p><p>Omzet ${rupiah(report.omzet)} Â· HPP ${rupiah(report.cogs)} Â· Laba kotor ${rupiah(report.grossProfit)} Â· Pengeluaran ${rupiah(report.totalExpenses)}</p></div>`;
}

function renderEmployees() {
  if (!isOwner()) return `${pageTitle('Karyawan', 'Akses hanya tersedia untuk Owner.')}${card('<div class="empty-state">Kamu tidak memiliki izin untuk halaman ini.</div>')}`;
  return `${pageTitle('Karyawan', 'Kelola akun kasir dan status akses workspace.', `${button(`${icon('plus', 16)} Tambah kasir`, 'add-employee', 'btn primary')}`)}
  <div class="summary-strip"><div><span>Total pengguna</span><b>${ui.data.users.length}</b></div><div><span>Owner</span><b>${ui.data.users.filter((u) => u.role === 'owner' && u.is_active).length}</b></div><div><span>Kasir aktif</span><b>${ui.data.users.filter((u) => u.role === 'cashier' && u.is_active).length}</b></div><div><span>Kasir nonaktif</span><b>${ui.data.users.filter((u) => u.role === 'cashier' && !u.is_active).length}</b></div></div>
  ${card(`<div class="card-heading"><div><h3>Daftar pengguna</h3><p>Setiap pengguna menggunakan PIN lokal yang dibuat oleh Owner.</p></div></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Pengguna</th><th>Username</th><th>Peran</th><th>Status</th><th>Shift aktif</th><th></th></tr></thead><tbody>${ui.data.users.map((user) => `<tr><td><div class="employee-cell">${initialsIcon(user.full_name)}<div><b>${escapeHtml(user.full_name)}</b><small>${user.id === ui.userId ? 'Akun aktif saat ini' : 'Pengguna lokal demo'}</small></div></div></td><td class="mono">${escapeHtml(user.username)}</td><td>${user.role === 'owner' ? badge('Owner', 'info') : badge('Kasir', 'neutral')}</td><td>${statusBadge(user.is_active ? 'active' : 'closed')}</td><td>${statusBadge(findOpenShift(ui.data, user.id) ? 'open' : 'closed')}</td><td>${user.role === 'cashier' ? `<div class="row-actions"><button class="icon-btn" data-action="edit-employee" data-id="${user.id}" title="Edit">${icon('edit', 15)}</button><button class="icon-btn" data-action="toggle-employee" data-id="${user.id}" title="${user.is_active ? 'Nonaktifkan' : 'Aktifkan'}">${icon(user.is_active ? 'logout' : 'check', 15)}</button></div>` : 'â€”'}</td></tr>`).join('')}</tbody></table></div>`, 'table-card')}
  <div class="notice notice-info">${icon('shield', 18)}<div><b>Batas keamanan mode lokal</b><span>PIN disimpan dengan derivasi PBKDF2 pada browser. Ini tidak menggantikan Supabase Auth, server-side authorization, atau RLS untuk penggunaan produksi.</span></div></div>`;
}

function renderSettings() {
  return `${pageTitle('Pengaturan', 'Kelola profil toko, tampilan, dan cadangan data.', `${button('Simpan pengaturan', 'save-settings', 'btn primary')}`)}
  <div class="settings-grid"><div>${card(`<div class="card-heading"><div><h3>Profil toko</h3><p>Informasi yang ditampilkan pada struk transaksi.</p></div></div><form id="store-form" class="form-grid">${textInput('settingStoreName', 'Nama toko', ui.data.store.name)}${textInput('settingPhone', 'Nomor telepon', ui.data.store.phone || '', false, 'Nomor kontak toko') }<label class="field full"><span>Alamat toko</span><textarea id="settingAddress" name="settingAddress" rows="3" placeholder="Alamat toko">${escapeHtml(ui.data.store.address || '')}</textarea></label>${selectInput('settingTimezone', 'Zona waktu', [['Asia/Pontianak', 'Asia/Pontianak'], ['Asia/Jakarta', 'Asia/Jakarta'], ['Asia/Makassar', 'Asia/Makassar'], ['Asia/Jayapura', 'Asia/Jayapura']], ui.data.store.timezone || 'Asia/Pontianak')}${selectInput('settingReceipt', 'Lebar struk', [['58', '58 mm'], ['80', '80 mm']], ui.data.store.receipt_width || '80')}</form>`, 'panel-card')}
  ${card(`<div class="card-heading"><div><h3>Preferensi perangkat</h3><p>Pengaturan tampilan dan izin lokal.</p></div></div><div class="setting-row"><div><b>Tema tampilan</b><small>Gunakan tampilan terang atau gelap.</small></div><div class="segmented"><button data-action="set-theme" data-value="light" class="${ui.data.store.theme === 'light' ? 'active' : ''}">${icon('sun', 14)} Terang</button><button data-action="set-theme" data-value="dark" class="${ui.data.store.theme === 'dark' ? 'active' : ''}">${icon('moon', 14)} Gelap</button></div></div>${isOwner() ? `<div class="setting-row"><div><b>Kasir boleh mencatat pengeluaran</b><small>Berikan izin membuat catatan pengeluaran shift.</small></div><label class="switch"><input id="cashierExpensePermission" type="checkbox" ${ui.data.store.cashier_expense_permission ? 'checked' : ''}/><span></span></label></div>` : ''}<div class="setting-row"><div><b>Mode penyimpanan</b><small>Data disimpan di browser perangkat ini.</small></div><span class="badge info">Local demo</span></div>`, 'panel-card')}</div><div>${card(`<div class="card-heading"><div><h3>Data & cadangan</h3><p>Jaga salinan data latihan tetap aman.</p></div></div><div class="backup-card"><div class="backup-icon">${icon('download', 22)}</div><div><b>Ekspor cadangan workspace</b><p>Unduh seluruh data lokal ke file JSON.</p></div><button class="btn btn-secondary btn-wide" data-action="export-backup">${icon('download', 15)} Unduh backup</button></div><div class="backup-card danger-zone"><div class="backup-icon danger">${icon('trash', 22)}</div><div><b>Reset workspace demo</b><p>Hapus data lokal dan mulai pengaturan awal lagi. Tindakan ini tidak dapat dibatalkan.</p></div><button class="btn btn-danger btn-wide" data-action="reset-workspace">Reset data lokal</button></div>`, 'panel-card')}
  ${card(`<div class="card-heading"><div><h3>Informasi aplikasi</h3><p>Ringkasan lingkungan yang sedang digunakan.</p></div></div><div class="info-list"><div><span>Versi aplikasi</span><b>1.0.0 Â· MVP Demo</b></div><div><span>Backend</span><b>Belum terhubung</b></div><div><span>Database lokal</span><b>Browser localStorage</b></div><div><span>Service worker</span><b>Aktif bila diakses via localhost / HTTPS</b></div></div>`, 'panel-card')}</div></div>`;
}

function renderModal() {
  const modal = ui.modal;
  let title = '', body = '', wide = false;
  switch (modal.type) {
    case 'open-shift':
      title = 'Buka shift kasir'; body = `<form id="open-shift-form" class="modal-body">${moneyInput('openingCash', 'Kas awal / modal laci', '0')}<div class="form-note">Shift akan terhubung ke akun <b>${escapeHtml(currentUser().full_name)}</b>. Pastikan nominal kas awal sudah dihitung.</div><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Batal</button><button class="btn primary" type="submit">Buka shift</button></div></form>`; break;
    case 'close-shift': {
      const shift = activeShift(); const expected = shift ? expectedCash(shift) : 0;
      title = 'Tutup shift'; body = `<form id="close-shift-form" class="modal-body"><div class="close-summary"><span>Kas diharapkan</span><strong>${rupiah(expected)}</strong><div><small>Kas awal ${rupiah(shift?.opening_cash || 0)}</small><small>Penjualan tunai ${rupiah(shift?.cash_sales || 0)}</small><small>Pengeluaran tunai âˆ’${rupiah(shift?.cash_expenses || 0)}</small><small>Refund tunai âˆ’${rupiah(shift?.cash_refunds || 0)}</small></div></div>${moneyInput('countedCash', 'Kas aktual hasil hitung', String(expected))}<div class="form-note">Selisih akan disimpan untuk rekonsiliasi. Sistem tidak akan memaksa selisih menjadi nol.</div><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Batal</button><button class="btn primary" type="submit">Konfirmasi tutup shift</button></div></form>`; break;
    }
    case 'checkout':
      title = 'Pembayaran transaksi'; wide = true; body = renderCheckoutModal(); break;
    case 'product': {
      const editing = modal.product; title = editing ? 'Edit produk' : 'Tambah produk';
      const product = editing || { name: '', sku: '', selling_price: '', cost_price: '', stock_qty: 0, min_stock: 5, category_id: ui.data.categories.find((c) => c.is_active)?.id || '', unit: 'pcs', color: '#E8EEF7' };
      body = `<form id="product-form" class="modal-body"><div class="form-grid">${textInput('productName', 'Nama produk', product.name)}${textInput('productSku', 'SKU / Barcode', product.sku || '', false, 'Contoh: MIN-001')}${moneyInput('productPrice', 'Harga jual', product.selling_price)}${moneyInput('productCost', 'HPP / Harga modal', product.cost_price)}${editing ? `<div class="field"><span>Stok saat ini</span><div class="readonly-value">${number(product.stock_qty)} ${escapeHtml(product.unit || 'pcs')}</div><small>Ubah stok melalui menu Persediaan agar tercatat sebagai mutasi.</small></div>` : moneyInput('productStock', 'Stok awal', product.stock_qty)}${moneyInput('productMinStock', 'Batas minimum stok', product.min_stock)}${selectInput('productCategory', 'Kategori', ui.data.categories.filter((c) => c.is_active).map((c) => [c.id, c.name]), product.category_id || '')}${selectInput('productUnit', 'Satuan', [['pcs', 'Pcs'], ['pack', 'Pack'], ['botol', 'Botol'], ['dus', 'Dus'], ['kg', 'Kg'], ['gram', 'Gram']], product.unit || 'pcs')}</div><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Batal</button><button class="btn primary" type="submit">${editing ? 'Simpan perubahan' : 'Simpan produk'}</button></div></form>`; break;
    }
    case 'stock':
      title = 'Penyesuaian stok'; body = `<form id="stock-form" class="modal-body">${selectInput('stockProduct', 'Pilih produk', ui.data.products.filter((p) => p.is_active).map((p) => [p.id, `${p.name} Â· stok ${p.stock_qty}`]), modal.productId || '')}${selectInput('stockDirection', 'Jenis perubahan', [['in', 'Stok masuk (+)'], ['out', 'Stok keluar (âˆ’)']], 'in')}${moneyInput('stockQuantity', 'Jumlah perubahan', '1')}${textInput('stockReason', 'Alasan / catatan', '', true, 'Contoh: stok opname, barang rusak, restock') }<div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Batal</button><button class="btn primary" type="submit">Simpan mutasi</button></div></form>`; break;
    case 'category': {
      const category = modal.category || { name: '' };
      title = modal.category ? 'Edit kategori' : 'Tambah kategori produk'; body = `<form id="category-form" class="modal-body">${textInput('categoryName', 'Nama kategori', category.name)}<div class="form-note">Kategori yang sudah dipakai produk hanya dapat diarsipkan, bukan dihapus permanen.</div><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Batal</button><button class="btn primary" type="submit">Simpan kategori</button></div></form>`; break;
    }
    case 'employee': {
      const person = modal.employee || { full_name: '', username: '', is_active: true };
      title = modal.employee ? 'Kelola akun kasir' : 'Tambah akun kasir'; body = `<form id="employee-form" class="modal-body">${textInput('employeeName', 'Nama lengkap', person.full_name)}${textInput('employeeUsername', 'Username', person.username, true, 'Contoh: kasir.pagi')}<div class="field"><span>${modal.employee ? 'PIN baru (opsional)' : 'PIN kasir'}${modal.employee ? '' : ' *'}</span><input id="employeePin" name="employeePin" type="password" inputmode="numeric" minlength="4" maxlength="6" pattern="[0-9]{4,6}" ${modal.employee ? '' : 'required'} placeholder="4â€“6 digit"/><small>${modal.employee ? 'Kosongkan bila tidak ingin mengubah PIN.' : 'Kasir akan masuk menggunakan username dan PIN ini pada perangkat demo.'}</small></div>${modal.employee ? `<label class="check-row"><input type="checkbox" id="employeeActive" ${person.is_active ? 'checked' : ''}/><span><b>Akun aktif</b><small>Nonaktifkan untuk mencegah login baru.</small></span></label>` : ''}<div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Batal</button><button class="btn primary" type="submit">Simpan akun</button></div></form>`; break;
    }
    case 'expense': {
      const expense = modal.expense || { title: '', amount: '', category_id: ui.data.expense_categories.find((c) => c.is_active)?.id || '', payment_method: 'cash', notes: '' };
      title = modal.expense ? 'Edit pengeluaran' : 'Catat pengeluaran'; body = `<form id="expense-form" class="modal-body">${textInput('expenseTitle', 'Nama pengeluaran', expense.title, true, 'Contoh: belanja kebutuhan toko')}${moneyInput('expenseAmount', 'Nominal', expense.amount)}${selectInput('expenseCategory', 'Kategori', ui.data.expense_categories.filter((c) => c.is_active).map((c) => [c.id, c.name]), expense.category_id || '')}${selectInput('expenseMethod', 'Metode pembayaran', [['cash', 'Tunai dari kas laci'], ['bank_transfer', 'Non-tunai / Transfer']], expense.payment_method)}<label class="field"><span>Catatan</span><textarea id="expenseNotes" name="expenseNotes" rows="2">${escapeHtml(expense.notes || '')}</textarea></label><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Batal</button><button class="btn primary" type="submit">Simpan pengeluaran</button></div></form>`; break;
    }
    case 'fail-pending-sale':
      title = 'Tandai pembayaran gagal'; body = `<form id="fail-pending-sale-form" class="modal-body"><div class="notice notice-warning">${icon('alert', 18)}<div><b>Transaksi Pending akan ditutup sebagai gagal</b><span>Tidak ada stok yang dikurangi atau omzet yang dicatat. Gunakan hanya setelah memastikan dana tidak diterima atau transaksi dibatalkan.</span></div></div><label class="field"><span>Alasan gagal / pembatalan <b>*</b></span><textarea id="failureReason" name="failureReason" rows="3" required placeholder="Contoh: pembayaran tidak diterima"></textarea></label><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Kembali</button><button class="btn danger" type="submit">Tandai gagal</button></div></form>`; break;
    case 'void-sale':
      title = 'Batalkan transaksi'; body = `<form id="void-sale-form" class="modal-body"><div class="notice notice-warning">${icon('alert', 18)}<div><b>Transaksi akan di-void</b><span>Stok akan dikembalikan dan pembayaran ditandai dikembalikan. Untuk QRIS/transfer, refund dana tetap perlu diproses manual.</span></div></div><label class="field"><span>Alasan void <b>*</b></span><textarea id="voidReason" name="voidReason" rows="3" required placeholder="Jelaskan alasan pembatalan..."></textarea></label><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Kembali</button><button class="btn danger" type="submit">Konfirmasi void</button></div></form>`; break;
    case 'void-expense':
      title = 'Void pengeluaran'; body = `<form id="void-expense-form" class="modal-body"><label class="field"><span>Alasan koreksi <b>*</b></span><textarea id="voidReason" name="voidReason" rows="3" required placeholder="Jelaskan alasan void..."></textarea></label><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Batal</button><button class="btn danger" type="submit">Void pengeluaran</button></div></form>`; break;
    case 'sale-detail':
      title = 'Detail transaksi'; wide = true; body = renderSaleDetail(modal.saleId); break;
    case 'verify-sale':
      title = 'Verifikasi pembayaran'; body = `<div class="modal-body"><div class="notice notice-info">${icon('shield', 18)}<div><b>Pastikan dana benar-benar diterima</b><span>Verifikasi ini akan mengurangi stok dan menghitung penjualan pada shift.</span></div></div><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Batal</button><button class="btn primary" data-action="confirm-verify" data-id="${modal.saleId}">Konfirmasi dana diterima</button></div></div>`; break;
    case 'category-manage':
      title = 'Kelola kategori'; wide = true; body = `<div class="category-manage-list">${ui.data.categories.map((category) => `<div class="category-manage-row"><div><b>${escapeHtml(category.name)}</b><small>${ui.data.products.filter((p) => p.category_id === category.id && p.is_active).length} produk terkait</small></div>${statusBadge(category.is_active ? 'active' : 'closed')}<button class="icon-btn" data-action="edit-category" data-id="${category.id}">${icon('edit', 15)}</button><button class="icon-btn" data-action="toggle-category" data-id="${category.id}">${icon(category.is_active ? 'trash' : 'check', 15)}</button></div>`).join('')}</div><div class="modal-actions"><button class="btn secondary" data-action="close-modal">Tutup</button><button class="btn primary" data-action="add-category">${icon('plus', 14)} Tambah kategori</button></div>`; break;
    default: return '';
  }
  return `<div class="modal-backdrop" data-action="modal-backdrop"><section class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-btn" data-action="close-modal" aria-label="Tutup">${icon('close', 18)}</button></div>${body}</section></div>`;
}

function renderCheckoutModal() {
  const total = cartTotal();
  return `<form id="checkout-form" class="modal-form checkout-modal"><div class="checkout-total"><span>Total pembayaran</span><strong>${rupiah(total)}</strong><small>${ui.cart.reduce((sum, item) => sum + item.quantity, 0)} item dalam transaksi</small></div><div class="method-selector"><label><input type="radio" name="paymentMethod" value="cash" checked/><span><b>${icon('wallet', 18)} Tunai</b><small>Bayar langsung</small></span></label><label><input type="radio" name="paymentMethod" value="qris"/><span><b>QRIS</b><small>Verifikasi manual</small></span></label><label><input type="radio" name="paymentMethod" value="bank_transfer"/><span><b>${icon('receipt', 18)} Transfer</b><small>Verifikasi manual</small></span></label></div><div id="payment-fields">${moneyInput('cashReceived', 'Uang diterima', String(total), true, 'Masukkan nominal yang diberikan pelanggan.')}</div><div class="form-note">Pembayaran QRIS/transfer otomatis berstatus <b>Pending</b> sampai Owner memverifikasi dana diterima. Stok belum dikurangi selama pending.</div><div class="modal-actions"><button type="button" class="btn secondary" data-action="close-modal">Kembali ke keranjang</button><button class="btn primary" type="submit">Selesaikan transaksi</button></div></form>`;
}

function renderSaleDetail(saleId) {
  const sale = ui.data.sales.find((item) => item.id === saleId);
  if (!sale) return '<div class="empty-state">Transaksi tidak ditemukan.</div>';
  return `<div class="sale-detail"><div class="sale-invoice-top"><div><small>Nomor invoice</small><h3>${escapeHtml(sale.invoice_no)}</h3><span>${dateTime(sale.created_at)}</span></div>${statusBadge(sale.status)}</div><div class="sale-info-grid"><div><small>Kasir</small><b>${escapeHtml(getUserName(sale.cashier_id))}</b></div><div><small>Metode pembayaran</small><b>${methodLabel(sale.payment.method)}</b></div><div><small>Status pembayaran</small><b>${escapeHtml(sale.payment.status)}</b></div><div><small>Referensi</small><b>${escapeHtml(sale.payment.reference_no || 'â€”')}</b></div></div><div class="sale-lines"><div class="sale-lines-head"><b>Item transaksi</b><span>${sale.items.length} baris</span></div>${sale.items.map((item) => `<div class="sale-line"><div><b>${escapeHtml(item.product_name_snapshot)}</b><small>${item.quantity} Ã— ${rupiah(item.unit_price)}</small></div><strong>${rupiah(item.subtotal)}</strong></div>`).join('')}<div class="sale-total-line"><span>Total</span><strong>${rupiah(sale.grand_total)}</strong></div>${sale.payment.method === 'cash' ? `<div class="sale-info-grid compact-grid"><div><small>Uang diterima</small><b>${rupiah(sale.payment.cash_received || 0)}</b></div><div><small>Kembalian</small><b>${rupiah(sale.payment.change_amount || 0)}</b></div></div>` : ''}</div>${sale.void_reason ? `<div class="void-reason">Alasan void: ${escapeHtml(sale.void_reason)}</div>` : ''}${sale.failure_reason ? `<div class="void-reason">Alasan gagal: ${escapeHtml(sale.failure_reason)}</div>` : ''}<div class="modal-actions split-actions"><button class="btn secondary" data-action="print-receipt" data-id="${sale.id}">${icon('printer', 15)} Cetak struk</button><div>${sale.status === 'pending_payment' && isOwner() ? `<button class="btn secondary" data-action="verify-sale" data-id="${sale.id}">Verifikasi pembayaran</button><button class="btn danger" data-action="fail-pending-sale" data-id="${sale.id}">Tandai gagal / batal</button>` : ''}${sale.status === 'completed' && isOwner() ? `<button class="btn danger" data-action="void-sale" data-id="${sale.id}">Void transaksi</button>` : ''}</div></div></div>`;
}

function showToast(message, type = 'success') {
  const item = document.createElement('div'); item.className = `toast ${type}`; item.innerHTML = `${icon(type === 'success' ? 'check' : type === 'warning' ? 'alert' : 'close', 17)}<span>${escapeHtml(message)}</span>`; toastRoot.append(item);
  setTimeout(() => { item.classList.add('out'); setTimeout(() => item.remove(), 250); }, 3200);
}
function openModal(type, payload = {}) { ui.modal = { type, ...payload }; render(); }
function closeModal() { ui.modal = null; render(); }
function addAudit(entityType, entityId, action, beforeData, afterData) {
  ui.data.audit_logs.unshift({ id: uid('audit'), store_id: ui.data.store.id, actor_id: ui.userId, entity_type: entityType, entity_id: entityId, action, before_data: beforeData, after_data: afterData, created_at: new Date().toISOString() });
}

function addToCart(productId) {
  const product = ui.data.products.find((item) => item.id === productId && item.is_active);
  if (!product || product.stock_qty <= 0) return showToast('Stok produk tidak tersedia.', 'warning');
  const found = ui.cart.find((item) => item.product_id === productId);
  if (found) {
    if (found.quantity >= product.stock_qty) return showToast('Jumlah melebihi stok tersedia.', 'warning');
    found.quantity += 1;
  } else ui.cart.push({ product_id: productId, quantity: 1 });
  render();
}

function updateCart(productId, direction) {
  const item = ui.cart.find((entry) => entry.product_id === productId);
  const product = ui.data.products.find((entry) => entry.id === productId);
  if (!item || !product) return;
  if (direction > 0 && item.quantity >= product.stock_qty) return showToast('Jumlah sudah mencapai stok tersedia.', 'warning');
  item.quantity += direction;
  if (item.quantity <= 0) ui.cart = ui.cart.filter((entry) => entry.product_id !== productId);
  render();
}

function printReceipt(saleId) {
  const sale = ui.data.sales.find((entry) => entry.id === saleId);
  if (!sale) return;
  const receipt = document.querySelector('#receipt-print');
  if (receipt) receipt.remove();
  const node = document.createElement('div'); node.id = 'receipt-print'; node.className = 'receipt-print';
  node.innerHTML = `<div class="receipt-center"><b>${escapeHtml(ui.data.store.name)}</b><small>${escapeHtml(ui.data.store.address || '')}</small><small>${escapeHtml(ui.data.store.phone || '')}</small></div><hr/><div>No: ${escapeHtml(sale.invoice_no)}</div><div>${dateTime(sale.created_at)}</div><div>Kasir: ${escapeHtml(getUserName(sale.cashier_id))}</div><hr/>${sale.items.map((item) => `<div class="receipt-item"><span>${escapeHtml(item.product_name_snapshot)}<br/>${item.quantity} x ${rupiah(item.unit_price)}</span><b>${rupiah(item.subtotal)}</b></div>`).join('')}<hr/><div class="receipt-total"><span>Total</span><b>${rupiah(sale.grand_total)}</b></div><div>Pembayaran: ${methodLabel(sale.payment.method)} / ${sale.payment.status}</div>${sale.payment.method === 'cash' ? `<div>Bayar: ${rupiah(sale.payment.cash_received || 0)}</div><div>Kembali: ${rupiah(sale.payment.change_amount || 0)}</div>` : ''}<hr/><div class="receipt-center">Terima kasih telah berbelanja.</div>`;
  document.body.append(node); window.print(); node.remove();
}

function exportCSV(rows, filename) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function bind() {
  app.querySelectorAll('[data-view]').forEach((node) => node.addEventListener('click', () => { const view = node.dataset.view; if (!allowedView(view)) return showToast('Akses tidak diizinkan.', 'warning'); ui.view = view; ui.mobileNav = false; render(); }));
  app.onclick = handleClick;
  app.querySelectorAll('form').forEach((form) => form.addEventListener('submit', handleSubmit));
  app.querySelector('#pos-search')?.addEventListener('input', (event) => { ui.search = event.target.value; const grid = app.querySelector('#product-grid'); if (grid) grid.innerHTML = ui.data.products.filter((p) => p.is_active && (ui.category === 'all' || p.category_id === ui.category) && `${p.name} ${p.sku}`.toLowerCase().includes(ui.search.toLowerCase())).map(productCard).join('') || '<div class="empty-state">Produk tidak ditemukan.</div>'; });
  const rerenderSearch = (event, key) => {
    const fieldId = event.target.id;
    const value = event.target.value;
    const cursor = event.target.selectionStart;
    ui[key] = value;
    render();
    const replacement = app.querySelector(`#${fieldId}`);
    replacement?.focus();
    if (replacement && typeof cursor === 'number') replacement.setSelectionRange(cursor, cursor);
  };
  app.querySelector('#product-search')?.addEventListener('input', (event) => rerenderSearch(event, 'productSearch'));
  app.querySelector('#tx-search')?.addEventListener('input', (event) => rerenderSearch(event, 'txSearch'));
  app.querySelector('#product-status')?.addEventListener('change', (event) => { ui.productStatus = event.target.value; render(); });
  app.querySelector('#tx-status')?.addEventListener('change', (event) => { ui.txStatus = event.target.value; render(); });
  app.querySelector('#report-period')?.addEventListener('change', (event) => { ui.period = event.target.value; render(); });
  app.querySelectorAll('input[name="paymentMethod"]').forEach((radio) => radio.addEventListener('change', updatePaymentFields));
}

function handleClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const { action, id, value } = target.dataset;
  if (action === 'modal-backdrop' && event.target === target) return closeModal();
  switch (action) {
    case 'open-nav': ui.mobileNav = true; render(); break;
    case 'close-nav': ui.mobileNav = false; render(); break;
    case 'logout': clearSession(); ui.userId = null; ui.cart = []; ui.view = 'dashboard'; render(); break;
    case 'toggle-theme': ui.data.store.theme = ui.data.store.theme === 'dark' ? 'light' : 'dark'; commit(ui.data); break;
    case 'set-theme': ui.data.store.theme = value; commit(ui.data); break;
    case 'open-shift': openModal('open-shift'); break;
    case 'close-shift': if (ui.cart.length) return showToast('Selesaikan atau kosongkan keranjang sebelum menutup shift.', 'warning'); openModal('close-shift'); break;
    case 'go-shifts': ui.view = 'shifts'; render(); break;
    case 'add-cart': addToCart(id); break;
    case 'cart-plus': updateCart(id, 1); break;
    case 'cart-minus': updateCart(id, -1); break;
    case 'clear-cart': ui.cart = []; render(); break;
    case 'clear-search': ui.search = ''; render(); break;
    case 'category-filter': ui.category = id; render(); break;
    case 'open-checkout': if (!activeShift()) return showToast('Buka shift terlebih dahulu.', 'warning'); openModal('checkout'); break;
    case 'close-modal': closeModal(); break;
    case 'add-product': openModal('product'); break;
    case 'edit-product': openModal('product', { product: ui.data.products.find((product) => product.id === id) }); break;
    case 'toggle-product': {
      const product = ui.data.products.find((entry) => entry.id === id); if (!product) break;
      product.is_active = !product.is_active; addAudit('product', id, product.is_active ? 'activate' : 'archive', null, { is_active: product.is_active }); commit(ui.data); showToast(product.is_active ? 'Produk diaktifkan.' : 'Produk diarsipkan.'); break;
    }
    case 'adjust-stock': openModal('stock'); break;
    case 'adjust-one': openModal('stock', { productId: id }); break;
    case 'add-category': openModal('category'); break;
    case 'manage-category': openModal('category-manage'); break;
    case 'edit-category': openModal('category', { category: ui.data.categories.find((c) => c.id === id) }); break;
    case 'toggle-category': { const category = ui.data.categories.find((c) => c.id === id); if (!category) break; category.is_active = !category.is_active; addAudit('category', id, category.is_active ? 'activate' : 'archive', null, { is_active: category.is_active }); commit(ui.data); openModal('category-manage'); showToast(category.is_active ? 'Kategori diaktifkan.' : 'Kategori diarsipkan.'); break; }
    case 'add-expense': openModal('expense'); break;
    case 'edit-expense': openModal('expense', { expense: ui.data.expenses.find((e) => e.id === id) }); break;
    case 'void-expense': openModal('void-expense', { expenseId: id }); break;
    case 'add-employee': openModal('employee'); break;
    case 'edit-employee': openModal('employee', { employee: ui.data.users.find((u) => u.id === id) }); break;
    case 'toggle-employee': { const employee = ui.data.users.find((u) => u.id === id); if (!employee || employee.role !== 'cashier') break; employee.is_active = !employee.is_active; addAudit('profile', id, employee.is_active ? 'activate' : 'deactivate', null, { is_active: employee.is_active }); commit(ui.data); showToast(employee.is_active ? 'Akun kasir diaktifkan.' : 'Akun kasir dinonaktifkan.'); break; }
    case 'sale-detail': openModal('sale-detail', { saleId: id }); break;
    case 'verify-sale': ui.modal = { type: 'verify-sale', saleId: id }; render(); break;
    case 'fail-pending-sale': openModal('fail-pending-sale', { saleId: id }); break;
    case 'confirm-verify': try { const result = verifyPendingSale(ui.data, id, ui.userId); ui.data = result.state; saveState(ui.data); ui.modal = null; render(); showToast('Pembayaran terverifikasi dan stok diperbarui.'); } catch (error) { showToast(error.message, 'error'); } break;
    case 'void-sale': openModal('void-sale', { saleId: id }); break;
    case 'print-receipt': printReceipt(id); break;
    case 'print-report': window.print(); break;
    case 'export-transactions': exportCSV([['Invoice', 'Tanggal', 'Kasir', 'Metode', 'Status', 'Total'], ...filteredSales().map((s) => [s.invoice_no, s.created_at, getUserName(s.cashier_id), methodLabel(s.payment.method), s.status, s.grand_total])], `transaksi-${dateKey()}.csv`); showToast('File CSV disiapkan.'); break;
    case 'export-backup': exportBackup(ui.data); showToast('Backup JSON diunduh.'); break;
    case 'save-settings': saveSettings(); break;
    case 'reset-workspace': if (confirm('Reset seluruh data lokal di browser ini? Tindakan tidak dapat dibatalkan.')) { localStorage.removeItem('pos-terpadu-app-v1'); clearSession(); ui.data = null; ui.userId = null; ui.cart = []; render(); } break;
    case 'back-setup': if (confirm('Hapus workspace lokal dan buat ulang? Semua data demo akan hilang.')) { localStorage.removeItem('pos-terpadu-app-v1'); clearSession(); ui.data = null; ui.userId = null; render(); } break;
  }
}

function updatePaymentFields() {
  const method = app.querySelector('input[name="paymentMethod"]:checked')?.value || 'cash';
  const fields = app.querySelector('#payment-fields');
  if (!fields) return;
  if (method === 'cash') fields.innerHTML = moneyInput('cashReceived', 'Uang diterima', String(cartTotal()), true, 'Masukkan nominal yang diberikan pelanggan.');
  else fields.innerHTML = `<div class="payment-pending-box">${icon('clock', 19)}<div><b>Status pembayaran: Pending</b><span>Stok tidak berkurang dan penjualan belum masuk omzet sampai Owner memverifikasi dana.</span></div></div><label class="field"><span>Nomor referensi (opsional)</span><input id="paymentReference" name="paymentReference" placeholder="Nomor referensi / catatan transfer" /></label><label class="check-row verify-check"><input id="paymentVerified" name="paymentVerified" type="checkbox"/><span><b>Dana sudah saya periksa dan diterima</b><small>Centang hanya setelah bukti dana masuk diverifikasi secara nyata.</small></span></label>`;
}

async function handleSubmit(event) {
  const form = event.target;
  const id = form.id;
  event.preventDefault();
  if (ui.busy) return;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    ui.busy = true;
    if (id === 'setup-form') {
      const pin = values.ownerPin;
      if (!/^\d{4,6}$/.test(pin || '')) throw new Error('PIN harus terdiri dari 4â€“6 angka.');
      if (!/^[a-z0-9._-]{3,30}$/i.test(values.ownerUsername?.trim() || '')) throw new Error('Username Owner harus 3â€“30 karakter: huruf, angka, titik, garis bawah, atau minus.');
      if (!values.storeName?.trim() || !values.ownerName?.trim()) throw new Error('Nama toko dan nama Owner wajib diisi.');
      if (ui.data) throw new Error('Workspace sudah tersedia.');
      const state = await createWorkspace({ storeName: values.storeName, ownerName: values.ownerName, ownerUsername: values.ownerUsername, ownerPin: pin, sampleData: app.querySelector('#sampleData')?.checked ?? true });
      ui.data = state; ui.userId = getSessionUserId(); ui.view = 'dashboard'; ui.busy = false; render(); showToast('Workspace berhasil dibuat.'); return;
    }
    if (id === 'login-form') {
      const user = ui.data.users.find((entry) => entry.id === values.loginUser && entry.is_active);
      if (!user || !(await verifyPin(values.loginPin, user))) throw new Error('Akun atau PIN tidak sesuai.');
      ui.userId = user.id; setSessionUserId(user.id); ui.view = user.role === 'cashier' ? 'pos' : 'dashboard'; ui.cart = []; ui.busy = false; render(); showToast(`Selamat datang, ${user.full_name}.`); return;
    }
    if (id === 'open-shift-form') {
      const result = openShift(ui.data, ui.userId, values.openingCash || 0); ui.modal = null; commit(result.state); showToast('Shift berhasil dibuka.'); return;
    }
    if (id === 'close-shift-form') {
      const shift = activeShift(); if (!shift) throw new Error('Shift aktif tidak ditemukan.');
      const result = closeShift(ui.data, shift.id, ui.userId, values.countedCash); ui.modal = null; commit(result.state); showToast(`Shift ditutup. Selisih kas ${rupiah(result.shift.cash_difference)}.`, result.shift.cash_difference === 0 ? 'success' : 'warning'); return;
    }
    if (id === 'checkout-form') {
      const method = values.paymentMethod || 'cash';
      const result = createSale(ui.data, { actorId: ui.userId, items: ui.cart, method, cashReceived: values.cashReceived || 0, verified: form.querySelector('#paymentVerified')?.checked || false, referenceNo: values.paymentReference || '', idempotencyKey: uid('checkout') });
      ui.cart = []; ui.data = result.state; saveState(ui.data); ui.modal = null; ui.view = 'transactions'; render(); showToast(result.sale.status === 'completed' ? `Transaksi ${result.sale.invoice_no} berhasil disimpan.` : `Transaksi ${result.sale.invoice_no} tersimpan sebagai Pending.`, result.sale.status === 'completed' ? 'success' : 'warning'); return;
    }
    if (id === 'product-form') {
      if (!isOwner()) throw new Error('Akses hanya untuk Owner.');
      const price = Number(values.productPrice); const cost = Number(values.productCost); const stock = Number(values.productStock || 0); const minimum = Number(values.productMinStock || 0);
      if (price <= 0 || !Number.isInteger(price)) throw new Error('Harga jual harus berupa angka bulat lebih dari 0.');
      if (!Number.isInteger(cost) || cost < 0 || !Number.isInteger(stock) || stock < 0 || !Number.isInteger(minimum) || minimum < 0) throw new Error('HPP dan stok harus berupa bilangan bulat tidak negatif.');
      const duplicate = ui.data.products.find((p) => p.sku && p.sku.toLowerCase() === (values.productSku || '').toLowerCase() && p.id !== ui.modal.product?.id);
      if (duplicate) throw new Error('SKU sudah digunakan produk lain.');
      const now = new Date().toISOString();
      if (ui.modal.product) {
        const product = ui.data.products.find((p) => p.id === ui.modal.product.id); const before = { ...product };
        Object.assign(product, { name: values.productName.trim(), sku: values.productSku.trim(), selling_price: price, cost_price: cost, min_stock: minimum, category_id: values.productCategory, unit: values.productUnit, updated_at: now });
        addAudit('product', product.id, 'update', { name: before.name, selling_price: before.selling_price, cost_price: before.cost_price }, { name: product.name, selling_price: price, cost_price: cost });
      } else {
        const product = { id: uid('prod'), store_id: ui.data.store.id, name: values.productName.trim(), sku: values.productSku.trim(), selling_price: price, cost_price: cost, stock_qty: stock, min_stock: minimum, category_id: values.productCategory, unit: values.productUnit, color: ['#EDE3D2', '#DCEBFA', '#F5E9CF', '#F4E0D2', '#E9E8D8'][ui.data.products.length % 5], is_active: true, created_at: now, updated_at: now };
        ui.data.products.unshift(product);
        if (stock > 0) ui.data.stock_movements.unshift({ id: uid('mov'), store_id: ui.data.store.id, product_id: product.id, performed_by: ui.userId, movement_type: 'initial', qty_change: stock, stock_before: 0, stock_after: stock, reference_type: 'product', reference_id: product.id, note: 'Stok awal produk baru', created_at: now });
        addAudit('product', product.id, 'create', null, { name: product.name, selling_price: price, stock_qty: stock });
      }
      ui.modal = null; ui.view = 'products'; commit(ui.data); showToast('Data produk disimpan.'); return;
    }
    if (id === 'stock-form') {
      if (!isOwner()) throw new Error('Akses hanya untuk Owner.');
      const state = adjustStock(ui.data, { productId: values.stockProduct, actorId: ui.userId, quantity: values.stockQuantity, direction: values.stockDirection, reason: values.stockReason });
      ui.modal = null; commit(state); showToast('Penyesuaian stok berhasil dicatat.'); return;
    }
    if (id === 'category-form') {
      if (!isOwner()) throw new Error('Akses hanya untuk Owner.');
      const name = values.categoryName.trim();
      if (ui.data.categories.some((c) => c.name.toLowerCase() === name.toLowerCase() && c.id !== ui.modal.category?.id)) throw new Error('Nama kategori sudah digunakan.');
      if (ui.modal.category) { const category = ui.data.categories.find((c) => c.id === ui.modal.category.id); category.name = name; addAudit('category', category.id, 'update', null, { name }); }
      else { const category = { id: uid('cat'), store_id: ui.data.store.id, name, is_active: true, created_at: new Date().toISOString() }; ui.data.categories.push(category); addAudit('category', category.id, 'create', null, { name }); }
      ui.modal = null; commit(ui.data); showToast('Kategori disimpan.'); return;
    }
    if (id === 'employee-form') {
      if (!isOwner()) throw new Error('Akses hanya untuk Owner.');
      const username = values.employeeUsername.trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error('Username 3â€“30 karakter: huruf, angka, titik, garis bawah, atau minus.');
      if (ui.data.users.some((u) => u.username === username && u.id !== ui.modal.employee?.id)) throw new Error('Username sudah dipakai.');
      const now = new Date().toISOString();
      if (ui.modal.employee) {
        const user = ui.data.users.find((u) => u.id === ui.modal.employee.id); user.full_name = values.employeeName.trim(); user.username = username; user.is_active = app.querySelector('#employeeActive')?.checked ?? user.is_active;
        if (values.employeePin) { if (!/^\d{4,6}$/.test(values.employeePin)) throw new Error('PIN harus 4â€“6 angka.'); Object.assign(user, await hashPin(values.employeePin)); }
        addAudit('profile', user.id, 'update', null, { full_name: user.full_name, username, is_active: user.is_active });
      } else {
        if (!/^\d{4,6}$/.test(values.employeePin || '')) throw new Error('PIN kasir harus 4â€“6 angka.');
        const auth = await hashPin(values.employeePin);
        const user = { id: uid('user'), store_id: ui.data.store.id, full_name: values.employeeName.trim(), username, role: 'cashier', is_active: true, permissions: { can_create_expense: ui.data.store.cashier_expense_permission }, ...auth, created_at: now };
        ui.data.users.push(user); addAudit('profile', user.id, 'create', null, { full_name: user.full_name, username });
      }
      ui.modal = null; commit(ui.data); showToast('Akun kasir disimpan.'); return;
    }
    if (id === 'expense-form') {
      const result = createExpense(ui.data, { actorId: ui.userId, title: values.expenseTitle, amount: values.expenseAmount, categoryId: values.expenseCategory, paymentMethod: values.expenseMethod, notes: values.expenseNotes, expenseId: ui.modal.expense?.id });
      ui.modal = null; commit(result.state); showToast('Pengeluaran berhasil disimpan.'); return;
    }
    if (id === 'fail-pending-sale-form') {
      const result = failPendingSale(ui.data, ui.modal.saleId, ui.userId, values.failureReason); ui.modal = null; commit(result.state); showToast('Pembayaran ditandai gagal. Stok dan omzet tidak berubah.', 'warning'); return;
    }
    if (id === 'void-sale-form') {
      const result = voidSale(ui.data, ui.modal.saleId, ui.userId, values.voidReason); ui.modal = null; commit(result.state); showToast('Transaksi di-void dan stok dikembalikan.'); return;
    }
    if (id === 'void-expense-form') {
      const state = voidExpense(ui.data, ui.modal.expenseId, ui.userId, values.voidReason); ui.modal = null; commit(state); showToast('Pengeluaran di-void.'); return;
    }
  } catch (error) {
    showToast(error.message || 'Terjadi kesalahan.', 'error');
  } finally { ui.busy = false; }
}

function saveSettings() {
  if (!isOwner()) return showToast('Hanya Owner yang dapat mengubah pengaturan toko.', 'warning');
  const storeName = app.querySelector('#settingStoreName')?.value?.trim();
  if (!storeName) return showToast('Nama toko wajib diisi.', 'error');
  ui.data.store.name = storeName;
  ui.data.store.phone = app.querySelector('#settingPhone')?.value?.trim() || '';
  ui.data.store.address = app.querySelector('#settingAddress')?.value?.trim() || '';
  ui.data.store.timezone = app.querySelector('#settingTimezone')?.value || 'Asia/Pontianak';
  ui.data.store.receipt_width = app.querySelector('#settingReceipt')?.value || '80';
  ui.data.store.cashier_expense_permission = app.querySelector('#cashierExpensePermission')?.checked || false;
  saveState(ui.data); render(); showToast('Pengaturan toko berhasil disimpan.');
}

window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); app.querySelector('#pos-search')?.focus(); }
  if (event.key === 'Escape' && ui.modal) closeModal();
});

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('Service worker tidak terdaftar:', error)));
}

render();




