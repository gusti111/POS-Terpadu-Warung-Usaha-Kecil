# Arsitektur, ERD, dan Alur Pengguna — POS Terpadu

Dokumen ini merangkum rancangan teknis MVP. Diagram backend merupakan rancangan target Supabase dari `supabase/migrations/001_pos_core.sql`; aplikasi yang ada di ZIP saat ini menjalankan repository lokal browser, bukan koneksi Supabase.

## 1. Konteks arsitektur

```mermaid
flowchart LR
  U[Owner / Kasir] --> UI[Responsive Web App / PWA]
  UI --> APP[UI + View Controller\nsrc/main.js]
  APP --> DOMAIN[Domain Rules\nsrc/domain.js]
  DOMAIN --> LOCAL[Local Repository\nsrc/store.js + localStorage]
  DOMAIN -. production adapter planned .-> API[Supabase Auth + RPC]
  API --> DB[(PostgreSQL + RLS)]
  API --> AUDIT[Audit Logs]
  SW[Service Worker\nApp Shell Cache] -. caches .-> UI
```

**Implementasi sekarang:** UI → domain → localStorage. Panah putus-putus ke Supabase menunjukkan target integrasi, bukan fitur aktif.

## 2. Alur setup dan autentikasi lokal

```mermaid
flowchart TD
  A[Pengguna membuka aplikasi] --> B{Workspace sudah ada?}
  B -- Belum --> C[Isi data toko + Owner + username + PIN pribadi]
  C --> D[Validasi form]
  D --> E{Valid?}
  E -- Tidak --> C
  E -- Ya --> F[Buat workspace dan akun Owner]
  F --> G{Isi data contoh?}
  G -- Ya --> H[Seed katalog + transaksi simulasi]
  G -- Tidak --> I[Workspace kosong]
  H --> J[Halaman login]
  I --> J
  B -- Sudah --> J
  J --> K[Pilih akun + masukkan PIN]
  K --> L{PIN cocok dan akun aktif?}
  L -- Tidak --> J
  L -- Ya --> M{Role}
  M -- Owner --> N[Dashboard Owner]
  M -- Kasir --> O[Workspace Kasir terbatas]
```

PIN lokal diubah menjadi verifier PBKDF2 dengan salt unik menggunakan Web Crypto. Mekanisme ini hanya untuk demonstrasi satu browser; untuk produksi gunakan Supabase Auth dan RLS.

## 3. Alur checkout dan pembayaran

```mermaid
flowchart TD
  A[Kasir membuka POS] --> B[Pilih produk dan jumlah]
  B --> C[Validasi stok dan shift aktif]
  C --> D[Review keranjang]
  D --> E[Pilih metode pembayaran]
  E --> F{Metode?}
  F -- Tunai --> G[Masukkan uang diterima]
  G --> H{Uang cukup?}
  H -- Tidak --> G
  H -- Ya --> I[Simpan paid/completed]
  F -- QRIS / Transfer --> J[Simpan pending_payment / pending]
  I --> K[Potong stok + tulis mutasi + update shift]
  J --> L[Tidak potong stok dan tidak tambah omzet]
  K --> M[Invoice + struk]
  L --> N[Owner meninjau pembayaran]
  N --> O{Bukti pembayaran valid?}
  O -- Ya --> P[Verifikasi: paid/completed]
  P --> Q[Potong stok + mutasi + update shift non-tunai]
  O -- Tidak --> R[Tandai failed dengan alasan]
  Q --> M
  R --> S[Penjualan tidak dihitung]
```

Invariant:
- Hanya status penjualan `completed` dengan payment `paid` yang masuk omzet.
- Pembayaran pending tidak memotong stok dan tidak mengubah omzet.
- Request berulang menggunakan idempotency key pada domain model.
- Pada backend target, seluruh proses checkout harus berada dalam satu transaksi PostgreSQL/RPC.

## 4. Alur void penjualan

```mermaid
flowchart TD
  A[Owner membuka detail transaksi] --> B{Transaksi completed + paid?}
  B -- Tidak --> C[Tolak void / ikuti alur status terkait]
  B -- Ya --> D[Masukkan alasan void]
  D --> E[Konfirmasi]
  E --> F[Ubah status transaksi menjadi voided]
  F --> G[Payment menjadi refunded]
  G --> H[Buat mutasi stok void_return]
  H --> I{Refund tunai?}
  I -- Ya --> J[Kurangi expected cash shift asal]
  I -- Non-tunai --> K[Refund provider diproses manual]
  J --> L[Simpan audit log]
  K --> L
  L --> M[Perbarui riwayat dan laporan]
```

