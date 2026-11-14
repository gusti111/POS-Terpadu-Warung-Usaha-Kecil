# Implementation Notes — POS Terpadu v1.0.0

## 1. Keputusan implementasi

PRD mengarahkan produk pada web responsif/PWA dengan React + TypeScript + Vite + Supabase. ZIP ini memprioritaskan **prototype operasional yang langsung dapat dijalankan tanpa instalasi dependency eksternal**. Karena lingkungan build tidak dapat mengunduh paket npm, UI demonstrasi dibangun dengan HTML, CSS, dan JavaScript ES Modules native serta server Node.js bawaan. Tidak ada dependency pihak ketiga.

Ini adalah keputusan pengiriman prototype, bukan perubahan target arsitektur produksi. Dokumen migration Supabase tetap menjadi rancangan backend. Frontend saat ini belum tersambung ke Supabase Auth, PostgREST, RPC, atau Storage.

## 2. Modul yang tersedia

| Modul | Implementasi lokal |
|---|---|
| Setup toko & Owner | Membuat workspace dan akun Owner. Tidak ada PIN default. |
| Login | Pilih akun dan PIN 4–6 digit; hash PBKDF2 + salt via Web Crypto. |
| Dashboard | Omzet lunas, transaksi, laba kotor, biaya, stok rendah, grafik ringkas. |
| POS | Pencarian, kategori, cart, kuantitas, tunai, QRIS, transfer. |
| Produk & kategori | Tambah, baca, ubah, arsip/aktifkan. SKU unik pada form. |
| Persediaan | Mutasi masuk/keluar dengan alasan dan audit trail. |
| Transaksi | Riwayat, detail, status, cetak struk, CSV, void Owner. |
| Shift | Buka/tutup shift, kas awal, kas diharapkan, kas aktual, selisih. |
| Pengeluaran | Catat, ubah, void dengan alasan; menghitung kas tunai shift. |
| Laporan | Periode 1/7/30 hari, omzet, HPP, laba kotor, biaya, estimasi laba operasional. |
| Karyawan | Buat, ubah, aktif/nonaktif, reset PIN Kasir. |
| Pengaturan | Profil toko, izin pengeluaran Kasir, tema, backup, reset demo. |

## 3. Invarian bisnis yang dijaga

1. Hanya `completed` + `paid` yang dihitung sebagai omzet.
2. Metode pembayaran tidak sama dengan status pembayaran.
3. Pembayaran QRIS/transfer yang belum diverifikasi tetap Pending; tidak menambah omzet dan tidak mengurangi stok.
4. Penjualan menyimpan snapshot nama, SKU, harga jual, HPP, jumlah, dan subtotal.
5. Stok tidak boleh negatif dan setiap perubahan stok menambah catatan mutasi.
6. Void hanya dapat dilakukan Owner dengan alasan; stok dikembalikan melalui mutasi `void_return`.
7. Uang kas diharapkan dihitung dari kas awal + penjualan tunai − pengeluaran tunai − refund tunai. Pembayaran non-tunai tidak mengubah kas laci.
8. `idempotencyKey` dipakai pada domain checkout untuk mencegah duplikasi saat request diulang.
9. Penutupan shift mencatat kas yang diharapkan, kas yang dihitung, dan selisih.

## 4. Arsitektur source

- `src/main.js`: rendering halaman, navigasi, modal, form, event handler, export/cetak.
- `src/domain.js`: aturan domain murni dan transisi state, dengan clone untuk menghindari perubahan parsial ketika validasi gagal.
- `src/store.js`: localStorage, session lokal, derivasi PIN dan data contoh.
- `src/format.js`: format rupiah/tanggal, escaping, ID.
- `src/icons.js`: ikon SVG inline.
- `styles.css`: design system, tema terang/gelap, responsif, cetak struk.
- `sw.js` + `manifest.webmanifest`: shell PWA dasar.
- `supabase/migrations/001_pos_core.sql`: starter schema, constraints, RPC, helper auth dan RLS.

## 5. Jalankan

```bash
npm run dev
```

Buka `http://localhost:4173`. Pada penggunaan pertama, buat nama toko, nama Owner, username, dan PIN sendiri. Pilih data contoh untuk menjelajahi layar. Akun Kasir dibuat dari halaman Karyawan.

## 6. Batasan yang diketahui

- Local mode menggunakan satu browser/perangkat dan `localStorage`, bukan database multi-user. Local PIN hash mencegah penyimpanan PIN polos, tetapi bukan pengganti Supabase Auth, RLS atau kontrol server.
- Tidak ada sinkronisasi lintas perangkat, transaksi offline penuh, payment gateway, pengiriman notifikasi, atau koneksi printer Bluetooth native.
- Cetak struk memanfaatkan dialog print browser. Lebar 58/80 mm mengikuti pengaturan CSS, perlu diuji pada printer target.
- QRIS/transfer diverifikasi manual. Demo checkbox hanya simulasi verifikasi operator, bukan konfirmasi bank/payment provider.
- Akun karyawan di backend perlu diprovisikan melalui Edge Function/server tepercaya, bukan menggunakan service-role key di browser.
- Migration Supabase belum diterapkan/diuji pada project nyata. RLS lintas toko, SQL transaction rollback, concurrency, dan permission harus diuji di staging sebelum dipakai.
- Pengeluaran dan beberapa perubahan profil masih memakai state lokal di demo; backend memerlukan RPC tambahan dan aturan audit yang konsisten.

## 7. Rekomendasi urutan pengembangan berikutnya

1. Review migration dan jalankan pada Supabase development.
2. Tambah Supabase Auth + onboarding Owner + provisioning Kasir aman.
3. Implementasikan repository adapter dan pindahkan checkout/void/stock/shift ke RPC.
4. Implementasikan RPC pengeluaran, edit kategori/produk, permission karyawan, dan audit immutable.
5. Tambahkan integration tests untuk RLS dua toko/dua peran, concurrency stok, idempotency, rollback, dan close-shift/post-close void.
6. Jalankan E2E browser pada desktop dan mobile, lalu pilot dengan data non-sensitif.
