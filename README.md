# POS Terpadu — Warung & Usaha Kecil

Aplikasi Point of Sale (POS) responsif berbasis web/PWA yang dirancang berdasarkan PRD **Sistem POS Terpadu untuk Warung dan Usaha Kecil** serta analisis dua repositori referensi yang diberikan.

> **Status saat ini: MVP demonstrasi lokal.** UI dan alur operasional berjalan di browser serta menyimpan data pada `localStorage`. Backend Supabase belum dihubungkan. Jangan gunakan mode lokal ini sebagai sistem kasir produksi atau untuk menyimpan data keuangan/identitas yang sensitif.

## 1. Fitur yang tersedia

- Setup workspace toko dan akun Owner tanpa PIN bawaan.
- Login lokal per akun (Owner/Kasir); PIN demo diturunkan menggunakan PBKDF2 + salt melalui Web Crypto.
- Dashboard dengan omzet lunas, laba kotor, pengeluaran, stok rendah, tren 7 hari, dan transaksi terbaru.
- POS: pencarian SKU/nama, filter kategori, cart, kontrol qty, checkout tunai/QRIS/transfer.
- QRIS/transfer dapat disimpan sebagai **Pending**. Pending tidak menambah omzet atau mengurangi stok. Owner dapat memverifikasi pembayaran saat shift asal masih terbuka.
- CRUD/arsip produk dan kategori, termasuk harga jual, HPP, stok minimum, dan SKU unik.
- Penyesuaian stok masuk/keluar dengan alasan dan ledger mutasi.
- Riwayat transaksi, detail invoice, cetak struk, ekspor CSV, dan void dengan alasan.
- Shift: buka, tutup, kas awal, kas diharapkan, kas aktual, dan selisih.
- Pengeluaran tunai/non-tunai, edit, dan void dengan jejak audit.
- Laporan periode hari ini/7 hari/30 hari; omzet, HPP, laba kotor, pengeluaran, estimasi laba operasional, dan payment mix.
- Karyawan: tambah, ubah, aktif/nonaktif, dan reset PIN.
- Profil toko, tema terang/gelap, ekspor backup JSON, PWA shell cache.

## 2. Menjalankan aplikasi

Prasyarat: Node.js 18+ (disarankan Node 20+). Tidak ada dependency npm eksternal dan tidak perlu mengunduh `node_modules`.

```bash
# 1. Ekstrak ZIP dan buka folder proyek
cd pos-terpadu-app

# 2. Jalankan server lokal
npm run dev

# 3. Buka alamat berikut di browser
http://localhost:4173
```

Alternatif tanpa Node:

```bash
python -m http.server 4173
```

Kemudian buka `http://localhost:4173`. Web Crypto dan PWA Service Worker memerlukan `localhost` atau HTTPS; jangan membuka `index.html` langsung melalui `file://`.

## 3. Penggunaan pertama

1. Isi nama toko, nama Owner, username, dan PIN pribadi 4–6 angka.
2. Pilih **Isi data contoh** untuk memuat katalog, transaksi simulasi, mutasi stok, dan shift contoh.
3. Masuk menggunakan username Owner dan PIN yang baru dibuat.
4. Buka halaman **Karyawan** untuk membuat akun Kasir dan PIN miliknya.
5. Logout, lalu login sebagai Kasir untuk mencoba batas tampilan dan alur shift.

Data contoh adalah data fiktif lokal dan dapat dihapus melalui Pengaturan → Reset workspace demo.

## 4. Hak akses pada mode demo

- **Owner:** dashboard, kasir/POS, seluruh transaksi, produk, kategori, persediaan, seluruh shift, pengeluaran, laporan, karyawan, dan pengaturan.
- **Kasir:** POS, transaksi miliknya, shift miliknya, dan pengeluaran miliknya bila Owner mengaktifkan izin pengeluaran Kasir. Kasir tidak mendapat menu produk/persediaan, laporan, karyawan, atau pengaturan toko.
- Proteksi menu ini adalah UX/demo lokal. Pada mode produksi, aturan yang sama wajib ditegakkan oleh Supabase Auth + RLS + RPC, bukan hanya navigasi frontend.

## 5. Aturan bisnis yang diterapkan pada mode demo