Void adalah tindakan koreksi, bukan delete. Catatan transaksi dan mutasi tetap disimpan.

## 5. ERD target PostgreSQL / Supabase

```mermaid
erDiagram
  STORES ||--o{ PROFILES : has
  STORES ||--o{ PRODUCT_CATEGORIES : groups
  STORES ||--o{ PRODUCTS : owns
  PRODUCT_CATEGORIES o|--o{ PRODUCTS : categorizes
  PROFILES ||--o{ SHIFTS : operates
  STORES ||--o{ SHIFTS : records
  SHIFTS o|--o{ SALES : contains
  PROFILES ||--o{ SALES : processes
  STORES ||--o{ SALES : owns
  SALES ||--|{ SALE_ITEMS : snapshots
  PRODUCTS o|--o{ SALE_ITEMS : referenced_by
  SALES ||--|| PAYMENTS : paid_by
  STORES ||--o{ EXPENSE_CATEGORIES : defines
  STORES ||--o{ EXPENSES : records
  SHIFTS o|--o{ EXPENSES : affects
  PROFILES ||--o{ EXPENSES : creates
  EXPENSE_CATEGORIES o|--o{ EXPENSES : categorizes
  STORES ||--o{ STOCK_MOVEMENTS : logs
  PRODUCTS ||--o{ STOCK_MOVEMENTS : changes
  PROFILES ||--o{ STOCK_MOVEMENTS : performs
  STORES ||--o{ AUDIT_LOGS : audits
  PROFILES o|--o{ AUDIT_LOGS : acts

  STORES {
    uuid id PK
    uuid owner_id FK
    text name
    text timezone
  }
  PROFILES {
    uuid id PK,FK
    uuid store_id FK
    text username
    text full_name
    text role
    boolean is_active
  }
  PRODUCT_CATEGORIES {
    uuid id PK
    uuid store_id FK
    text name
    boolean is_active
  }
  PRODUCTS {
    uuid id PK
    uuid store_id FK
    uuid category_id FK
    text sku
    text name
    numeric selling_price
    numeric cost_price
    integer stock_qty
    integer min_stock
  }
  SHIFTS {
    uuid id PK
    uuid store_id FK
    uuid cashier_id FK
    numeric opening_cash
    numeric expected_cash
    numeric counted_cash
    text status
  }
  SALES {
    uuid id PK
    uuid store_id FK
    uuid shift_id FK
    uuid cashier_id FK
    text invoice_no
    text status
    numeric grand_total
    uuid idempotency_key
  }
  SALE_ITEMS {
    uuid id PK
    uuid sale_id FK
    uuid product_id FK
    text product_name_snapshot
    numeric unit_price
    numeric unit_cost
    integer quantity
  }
  PAYMENTS {
    uuid id PK
    uuid sale_id FK
    text method
    text status
    numeric amount
  }
  EXPENSE_CATEGORIES {
    uuid id PK
    uuid store_id FK
    text name
  }
  EXPENSES {
    uuid id PK
    uuid store_id FK
    uuid shift_id FK
    uuid category_id FK
    uuid created_by FK
    numeric amount
    text payment_method
    text status
  }
  STOCK_MOVEMENTS {
    uuid id PK
    uuid store_id FK
    uuid product_id FK
    uuid performed_by FK
    text movement_type
    integer qty_change
  }
  AUDIT_LOGS {
    uuid id PK
    uuid store_id FK
    uuid actor_id FK
    text entity_type
    uuid entity_id
    text action
  }
```

## 6. Matriks peran ringkas

| Modul | Owner | Kasir |
|---|---|---|
| Dashboard & laporan | Semua data toko | Tidak tersedia |
| POS & checkout | Ya | Ya |
| Produk, kategori, persediaan | CRUD/arsip | Tidak tersedia |
| Transaksi | Semua transaksi, verifikasi, void | Transaksi sendiri |
| Shift | Semua shift | Shift sendiri |
| Pengeluaran | Semua, termasuk void | Milik sendiri bila diizinkan Owner |
| Karyawan & pengaturan | CRUD/pengelolaan | Tidak tersedia |

> Matriks ini menggambarkan UX/demo lokal. Backend production wajib menegakkan permission yang sama pada RLS dan RPC.
