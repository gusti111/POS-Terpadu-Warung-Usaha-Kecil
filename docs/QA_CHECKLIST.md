# QA Checklist — POS Terpadu v1.0.0

## A. Setup & sesi
- [ ] Buat workspace dengan seluruh field wajib terisi.
- [ ] Tolak nama toko/Owner kosong dan PIN di luar 4–6 digit.
- [ ] Login dengan PIN benar berhasil; PIN salah ditolak.
- [ ] Username tidak ditampilkan sebagai PIN/default credential.
- [ ] Logout menghapus sesi login, bukan menghapus data workspace.
- [ ] Refresh halaman tetap memuat data lokal dan sesi yang masih aktif sesuai perilaku sessionStorage.

## B. Produk & kategori
- [ ] Tambah kategori dan ubah nama kategori.
- [ ] Arsipkan kategori; pastikan produk lama tetap dapat dibaca dan kategori tidak hilang dari histori.
- [ ] Tambah produk dengan SKU, harga, HPP, stok awal, dan stok minimum.
- [ ] Tolak harga nol/negatif, HPP/stok negatif, dan SKU duplikat.
- [ ] Ubah produk tanpa mengubah stok secara tidak sengaja.
- [ ] Arsipkan produk; produk tidak muncul di katalog kasir.
- [ ] Cari produk berdasarkan nama dan SKU.

## C. POS & pembayaran
- [ ] Kasir tanpa shift tidak dapat checkout.
- [ ] Tambah produk ke cart dan ubah jumlah.
- [ ] Tolak kuantitas melebihi stok.
- [ ] Checkout tunai dengan uang cukup: status paid/completed, kembalian benar, stok berkurang.
- [ ] Checkout tunai dengan uang kurang ditolak tanpa mutasi stok atau transaksi parsial.
- [ ] Checkout QRIS/transfer belum diverifikasi: status pending, omzet tidak bertambah, stok tidak berkurang.
- [ ] Owner memverifikasi pembayaran pending: status paid/completed, stok dan total non-tunai shift diperbarui.
- [ ] Shift tidak dapat ditutup saat masih ada pembayaran Pending; Owner harus memverifikasi atau menandai gagal dengan alasan.
- [ ] Pending yang ditandai gagal tidak mengubah stok atau omzet dan dapat diselesaikan sebelum shift ditutup.
- [ ] Snapshot nama/harga/HPP transaksi lama tidak berubah setelah produk diedit.
- [ ] Klik checkout ganda/request replay tidak membuat penjualan ganda (domain idempotency test).

## D. Stok & void
- [ ] Penyesuaian stok masuk/keluar membutuhkan alasan.
- [ ] Tolak penyesuaian keluar yang membuat stok negatif.
- [ ] Setiap mutasi mempunyai stok sebelum/sesudah dan pelaku.
- [ ] Void hanya dapat dilakukan Owner dan wajib ada alasan.
- [ ] Void transaksi paid mengembalikan stok satu kali dan mengubah status payment menjadi refunded.
- [ ] Void tunai memperbarui kas refund dan kas diharapkan.
- [ ] Void setelah shift ditutup memperbarui expected cash dan selisih; kas aktual historis tidak diubah diam-diam.
- [ ] QRIS/transfer void tidak dianggap mengembalikan dana provider; refund dana tetap manual.

## E. Shift & pengeluaran
- [ ] Buka shift dengan kas awal non-negatif.
- [ ] Satu akun tidak bisa memiliki dua shift aktif.
- [ ] Perhitungan expected cash mengabaikan pembayaran non-tunai.
- [ ] Pengeluaran tunai mengurangi expected cash; transfer tidak mengubah kas laci.
- [ ] Edit/void pengeluaran tercatat dan tidak boleh mengubah shift yang sudah ditutup tanpa prosedur koreksi.
- [ ] Tutup shift mencatat expected, counted, difference, status dan waktu.

## F. Laporan, ekspor & UI
- [ ] Pending dan voided tidak dihitung sebagai omzet.
- [ ] HPP dan laba kotor sesuai snapshot transaksi paid.
- [ ] Pengeluaran aktif masuk laporan sesuai periode.
- [ ] CSV berisi baris dan header yang benar.
- [ ] Backup JSON dapat diunduh dan valid JSON.
- [ ] Struk mencetak data transaksi yang benar pada dialog print.
- [ ] Tema terang/gelap tetap memiliki kontras yang terbaca.
- [ ] Desktop: sidebar, tabel, dashboard, cart terbaca tanpa horizontal overflow yang tidak perlu.
- [ ] Mobile: navigasi drawer, form dan modal dapat dipakai dengan tap target yang cukup.
- [ ] Focus keyboard, label input, state error/loading/empty diperiksa.

## G. Backend Supabase — wajib sebelum produksi
- [ ] Migration hanya dicoba pada project development/staging kosong setelah review SQL.
- [ ] Owner dan Kasir memakai Auth user yang berbeda.
- [ ] RLS mengisolasi minimal dua toko.
- [ ] Kasir tidak dapat membaca data Kasir lain atau mengubah role/store_id.
- [ ] `service_role` tidak pernah dikirim ke browser.
- [ ] Checkout diuji dengan dua request bersamaan terhadap stok terbatas.
- [ ] Idempotency diuji setelah request pertama berhasil tetapi respons terputus.
- [ ] Rollback diuji saat satu operasi di tengah RPC gagal.
- [ ] Verifikasi pending dan void dijalankan hanya dengan hak Owner.
- [ ] Shift tutup, refund pasca tutup, dan koreksi pengeluaran disetujui pemilik proses.
- [ ] SQL tests, logs, backup, restore dan monitoring siap sebelum pilot.

## Bukti yang tersedia pada ZIP ini

- `npm test`: unit test Node.js untuk aturan domain dan inisialisasi local workspace.
- Syntax check `node --check` pada modul JavaScript.
- HTTP smoke check melalui `curl` mengembalikan `200` untuk halaman root.

Browser E2E tidak dinyatakan lulus: percobaan Playwright/Chromium pada lingkungan pembuatan diblokir oleh kebijakan browser (`ERR_BLOCKED_BY_ADMINISTRATOR`). Supabase SQL belum dieksekusi pada database, karena tidak ada koneksi project staging dalam sesi ini.