- Hanya transaksi dengan `sale.status = completed` dan `payment.status = paid` dihitung sebagai omzet; transaksi gagal dan void tidak masuk omzet.
- Metode pembayaran (`cash`, `qris`, `bank_transfer`) terpisah dari status (`pending`, `paid`, `failed`, `refunded`).
- Checkout tunai menolak uang diterima yang lebih kecil dari total.
- QRIS/transfer yang belum diverifikasi tetap Pending, tidak mengurangi stok dan tidak menambah penjualan shift. Pending harus diverifikasi atau ditandai gagal oleh Owner sebelum shift asal ditutup.
- Harga jual, HPP, SKU, dan nama produk disalin sebagai snapshot saat transaksi selesai.
- Stok tidak boleh negatif; pengurangan/pengembalian stok dicatat sebagai mutasi.
- Penjualan completed tidak diedit/hapus. Koreksi dilakukan melalui void dengan alasan dan mutasi stok pembalik.
- Kas diharapkan = kas awal + penjualan tunai − pengeluaran tunai − refund tunai.
- Satu akun lokal hanya dapat memiliki satu shift aktif.

> Batasan demo: localStorage tidak memberikan isolation, concurrency control lintas perangkat, ataupun otorisasi server. Jaminan produksi harus ditegakkan pada PostgreSQL/RPC + Supabase Auth + RLS.

## 6. Struktur proyek

```text
pos-terpadu-app/
├── index.html
├── styles.css
├── manifest.webmanifest
├── sw.js
├── server.mjs
├── package.json
├── src/
│   ├── main.js       # Screen rendering, event handlers, forms, navigation
│   ├── domain.js     # Business rules and state transitions
│   ├── store.js      # Local persistence, local identity/PIN, seed data
│   ├── format.js     # Rupiah, dates, escaping, identifiers
│   └── icons.js      # Inline SVG icon set
├── supabase/
│   ├── migrations/001_pos_core.sql
│   └── README.md
├── tests/domain.test.mjs
└── docs/
    ├── IMPLEMENTATION_NOTES.md
    └── QA_CHECKLIST.md
```

## 7. Backend Supabase — status dan langkah berikutnya

Folder `supabase/migrations/001_pos_core.sql` memuat draft schema PostgreSQL, constraints, helper authorization, RLS, dan RPC inti untuk setup Owner, checkout atomik, verifikasi pembayaran pending, void, penyesuaian stok, serta shift.

Migration tersebut **belum dijalankan pada project Supabase nyata**. Sebelum menggunakan backend:

1. Buat project Supabase development.
2. Tinjau dan jalankan migration pada database kosong/staging.
3. Uji setup Owner, RLS dua akun dan dua toko, RPC rollback, idempotency, stok bersamaan, dan void.
4. Implementasikan adapter Auth/PostgREST/RPC pada frontend dan ganti local repository.
5. Pastikan akun Kasir memiliki identitas Auth tersendiri; jangan menjalankan semua query Kasir melalui sesi Owner.

Kunci `service_role` tidak boleh ditaruh pada browser. Browser hanya boleh memakai anon/publishable key dan kebijakan RLS yang telah diuji.

## 8. Pengujian

```bash
npm test
```

Test suite menggunakan Node.js built-in test runner untuk aturan domain utama. Pengujian ini tidak membuktikan integrasi browser, Supabase, RLS, printer fisik, atau perilaku lintas perangkat. Gunakan `docs/QA_CHECKLIST.md` untuk pengujian manual sebelum pilot.

## 9. Catatan desain

- Navy/sidebar: `#17243A`
- Primary blue: `#2563EB`
- Success: `#16734E`
- Warning: `#B45309`
- Danger: `#BE123C`
- Canvas: `#F5F7FA`
- Surface: `#FFFFFF`
- Border: `#D7E0EA`

Tampilan mengutamakan katalog + cart dua kolom di desktop, satu kolom di mobile, angka dan status transaksi yang mudah dipindai, modal konfirmasi untuk tindakan berisiko, serta tema gelap.

## 10. Referensi yang digunakan

- `kasirpintar-main.zip`: Flutter + Supabase, PRD, migrations, product/expense/shift/report concepts.
- `Aplikasi-Kasir-Warung-Ilham-Berbasis-Desktop-main.zip`: Python/PyQt6 + SQLite, login PIN, dashboard produk, cart, checkout, histori, laporan harian.
- `PRD_POS_Terpadu_Warung_Usaha_Kecil.docx/pdf`: spesifikasi produk gabungan, alur bisnis, CRUD, ERD, design brief, wireframe, dan kriteria penerimaan.
- `Mockup_Interaktif_POS_Terpadu.html`: dasar visual awal dan pemetaan layar.
