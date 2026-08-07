# Product Requirements Document (PRD) — v2.0
# Sistem POS Multi-Cabang (Multi-Branch) — "Kasir Unggul"

**Versi:** 2.0 (multi-cabang) · menggantikan v1.0 single-store
**Pemilik Produk:** Aziz
**Status:** Siap dieksekusi oleh Claude Code
**Tech Stack:** Next.js 15 (App Router) · TypeScript (strict) · Tailwind CSS · shadcn/ui · Supabase (Postgres + Auth + Storage + RLS + Realtime) · Recharts · Vercel

> Dokumen ini bersifat **mandiri**: memuat seluruh kebutuhan (single-store + multi-cabang + keamanan). Kerjakan mengikuti roadmap di §13, dimulai dari migrasi skema + RLS.
>
> **Catatan status:** Ini adalah spesifikasi tertulis. Bila aplikasi Kasir Unggul sudah berjalan (dibangun Claude Code), **sumber kebenaran fitur adalah kode yang berjalan**; PRD ini adalah dokumen pendamping/acuan maksud fitur. Bila ada perbedaan, selaraskan PRD dengan kode nyata lebih dulu.

---

> ## 🔄 REKONSILIASI DENGAN SISTEM AKTUAL — 2026-08-06
>
> Dokumen ini **sudah diselaraskan** dengan database produksi (dump di `docs/schema-dump/`,
> 10 berkas CSV: 30 tabel, 34 fungsi, 60 policy, 15 enum) dan kode yang berjalan.
>
> **Aturan yang dipakai:** bila PRD berbeda dengan sistem aktual, **sistem aktual yang menang** —
> karena sudah melewati QA dan disesuaikan dengan kebutuhan nyata di lapangan. Seluruh perbedaan
> sudah ditulis ulang ke dalam dokumen ini.
>
> **Penanda dalam dokumen:**
> - ✅ **AKTUAL** — sudah terpasang & berjalan di produksi
> - ⏳ **BELUM** — tertulis di PRD tapi belum ada di sistem; tetap dipertahankan sebagai rencana
> - 🆕 **AKTUAL (di luar PRD asli)** — berjalan di produksi tapi tidak pernah ditulis di PRD
>
> Ringkasan lengkap perbedaan ada di **§16**: 4 enum · 14 tabel/kolom · 4 perilaku ·
> 11 fitur berjalan di luar PRD · 4 rencana yang belum ada.
> **Empat perbedaan perilaku menyangkut klaim keamanan yang belum benar-benar terpasang** —
> baca §16-D lebih dulu sebelum mengandalkan §7.

---

## 1. Ringkasan & Tujuan

Aplikasi POS berbasis web multi-cabang untuk transaksi penjualan, manajemen produk & stok per cabang, pembayaran (Cash/QRIS/Transfer), rekonsiliasi kas per shift, laporan konsolidasi & per cabang, dengan **kontrol keamanan keuangan dan produk** yang mencegah manipulasi oleh karyawan. Setara aplikasi POS profesional kelas enterprise.

**Tujuan utama:**
1. Mengelola banyak cabang dari satu sistem, dengan isolasi data antar cabang yang ketat.
2. Tiga peran dengan wewenang berbeda: Master Admin (global), Manajer Toko (per cabang), Kasir (per cabang).
3. Menjamin integritas keuangan & stok: data tidak bisa diubah/dihapus diam-diam.
4. Menyajikan dashboard & laporan yang dapat diunduh, konsolidasi maupun per cabang, lengkap dengan diagram.

---

## 2. Prinsip Desain Utama (fondasi wajib)

Semua implementasi harus tunduk pada tiga prinsip ini:

1. **Branch-scoped by default (RLS-first).** Setiap data operasional melekat pada `branch_id`. Manajer & kasir hanya bisa membaca/menulis data cabang tempat mereka ditugaskan — ditegakkan di **database (Supabase RLS)**, bukan hanya di UI.
2. **Immutability + jejak audit.** Pergerakan stok & audit bersifat **append-only**: tidak boleh di-`UPDATE`/`DELETE`. Semua aksi sensitif tercatat permanen dan tahan-rusak.
   > ✅ **AKTUAL:** append-only + hash chain terpasang pada `stock_movements` dan `audit_logs`.
   > ⏳ **BELUM:** `transactions` **belum** append-only — hanya punya trigger `assign_seq_no`.
   > Pembatalan saat ini dilakukan **in-place** (`UPDATE status='void'`), bukan lewat entri
   > pembalik. Kolom `reversal_of`, `prev_hash`, `row_hash` sudah ada tapi belum dipakai.
   > Mengaktifkan guard-nya menuntut `create_sale`/`void_sale`/`refund_sale` ditulis ulang
   > dengan model reversal — lihat §7.1 dan §16-D.
3. **Segregation of Duties.** Pembuat transaksi tidak boleh menyetujui/membatalkan transaksinya sendiri. Kasir menjalankan, Manajer meninjau & menyetujui, Master Admin mengawasi.

---

## 3. Peran & Model Multi-Cabang

### 3.1 Tiga Peran
- **Master Admin** — peran **global** lintas cabang (`profiles.is_master_admin = true`). Menguasai seluruh sistem.
- **Manajer Toko** — peran **per cabang** (via keanggotaan). Boleh ditugaskan ke **satu atau lebih** cabang.
- **Kasir** — peran **per cabang** (via keanggotaan). Umumnya satu cabang; arsitektur mendukung lebih.

### 3.2 Keanggotaan Cabang
User terhubung ke cabang lewat tabel `branch_memberships` (bukan kolom role tunggal):
- Master Admin **tidak** butuh keanggotaan (aksesnya global via flag).
- Manajer & kasir punya **satu baris keanggotaan per cabang** berisi `role` + `permissions[]`.
- Satu user boleh punya beberapa keanggotaan (mis. manajer 2 cabang) — didukung penuh.

### 3.3 Penetapan Master Admin
Master Admin pertama ditetapkan **langsung di database** (`profiles.is_master_admin = true`). Tidak ada UI untuk mempromosikan diri menjadi Master Admin. Setelah ada, Master Admin dapat mengelola user & cabang lain via UI.

### 3.4 Provisioning User (dilakukan Master Admin)
- **Form Tambah Cabang** → membuat cabang baru.
- **Form Tambah User ke Cabang** → pilih cabang, undang/pilih user, tetapkan role (Manajer/Kasir), atur permission granular. Pembuatan akun auth hanya oleh Master Admin.
- Kasir & manajer **tidak** bisa membuat/mendaftarkan user.

### 3.5 Isolasi Antar Cabang
- Saat login, manajer/kasir melihat **pemilih cabang** hanya berisi cabang haknya; bila satu cabang, langsung terkunci.
- Semua query difilter `branch_id ∈ cabang milik user`. Upaya akses cabang lain (via API/URL) **ditolak RLS**.

---

## 4. Matriks Hak Akses (RBAC per cabang)

| Kapabilitas | Master Admin | Manajer (di cabangnya) | Kasir (di cabangnya) |
|---|---|---|---|
| Kelola cabang (tambah/edit/nonaktif) | ✅ | ❌ | ❌ |
| Kelola user & hak akses (semua cabang) | ✅ | ❌ | ❌ |
| Katalog produk global (master produk & HPP) | ✅ | ❌ | ❌ |
| Atur stok & harga per cabang | ✅ (semua) | ⚙️ | ❌ |
| Transaksi / checkout | ✅ | ✅ | ✅ |
| Buka/tutup shift | ✅ | ✅ | ✅ |
| Stock opname | ✅ | ✅ | ⚙️ |
| Setujui void/refund/diskon/override/adjustment | ✅ | ✅ | ❌ |
| Pengaturan POS cabang (pajak, struk, rekening, QRIS) | ✅ | ✅ (cabangnya) | ❌ |
| Lihat data penjualan | ✅ (semua) | ✅ (cabangnya) | ⚙️ (shift/dirinya) |
| Lihat audit log | ✅ (semua) | ✅ (cabangnya) | ❌ |
| Transfer stok antar cabang | ✅ | ⚙️ (ajukan/terima) | ❌ |
| Terima barang / wastage | ✅ | ⚙️ | ❌ |
| Dashboard konsolidasi semua cabang | ✅ | ❌ | ❌ |
| Download laporan | ✅ (semua) | ✅ (cabangnya) | ❌ |
| Ubah HPP (harga modal) | ✅ | ❌ (lihat, opsional) | ❌ |

> ⚙️ = permission granular yang dapat dikonfigurasi Master Admin per user. Hak default Manajer mencakup: stock opname, pengaturan POS cabang, lihat penjualan cabang, dan audit log cabang.

### 4.1 Daftar Permission Granular (`branch_memberships.permissions`)
`transaction.void`, `transaction.refund`, `discount.override`, `price.override`,
`product.branch_edit`, `stock.opname`, `stock.adjust`, `stock.receive`, `stock.wastage`,
`stock.transfer_request`, `stock.transfer_receive`, `report.view`, `report.export`,
`sales.view_branch`, `settings.branch_edit`, `audit.view`, `approval.grant`,
`cash.drop`, `cash.pettycash`.

**Default Manajer:** `stock.opname, stock.adjust, stock.receive, stock.wastage, stock.transfer_request, stock.transfer_receive, report.view, report.export, sales.view_branch, settings.branch_edit, audit.view, approval.grant, discount.override, price.override, cash.drop, cash.pettycash`.
**Default Kasir:** `cash.drop` saja; sisanya OFF kecuali diaktifkan.

> ✅ **AKTUAL — terpasang persis.** Ke-19 permission dan kedua daftar default di atas ada di
> `lib/constants.ts` (`BRANCH_PERMISSIONS`, `DEFAULT_MANAGER_PERMISSIONS`,
> `DEFAULT_CASHIER_PERMISSIONS`) dan diisi ke `branch_memberships.permissions`.
>
> ⚠️ **Tapi DUA model peran hidup berdampingan.** Selain yang di atas, sistem masih memakai
> model v1 di `profiles`:
>
> | Model | Kolom | Isi | Dipakai oleh |
> |---|---|---|---|
> | v2 (per cabang) | `branch_memberships.role` + `.permissions` | `manager`/`cashier` + 19 permission | Helper `has_branch_role()`, `has_branch_permission()` |
> | v1 (global) | `profiles.role` + `.permissions` | `admin`/`kasir` + 7 permission | `is_admin()`, `has_permission()`, **seluruh policy Storage** |
>
> Peran v1 hanya 7: `product.create`, `product.edit`, `product.delete`, `product.upload_image`,
> `stock.opname`, `transaction.void`, `transaction.refund`. Pembuatan karyawan menulis ke
> **kedua** model sekaligus (`branchRoleFor()` memetakan `admin→manager`, `kasir→cashier`).
> Jangan hapus kolom v1 sebelum policy Storage dipindahkan.

---

## 5. Keputusan Arsitektur Data (baca sebelum coding)

1. **Katalog produk GLOBAL, stok & harga PER CABANG.**
   - `products` = definisi master (nama, SKU, kategori, barcode, HPP baseline) — dikelola Master Admin.
   - `branch_products` = per cabang: harga jual (boleh override), stok, stok minimum, aktif/nonaktif.
   - Master Admin dapat "tambah-kurang produk antar cabang" dari satu tempat.
2. **`branch_id` melekat di semua tabel operasional** (transactions, payments, cash_sessions, stock_movements, audit_logs, dll.).
3. **Stok bukan angka bebas** — stok adalah hasil akumulasi `stock_movements` (ledger). `branch_products.stock` hanyalah cache yang selalu disinkronkan lewat RPC.
4. **Transaksi & ledger immutable** — tidak ada `UPDATE`/`DELETE`; koreksi via reversal.

---

## 6. Functional Requirements

### 6.1 Autentikasi & Keanggotaan
- Login email+password (Supabase Auth); reset password via email; 2FA untuk Master Admin & Manajer (opsional fase lanjut).
- Setelah login: muat profil + daftar keanggotaan cabang → tentukan cabang aktif (pemilih cabang bila >1).
- `profiles`: nama, telepon, avatar, `is_master_admin`, `is_active`.
- Trigger `handle_new_user` membuat baris `profiles` otomatis saat signup; FK `profiles.id → auth.users.id ON DELETE CASCADE`.

### 6.2 Manajemen Cabang (Master Admin)
- CRUD cabang: nama, kode unik, alamat, telepon, timezone, status aktif.
- Halaman detail cabang: daftar karyawan, ringkasan performa, pengaturan cabang, rekening & QRIS cabang.
- Nonaktifkan cabang = soft-disable (data historis tetap).

### 6.3 Manajemen User ke Cabang (Master Admin)
- Tambah/undang user, tetapkan role per cabang + permission granular, aktif/nonaktif keanggotaan.
- Satu user dapat memiliki banyak keanggotaan.
- Semua perubahan hak akses tercatat di `audit_logs`.

### 6.4 Katalog Produk Global (Master Admin)
- CRUD master produk: nama, SKU (unik, auto/manual), barcode, kategori/sub-kategori, deskripsi, satuan, **HPP baseline** (hanya Master Admin), status aktif.
- Foto produk (1 utama + maks 4) di Supabase Storage (kompres sebelum upload).
- Hapus = **soft delete** (`deleted_at`).
- Kelola ketersediaan produk per cabang (aktifkan/nonaktifkan, tetapkan harga & stok minimum default per cabang).

### 6.5 Produk per Cabang (`branch_products`)
- Harga jual per cabang (boleh override baseline), stok minimum per cabang, status aktif per cabang.
- Manajer (bila diberi `product.branch_edit`) boleh ubah harga/min-stock cabangnya; **tidak** boleh ubah master produk atau HPP.

### 6.6 Inventory — Ledger, Opname, Transfer, Penerimaan, Wastage
- **Stock ledger** (`stock_movements`): setiap perubahan stok tercatat dengan tipe (`initial, sale, void, refund, restock, opname, adjustment, transfer_out, transfer_in, wastage`), `qty_change`, `stock_after`, alasan, pembuat, dan **hash chain**.
- **Stock opname:** buat sesi → input stok fisik vs sistem → selisih otomatis + alasan → stok disesuaikan lewat ledger (tipe `opname`).
  > ⏳ **BELUM — berbeda dari rencana PRD.** `complete_opname()` berjalan langsung
  > `draft → completed` **tanpa approval**. Enum `opname_status` di produksi hanya punya dua
  > nilai (`draft`, `completed`) — tidak ada `pending_approval`/`rejected` — dan tabel
  > `stock_opnames` **tidak punya kolom `approved_by`**.
  > Bandingkan: **penyesuaian stok** (`adjust_stock`) dan **wastage** (`request_wastage`)
  > **sudah** ber-approval penuh — lihat §6.11.
  >
  > ✅ **KEPUTUSAN PEMILIK (2026-08-06):** ini **belum sempat**, bukan disengaja. Approval opname
  > **tetap menjadi target**, dikerjakan **setelah** migrasi multi-tenant selesai — agar tidak
  > menambah perubahan perilaku pada fase yang Aturan Emas-nya justru melarang itu.
  > Sampai saat itu, **perilaku tanpa approval adalah baseline uji regresi** yang sah.
- **Transfer antar cabang (dua sisi):** cabang asal *dispatch* (stok keluar → "in transit"), cabang tujuan *receive* (stok masuk). Status: `draft → dispatched → received/cancelled`. Stok tak bisa hilang diam-diam.
- **Penerimaan barang (Goods Receipt):** stok masuk terikat supplier (opsional) + "diterima oleh" + opsi update HPP. Mencegah restock fiktif.
- **Wastage/barang rusak:** pencatatan qty + alasan + approval + foto (opsional).
- **Alert stok menipis** per cabang (stock ≤ min_stock) di dashboard & halaman stok.

### 6.7 Sesi Kas / Shift + Kas Non-Penjualan
- **Buka shift:** kasir input **uang awal**; tanpa shift `open`, transaksi cash diblokir. Satu kasir hanya satu shift `open` per cabang.
- **Cash movements** (`cash_movements`): cash drop (setor ke brankas), petty cash out, expense, float in — semua tercatat + (untuk pengeluaran) butuh approval + lampiran bukti.
- 🆕 **Pengeluaran kas operasional** (`cash_expenses`) — tabel **terpisah** dari `cash_movements`,
  tidak pernah ditulis di PRD asli. Berisi `amount`, `category`, `source`, `note`, `created_by`,
  terikat ke `cash_session_id`. Dipakai untuk mencatat pengeluaran per shift, dan ikut mengurangi
  kas seharusnya lewat `cash_sessions.total_expenses`.
- **Tutup shift (blind count):** kasir input hitungan fisik **tanpa** melihat angka "seharusnya".
  Sistem menghitung:
  ```
  Uang Awal + Penjualan Tunai − Cash Drop − Petty/Expense = Kas Seharusnya
  Selisih = Hitungan Fisik − Kas Seharusnya   (lebih / kurang)
  ```
  Ringkasan shift: **total per kanal** + TOTAL. Selisih tercatat & selisih berulang ditandai.
  > 🆕 **AKTUAL:** `cash_sessions` menyimpan total per kanal —
  > `total_cash`, `total_qris`, `total_transfer`, **`total_gofood`, `total_shopeefood`,
  > `total_grabfood`**, dan **`total_expenses`**. PRD asli hanya menyebut tiga yang pertama.

### 6.8 Transaksi / Checkout (Layar Kasir)
- Pencarian cepat (nama/SKU/scan barcode), tab kategori, grid produk cabang aktif (hanya produk aktif di cabang itu).
- Keranjang: tambah/qty/hapus, diskon per item & total, subtotal/diskon/pajak/total.
- Hold/Park sale. Catatan & data pelanggan (opsional).
- Checkout hanya bila shift `open`.
- 🆕 **Ongkos kirim** (`transactions.shipping_cost`) — kolom wajib pada setiap transaksi, tidak
  pernah ditulis di PRD asli. Dipakai untuk penjualan berbasis pengiriman & kanal online, dan
  ikut dihitung terpisah di laporan (`shipping_total`).
- Void = memerlukan **approval** (lihat §6.11); stok & kas dikembalikan via ledger.
  > ⏳ **BERBEDA dari rencana PRD.** `void_sale()` melakukan pembatalan **in-place**:
  > `UPDATE transactions SET status='void', voided_by=…, voided_at=now()`.
  > **Bukan** transaksi reversal baru. Stok tetap dikembalikan lewat `stock_movements`
  > (tipe `void`) sehingga ledger tetap utuh — yang belum ada hanyalah model reversal pada
  > tabel `transactions`. Model reversal tetap jadi rencana; lihat §7.1.

### 6.9 Pembayaran
✅ **AKTUAL — enam metode**, bukan tiga seperti PRD asli (`payment_method` di produksi):

| Metode | Keterangan |
|---|---|
| `cash` | Hitung kembalian, tombol nominal cepat |
| `qris` | Tampilkan QRIS cabang + referensi |
| `transfer` | Pilih bank → tampilkan rekening cabang + referensi |
| 🆕 `gofood` | Kanal pesan-antar online |
| 🆕 `shopeefood` | Kanal pesan-antar online |
| 🆕 `grabfood` | Kanal pesan-antar online |

- 🆕 **Rekening bank bersifat dinamis.** PRD asli mengunci `bank enum('BNI','BCA','BSI')`.
  Di produksi, `bank_accounts.bank` dan `payments.bank` bertipe **`text`** sehingga Master Admin
  bisa menambah bank apa pun. Enum `bank_code` masih ada di database tapi **tidak lagi dipakai**
  oleh kedua kolom itu.
- Semua pembayaran tersimpan di `payments` (dengan `branch_id`) → sumber laporan keuangan.
- MVP: pembayaran tunggal; split payment = fase lanjut.

### 6.10 Struk / Receipt
- Struk digital + cetak (thermal 58/80mm via browser print / PDF). Isi: identitas cabang, no transaksi (`{prefix}-{branch}-{YYYYMMDD}-{seq}`), kasir, item, subtotal/diskon/pajak/total, metode bayar, uang diterima & kembalian, footer.
- 🆕 **Struk publik** (`/struk/[id]`) — halaman struk yang bisa dibuka tanpa login, untuk dibagikan
  ke pelanggan. Memakai service-role di server.
- ⏳ **Reprint log BELUM ada.** PRD asli menyatakan jumlah reprint dicatat untuk deteksi
  penyalahgunaan. Di produksi tidak ditemukan kolom, tabel, maupun fungsi apa pun yang
  mencatat reprint. Dipertahankan sebagai rencana (§7.5 mengandalkannya untuk sinyal
  "reprint berlebih").

### 6.11 Alur Persetujuan (Approvals)
Aksi sensitif membuat permintaan `approvals` yang harus disetujui Manajer/Master Admin, peminta ≠ penyetuju. Semua tercatat (peminta, penyetuju, alasan, waktu).

✅ **AKTUAL — tujuh jenis** (`approval_type` di produksi), bukan enam seperti PRD asli:

| Jenis | Status implementasi |
|---|---|
| `stock_adjustment` | ✅ `adjust_stock(p_approval_id)` mengonsumsi approval |
| 🆕 `wastage` | ✅ `request_wastage` → `approve_wastage` / `reject_wastage` (tidak ada di PRD asli) |
| `discount_override` | ✅ divalidasi di `create_sale` |
| `void`, `refund`, `price_override`, `no_sale` | terdaftar di enum |

- 🆕 `approvals.payload jsonb` — kolom tambahan di produksi, menyimpan rincian permintaan
  (mis. daftar item wastage) agar penyetuju bisa meninjau tanpa membuka tabel lain.
- ⏳ **Overlay PIN manajer BELUM ada.** PRD asli menyebut approval lewat "PIN manajer/overlay".
  Di produksi, persetujuan dilakukan lewat halaman **Persetujuan** (`/approvals`) oleh akun
  yang berwenang — bukan overlay PIN di layar kasir.

### 6.12 Rekap Penjualan
- Tabel transaksi cabang (atau semua cabang untuk Master Admin): no, tanggal/jam, cabang, kasir, item, total, metode (pill), status.
- Filter: cabang, rentang tanggal, metode, kasir, status. Detail transaksi (drawer). Export CSV/Excel.
- RLS: manajer/kasir hanya cabangnya; Master Admin semua.

### 6.13 Dashboard
- **Konsolidasi (Master Admin):** total seluruh cabang, leaderboard/perbandingan antar cabang, tren gabungan (harian/mingguan/bulanan), breakdown metode bayar gabungan, produk terlaris lintas cabang, kontribusi tiap cabang, alert lintas cabang (stok & selisih kas), panel exception.
- **Per Cabang:** KPI (pendapatan hari/minggu/bulan, jumlah transaksi, rata-rata, estimasi laba kotor), tren, donut metode bayar, produk terlaris, performa kasir, alert. Master Admin bisa pilih cabang; manajer terkunci cabangnya.

### 6.14 Laporan & Download
Tersedia **konsolidasi** & **per cabang**, filter tanggal, dengan diagram, ekspor **PDF (ber-diagram)** & **Excel/CSV**:
- **Laporan Keuangan:** pendapatan, per metode bayar, HPP & laba kotor, kas masuk/keluar (drop/petty/expense), setoran, laba bersih ringkas.
- **Laporan Keluar-Masuk Produk (Stock Ledger):** tiap pergerakan + saldo berjalan.
- **Laporan Transaksi Lengkap:** transaksi + item + pembayaran + status (termasuk void/refund).
- **Laporan Rekonsiliasi Shift/Kas** per kasir.
- **Laporan Exception/Audit** (§7.5).
> Laporan dihitung dari ledger immutable, diberi stempel "dibuat pada" + hash agar dapat diverifikasi.

### 6.15 Pengaturan
- **Per cabang (`branch_settings`):** pajak (aktif/persen/inklusif; default non-aktif), footer struk, prefix nomor, QRIS cabang. Rekening bank cabang (`bank_accounts` per cabang, nama bank **bebas/dinamis**).
  > 🆕 **AKTUAL:** `branch_settings` juga menyimpan **tema tampilan per cabang** —
  > `theme_preset`, `theme_primary`, `theme_radius`, `theme_font`. Tidak ada di PRD asli.
- **Global (`org_settings`):** nama organisasi, logo, ambang approval default
  (`default_discount_threshold`, `default_adjustment_threshold`).
  > 🆕 **AKTUAL:** + `alert_whatsapp` — nomor WhatsApp penerima peringatan anti-fraud.
  > ⚠️ Kategori produk **tidak** disimpan di sini; ada di tabel `categories` tersendiri.
- 🆕 **`store_settings` (warisan v1, MASIH AKTIF).** Tidak pernah ditulis di PRD v2, tapi masih
  dibaca di **13 titik** — termasuk layout, layar kasir, struk, dan invoice. Menyimpan
  `store_name`, `logo_url`, `address`, `phone`, `receipt_footer`, `qris_image_url`, `tax_*`,
  `trx_prefix`. Sebagian isinya tumpang tindih dengan `branch_settings` dan `org_settings`.
  Jangan dihapus tanpa memindahkan ke-13 titik itu lebih dulu.

---

## 7. Keamanan Keuangan & Anti-Manipulasi

### 7.1 Transaksi & Nomor Urut

> ⚠️ **BACA INI SEBELUM MENGANDALKAN §7.** Klaim immutability di bawah **belum sepenuhnya
> terpasang** di produksi. Diverifikasi langsung dari dump database 2026-08-06.

| Klaim PRD asli | Status aktual |
|---|---|
| Transaksi tidak pernah diedit/dihapus | ⏳ **BELUM** — `transactions` tidak punya guard append-only. Satu-satunya trigger di tabel itu adalah `trg_assign_seq_no` |
| Pembatalan = transaksi reversal tertaut | ⏳ **BELUM** — `void_sale()` melakukan `UPDATE … SET status='void', voided_by, voided_at`. Kolom `reversal_of` ada tapi tidak pernah diisi |
| `seq_no` berurutan per cabang | ✅ **AKTUAL** — trigger `assign_seq_no()` |
| Deteksi gap nomor urut | ✅ **AKTUAL** — RPC `branch_seq_gaps()`, tampil di modul **Keamanan** |
| Z-report harian mengunci angka | ✅ **AKTUAL** — RPC `close_daily()` → `daily_closures` |

**Kenapa belum:** mengaktifkan guard pada `transactions` menuntut `create_sale`, `void_sale`, dan
`refund_sale` ditulis ulang dengan model reversal penuh. Mengaktifkannya lebih dulu akan
**mematahkan pembatalan & refund** yang sekarang berjalan. Ini keputusan sadar, bukan kelalaian —
lihat `CLAUDE.md`.

### 7.2 Audit Log Tahan-Rusak (Hash Chain, Append-Only)
- Tiap baris audit menyimpan `row_hash = hash(payload ‖ prev_hash)`. Mengubah/menghapus satu entri memutus rantai → terdeteksi.
- Dicatat: siapa (`actor_id`), kapan, cabang, aksi, entitas, dan **`metadata jsonb`**.
  > ⚠️ **BERBEDA dari PRD asli.** PRD menjanjikan kolom terpisah `before jsonb` dan `after jsonb`.
  > Di produksi hanya ada **satu** kolom `metadata jsonb`. Artinya "nilai sebelum vs sesudah"
  > tidak terstruktur — tergantung apa yang kebetulan diisi pemanggil. Menyulitkan §7.5
  > (deteksi anomali) yang mengandalkan perbandingan nilai lama vs baru.

✅ **AKTUAL — terpasang pada dua tabel:**

| Tabel | `guard_append_only` | `hash_chain` |
|---|---|---|
| `audit_logs` | ✅ | ✅ |
| `stock_movements` | ✅ | ✅ |
| `transactions` | ⏳ belum | ⏳ belum (kolom ada, tidak pernah diisi) |

- `guard_append_only()` menolak `UPDATE`/`DELETE` **tanpa syarat apa pun** — termasuk untuk
  service role dan Master Admin. Tidak ada jalan pintas.
- ⚠️ **Belum ada verifikator rantai.** Hash ditulis saat `INSERT`, tapi tidak ada satu pun kode
  atau RPC yang **memeriksa** keutuhan rantai. Rantai yang rusak tidak akan terdeteksi sampai
  ada yang memeriksanya secara manual. Layak ditambahkan sebagai `verify_hash_chain(table)`.

### 7.3 Segregation of Duties & Approval
- Aksi sensitif butuh approval pihak berbeda (§6.11). Kasir tak bisa menyetujui aksinya sendiri.

### 7.4 Kontrol Kas
- **Blind cash count**, **cash drop**, **petty cash/expense** ber-approval + bukti, **Z-report harian** (`daily_closures`) yang mengunci total per cabang.
- (Fase lanjut) **rekonsiliasi settlement**: impor mutasi bank / settlement QRIS, cocokkan dengan `payments`.

### 7.5 Deteksi Anomali / Exception
Dashboard exception per kasir/cabang menandai: void/refund tinggi, banyak no-sale, diskon manual berlebih, selisih kas berulang (khususnya kurang), post-void, reprint berlebih, transaksi tepat di bawah ambang approval (structuring), transaksi di luar jam, adjustment stok besar tanpa sebab sepadan. Alert real-time (email/Slack/WhatsApp) untuk kejadian berisiko tinggi.

### 7.6 Keamanan Produk/Stok
- Stok hanya berubah lewat tipe gerakan sah; tidak ada "set stok" bebas.
- Opname & adjustment butuh approval + alasan; HPP terkunci Master Admin (perubahan tercatat sebelum/sesudah, disembunyikan dari kasir); transfer dua sisi.

### 7.7 Akses & Sesi
- Semua total dihitung ulang di server/DB (jangan percaya client). Least privilege. Timeout sesi. (Opsional) pengikatan perangkat ke cabang.

---

## 8. Skema Database (Supabase / Postgres)

> Semua tabel: `id uuid default gen_random_uuid()`, `created_at`, `updated_at` (bila relevan), **RLS aktif**. Soft delete `deleted_at` bila relevan.
>
> ✅ **Blok di bawah sudah diselaraskan dengan database produksi (dump 2026-08-06).**
> Terverifikasi: **30 tabel, RLS aktif di semuanya.** Tanda 🆕 = ada di produksi tapi tidak
> pernah ditulis di PRD asli. Tanda ⚠️ = berbeda dari PRD asli.

```
profiles
  id uuid PK FK->auth.users ON DELETE CASCADE
  full_name, phone, avatar_url
  is_master_admin boolean default false
  is_active boolean default true
  ⚠️ role user_role('admin','kasir')   -- WARISAN v1, MASIH AKTIF
  ⚠️ permissions text[]                -- WARISAN v1, MASIH AKTIF
  -- is_admin() & policy Storage masih membaca `role`, BUKAN is_master_admin.
  -- Dua model peran hidup berdampingan; jangan hapus kolom lama.

branches
  id, code text UNIQUE, name, address, phone, timezone, is_active
  -- Cabang Utama ber-id tetap: 00000000-0000-0000-0000-0000000000c1
  -- ⚠️ TIDAK ada kolom penanda "cabang pusat"; id itu di-hardcode di 13 RPC,
  --    7 DEFAULT kolom, dan 44 titik kode TypeScript.

branch_memberships
  id, user_id FK->profiles, branch_id FK->branches
  role enum('manager','cashier'), permissions text[], is_active
  UNIQUE(user_id, branch_id)

categories
  id, name, parent_id (self-FK, nullable)

products                       -- katalog global
  id, sku UNIQUE, barcode
  name, description, category_id FK
  base_cost_price numeric       -- HPP baseline (master admin only)
  unit, image_url, image_urls text[]
  is_active, deleted_at
  ⚠️ -- KOLOM WARISAN v1 YANG MASIH ADA DI PRODUKSI (tidak ditulis di PRD asli):
  ⚠️ sell_price numeric, cost_price numeric   -- cost_price masih dipakai
  ⚠️                                          -- dashboard_analytics utk gross_profit
  ⚠️ stock numeric, min_stock numeric         -- disinkron hanya utk cabang pusat
  ⚠️ is_taxable boolean
  ⚠️ discount_type enum('none','amount','percent'), discount_value numeric
  ⚠️ supplier text                            -- teks bebas, terpisah dari tabel suppliers

branch_products                -- per cabang
  id, branch_id FK, product_id FK
  price numeric, min_stock numeric, stock numeric  -- stock = cache dari ledger
  is_active, UNIQUE(branch_id, product_id)
  -- Disinkron otomatis oleh trigger trg_sync_bp_insert / trg_sync_bp_update
  -- pada tabel products.

stock_movements                -- ✅ LEDGER append-only + hash chain (AKTIF)
  id, branch_id FK, product_id FK
  type enum('initial','sale','void','refund','opname','adjustment','restock',
            'transfer_out','transfer_in','wastage')
  qty_change numeric, stock_after numeric
  ⚠️ reference_id uuid, note text   -- PRD asli menulis `reference_type` + `reason`;
  ⚠️                                -- keduanya TIDAK ADA di produksi
  created_by FK, created_at
  prev_hash text, row_hash text
  -- branch_id NOT NULL DEFAULT '…c1'  ⚠️ (lihat catatan `branches`)

stock_opnames
  id, branch_id FK, code
  ⚠️ status enum('draft','completed')   -- HANYA DUA nilai di produksi.
  ⚠️                                    -- PRD asli menulis 4 (+pending_approval, +rejected)
  ⚠️ -- TIDAK ADA kolom approved_by. Opname berjalan TANPA approval.
  created_by FK, completed_at, note
stock_opname_items
  id, opname_id FK, product_id FK, system_qty, physical_qty, difference, reason

stock_transfers
  id, code, from_branch_id FK, to_branch_id FK
  status enum('draft','dispatched','received','cancelled')
  created_by, dispatched_by, received_by, dispatched_at, received_at, note
stock_transfer_items
  id, transfer_id FK, product_id FK, qty

suppliers
  id, name, phone, note, is_active
  -- ⚠️ TIDAK punya branch_id — katalog global lintas cabang
goods_receipts
  id, branch_id FK, code, supplier_id FK nullable
  status enum('draft','received','cancelled'), received_by FK, received_at, note
goods_receipt_items
  id, receipt_id FK, product_id FK, qty, cost_price numeric

wastages                       -- ✅ ber-approval penuh
  id, branch_id FK, code, status enum('pending_approval','approved','rejected')
  reason, photo_url, created_by FK, approved_by FK
wastage_items
  id, wastage_id FK, product_id FK, qty

cash_sessions
  id, branch_id FK, cashier_id FK
  opening_balance numeric, status enum('open','closed')
  opened_at, closed_at
  expected_cash, counted_cash, variance
  total_cash, total_qris, total_transfer, note
  🆕 total_gofood, total_shopeefood, total_grabfood   -- total per kanal online
  🆕 total_expenses                                    -- akumulasi cash_expenses

cash_movements                 -- kas non-penjualan ber-approval
  id, branch_id FK, cash_session_id FK
  type enum('drop','pettycash_out','expense','float_in')
  amount numeric, reason, receipt_url
  created_by FK, approved_by FK, created_at

🆕 cash_expenses               -- TIDAK ADA di PRD asli. Terpisah dari cash_movements.
  id, cash_session_id FK, branch_id FK
  amount numeric, category text, source text, note text
  created_by FK, created_at
  ⚠️ -- branch_id TIDAK PERNAH DIISI oleh kode (selalu jatuh ke DEFAULT '…c1').
  ⚠️ -- Tidak berdampak pada angka: RLS & seluruh pembacaan mengambil jalur
  ⚠️ -- cash_session_id -> cash_sessions.branch_id.

bank_accounts
  id, branch_id FK
  ⚠️ bank text                  -- BUKAN enum. Nama bank BEBAS/dinamis.
  ⚠️                            -- Enum bank_code('BNI','BCA','BSI') masih ada di DB
  ⚠️                            -- tapi TIDAK dipakai kolom ini.
  account_number, account_name, is_active
  UNIQUE(branch_id, bank)

transactions                   -- ⚠️ BELUM immutable (lihat §7.1)
  id, branch_id FK, code UNIQUE, seq_no bigint   -- ✅ berurutan per cabang
  cashier_id FK, cash_session_id FK
  customer_name, customer_phone
  subtotal, discount_total, tax_total, grand_total numeric
  🆕 shipping_cost numeric NOT NULL              -- ongkos kirim, tidak ada di PRD asli
  status enum('completed','void','refunded')
  🆕 voided_by uuid, voided_at timestamptz       -- bukti void dilakukan IN-PLACE
  reversal_of uuid nullable                      -- ⚠️ ADA tapi TIDAK PERNAH DIISI
  note, created_at
  prev_hash text, row_hash text                  -- ⚠️ ADA tapi TIDAK PERNAH DIISI
  -- Satu-satunya trigger: trg_assign_seq_no. TIDAK ada guard_append_only,
  -- TIDAK ada hash_chain.
transaction_items
  id, transaction_id FK, product_id FK
  product_name_snapshot, sku_snapshot
  unit_price, qty, discount, line_total
  -- ⚠️ TIDAK punya branch_id (diturunkan lewat transaction_id)
payments
  id, transaction_id FK, branch_id FK
  ⚠️ method enum('cash','qris','transfer','gofood','shopeefood','grabfood')  -- ENAM
  ⚠️ bank text                                   -- BUKAN enum; dinamis
  amount, cash_received, change_given, reference, created_at

approvals
  id, branch_id FK
  ⚠️ request_type enum('void','refund','discount_override','price_override',
                       'stock_adjustment','no_sale','wastage')   -- TUJUH, +wastage
  reference_type text, reference_id uuid
  requested_by FK, approved_by FK
  status enum('pending','approved','rejected'), reason, created_at, decided_at
  🆕 payload jsonb               -- rincian permintaan utk ditinjau penyetuju

branch_settings                -- satu baris per cabang
  id, branch_id FK UNIQUE
  tax_enabled boolean, tax_percent, tax_inclusive boolean
  receipt_footer, qris_image_url, trx_prefix
  🆕 theme_preset, theme_primary, theme_radius, theme_font   -- tema per cabang

org_settings                   -- satu baris global (⚠️ TANPA kunci tenant)
  id, org_name, logo_url, default_discount_threshold, default_adjustment_threshold
  🆕 alert_whatsapp text         -- nomor penerima peringatan anti-fraud

🆕 store_settings              -- WARISAN v1, MASIH AKTIF di 13 titik baca.
  id, store_name, logo_url, address, phone                    -- ⚠️ TANPA kunci tenant
  receipt_footer, qris_image_url, trx_prefix
  tax_enabled, tax_percent, tax_inclusive
  theme_preset, theme_primary, theme_radius, theme_font
  -- Tumpang tindih dgn branch_settings & org_settings. Dibaca di layout, layar
  -- kasir, struk, dan invoice. Jangan dihapus tanpa memindahkan 13 titik itu.

🆕 notifications               -- TIDAK ADA di PRD asli
  id, user_id FK->profiles, type text, title text, body text
  link text, read_at, created_at
  -- ⚠️ Terikat ke USER, bukan ke cabang. Tidak punya branch_id.

daily_closures                 -- ✅ Z-report harian yang mengunci angka
  id, branch_id FK, business_date date
  totals jsonb, closed_by FK, closed_at, is_locked boolean
  UNIQUE(branch_id, business_date)

audit_logs                     -- ✅ APPEND-ONLY + hash chain (AKTIF)
  id, branch_id FK nullable, actor_id FK
  action, entity, entity_id
  ⚠️ metadata jsonb              -- SATU kolom. PRD asli menjanjikan
  ⚠️                             -- `before jsonb` + `after jsonb` TERPISAH.
  created_at, prev_hash text, row_hash text
```

### 8.1 Integritas Data
- `transaction_items` menyimpan snapshot nama & harga produk saat transaksi.
- `grand_total` transaksi = jumlah `amount` pada `payments`-nya.
- Penjualan, void, opname, transfer, wastage, penerimaan barang → **wajib** lewat RPC atomik yang sekaligus menulis `stock_movements` dan menyinkronkan `branch_products.stock`.

### 8.2 Ringkasan 30 tabel produksi (RLS aktif di semuanya)

| Kelompok | Tabel |
|---|---|
| Identitas & organisasi | `profiles`, `branches`, `branch_memberships` |
| Katalog | `categories`, `products`, `branch_products`, `suppliers` |
| Ledger & stok | `stock_movements`, `stock_opnames`, `stock_opname_items`, `stock_transfers`, `stock_transfer_items`, `goods_receipts`, `goods_receipt_items`, `wastages`, `wastage_items` |
| Kas & shift | `cash_sessions`, `cash_movements`, `cash_expenses` 🆕, `bank_accounts` |
| Penjualan | `transactions`, `transaction_items`, `payments` |
| Kontrol | `approvals`, `daily_closures`, `audit_logs` |
| Pengaturan | `branch_settings`, `org_settings`, `store_settings` 🆕 |
| Lain | `notifications` 🆕 |

---

## 9. Keamanan & RLS (Supabase)

### 9.1 Fungsi Helper (SQL)
✅ **AKTUAL — keempatnya terpasang** (`STABLE SECURITY DEFINER`, `search_path = public`):
- `is_master_admin()` → cek `profiles.is_master_admin`. **Global lintas cabang.**
- `user_branch_ids()` → himpunan `branch_id` dari keanggotaan aktif user.
- `has_branch_role(b uuid, r branch_role)` → user punya role `r` di cabang `b`.
- `has_branch_permission(b uuid, perm text)` → permission `perm` di cabang `b` (atau master admin).

🆕 **Dua helper warisan v1 yang MASIH AKTIF** (tidak disebut di PRD asli):
- `is_admin()` → cek `profiles.role = 'admin'` — **bukan** `is_master_admin`.
- `has_permission(perm text)` → cek `profiles.permissions`.

⚠️ **Penting:** ketiga policy **Storage** (foto produk, QRIS, logo) memakai `is_admin()` dan
`has_permission()`, **bukan** helper berbasis cabang. Jadi kontrol akses berkas masih memakai
model peran v1 sepenuhnya.

📊 **Skala nyata:** 60 policy di skema `public`; **31 di antaranya memanggil `is_master_admin()`**.
Fungsi itu adalah jalan pintas RLS terbesar di sistem.

### 9.2 Pola Policy (tiap tabel branch-scoped)
- **SELECT:** `is_master_admin() OR branch_id = ANY(user_branch_ids())`
- **INSERT/UPDATE:** kondisi SELECT **DAN** cek role/permission sesuai aksi (mis. `settings.branch_edit` untuk `branch_settings`).
- **Tabel ledger/immutable** (`transactions`, `stock_movements`, `audit_logs`): **tidak ada** izin `UPDATE`/`DELETE` untuk siapa pun; hanya `INSERT` (via RPC) + `SELECT` sesuai scope.
- **Kolom sensitif:** `products.base_cost_price` & data HPP tidak boleh terkirim ke kasir (gunakan view/RPC khusus atau seleksi kolom di server).

### 9.3 Trigger Wajib

| Trigger | Target | Status |
|---|---|---|
| `guard_append_only` | `stock_movements`, `audit_logs` | ✅ terpasang |
| `guard_append_only` | `transactions` | ⏳ **BELUM** (lihat §7.1) |
| `hash_chain` | `stock_movements`, `audit_logs` | ✅ terpasang |
| `hash_chain` | `transactions` | ⏳ **BELUM** — kolomnya ada, tidak pernah diisi |
| `assign_seq_no` | `transactions` | ✅ terpasang |
| Deteksi gap | RPC `branch_seq_gaps()` | ✅ terpasang (bukan trigger) |
| `set_updated_at` | 14 tabel | ✅ terpasang |
| `handle_new_user` | `auth.users` | ✅ terpasang — hanya membuat `profiles` |
| `guard_profile_privilege` | `profiles` | 🆕 ✅ mencegah eskalasi hak sendiri (tidak di PRD asli) |
| `sync_branch_products_insert/update` | `products` | 🆕 ✅ sinkron katalog → `branch_products` (tidak di PRD asli) |

### 9.4 Storage
✅ **AKTUAL — tiga bucket, semuanya BACA PUBLIK:** `product-images`, `qris`, `store-logos`.

⚠️ **Policy tulis TIDAK dibatasi path.** `storage_admin_write` dan
`storage_product_images_write` keduanya bertipe `FOR ALL` (mencakup `UPDATE` dan `DELETE`) dan
hanya memeriksa `bucket_id` + peran v1 (`is_admin()` / `has_permission()`). **Tidak ada
pembatasan berdasarkan cabang maupun path.**

Konsekuensinya dalam satu organisasi: kasir mana pun yang punya `product.upload_image` dapat
mengganti atau menghapus foto produk **cabang mana pun**, dan admin mana pun dapat mengganti
gambar **QRIS cabang mana pun**. Path objek saat ini juga rata tanpa penanda cabang
(`products/<uuid>.jpg`, `store/qris-<uuid>.jpg`).

> ✅ **KEPUTUSAN PEMILIK (2026-08-06):** policy Storage **dipindahkan ke helper berbasis
> cabang/workspace saat migrasi multi-tenant**. Migrasi itu memang sudah wajib menyentuh policy
> Storage untuk menambahkan prefiks path `workspace_id`, jadi penggantian `is_admin()` /
> `has_permission()` → `has_branch_permission()` + guard workspace dikerjakan sekalian.
> Kolom `profiles.role` **tidak** dihapus — masih dipakai jalur lain.

---

## 10. Arsitektur Teknis & Konvensi

### 10.1 Stack & Library
Next.js 15 (App Router, RSC default) · TypeScript strict · Tailwind + shadcn/ui · Supabase (`@supabase/ssr`) · react-hook-form + zod · TanStack Query · Recharts · Vercel.

### 10.2 Struktur Folder — ✅ AKTUAL

Struktur nyata berbeda dari yang "disarankan" di PRD asli: grup route bernama `(dashboard)`
bukan `(app)`, `/catalog` menjadi `/products`, dan ada **empat route tambahan**.

```
/app
  /(auth)/login, /forgot-password, /reset-password
  /auth                  -- callback
  /(dashboard)
    /branches            -- kelola cabang (master admin)
    /employees           -- kelola user & hak akses (master admin)
    /products            -- katalog produk global   ⚠️ PRD asli menyebutnya /catalog
    /harga-cabang        -- 🆕 harga & stok minimum per cabang
    /pos                 -- layar kasir (cabang aktif)
    /inventory           -- stok, opname, penyesuaian
    /gudang              -- 🆕 transfer antar cabang, penerimaan barang, wastage
    /shifts              -- sesi kas / rekonsiliasi
    /sales               -- rekap penjualan
    /dashboard           -- konsolidasi + per cabang
    /reports             -- laporan & unduhan
    /approvals           -- kotak persetujuan
    /keamanan            -- 🆕 celah nomor urut, penutupan harian (Z-report)
    /audit-logs          -- 🆕 penelusuran audit log
    /settings            -- pengaturan cabang & global
  /struk/[id]            -- 🆕 struk publik (tanpa login, service-role)
  /print/receipt/[id], /print/shift/[id]
/lib/supabase /lib/validations
  ⚠️ /lib/rbac dan /lib/reports TIDAK ADA — RBAC di lib/permissions.ts & lib/auth.ts
/components/ui /components/domain
/supabase/migrations    -- 26 migrasi (0001…0026)
/types
```

### 10.3 CLAUDE.md (tambahan wajib)
Cantumkan prinsip §2 sebagai aturan keras: **branch-scoped RLS**, **immutability/append-only**, **segregation of duties**, **server-side authority** (total dihitung di DB/server), **HPP tidak bocor ke kasir**.

---

## 11. UI/UX Requirements
- Web tablet/desktop-first (≥1280px), responsif; layar kasir touch-friendly (tap target ≥44px).
- **Pemilih cabang** jelas di top bar (bila user punya >1 cabang); indikator cabang aktif konsisten.
- Format Rupiah (`Rp1.234.567`), tanggal lokal Indonesia, bahasa Indonesia.
- Empty state, loading skeleton, konfirmasi aksi destruktif, toast sukses/gagal.
- Overlay approval (PIN manajer) untuk aksi sensitif.
- Palet 8am (indigo/navy) — konsisten dengan hasil desain Stitch/Figma.

---

## 12. Non-Functional Requirements
- **Keamanan:** RLS ketat & teruji lintas cabang; append-only; tidak ada kebocoran HPP/antar cabang.
- **Integritas:** operasi stok/keuangan atomik via RPC; stok tak pernah inkonsisten.
- **Auditability:** semua aksi sensitif tercatat & tahan-rusak.
- **Performa:** layar kasir responsif; query dashboard/laporan efisien (index + view/materialized view bila perlu).
- **Skalabilitas:** desain mendukung banyak cabang & volume transaksi tinggi.
- **Keandalan:** (fase lanjut) offline-first untuk POS; backup & retensi data keuangan.

---

## 13. Roadmap / Fase Pengerjaan

> **Status per 2026-08-06** (diverifikasi dari 26 migrasi `0001`–`0026` + dump produksi):
>
> | Fase | Status |
> |---|---|
> | 0 — Migrasi skema & RLS | ✅ selesai (`0015`) |
> | 1 — Peran & manajemen cabang | ✅ selesai — ⚠️ model peran v1 masih hidup berdampingan (§4.1) |
> | 2 — Katalog & operasional per cabang | ✅ selesai (`0016`, `0017`, `0023`) |
> | 3 — Kasir, pembayaran, shift | ✅ selesai — 🆕 melampaui rencana: 6 metode bayar + ongkir |
> | 4 — Keamanan & anti-fraud | ⚠️ **sebagian** (`0018`) — `seq_no`, gap detection, Z-report, approval ✅; **immutability `transactions` belum** (§16-D) |
> | 5 — Inventory lanjutan | ✅ selesai (`0019`–`0021`, `0024`) — ⚠️ kecuali approval opname |
> | 6 — Dashboard & laporan | ✅ selesai (`0006`, `0022`, `0026`) |
> | 7 — Lanjutan | ⏳ belum — kecuali alert WhatsApp (`org_settings.alert_whatsapp`) |
>
> **Sisa pekerjaan Fase 4** adalah satu-satunya utang besar dari roadmap ini, dan sengaja
> ditunda karena menuntut penulisan ulang `create_sale`/`void_sale`/`refund_sale`.

**Fase 0 — Migrasi Skema & RLS (Opus, paling kritikal)**
Tambah `branches`, `branch_memberships`, `branch_products`, `branch_id` di tabel operasional; helper + policy branch-scoped; trigger append-only, hash chain, seq_no, handle_new_user; migrasi data lama ke "Cabang Utama"; ubah `profiles` (master flag + memberships).

**Fase 1 — Peran & Manajemen Cabang**
3 peran, form tambah cabang, provisioning user ke cabang, pemilih cabang + isolasi akses (uji RLS lintas cabang).

**Fase 2 — Katalog & Operasional Per Cabang**
Katalog produk global + `branch_products` (stok/harga per cabang), pengaturan POS per cabang (pajak/struk/rekening/QRIS).

**Fase 3 — Kasir, Pembayaran, Shift**
Layar kasir per cabang, pembayaran (Cash/QRIS/Transfer), sesi kas + blind count + cash movements, struk + reprint log, RPC `create_sale` atomik.

**Fase 4 — Keamanan & Anti-Fraud**
Transaksi immutable + seq_no + gap detection, audit hash-chain append-only, approval workflow, Z-report harian.

**Fase 5 — Inventory Lanjutan**
Opname ber-approval, transfer antar cabang dua sisi, goods receipt, wastage.

**Fase 6 — Dashboard & Laporan**
Dashboard konsolidasi + per cabang (diagram), semua laporan + ekspor PDF/Excel, dashboard exception.

**Fase 7 — Lanjutan (opsional)**
Deteksi anomali & alert, rekonsiliasi settlement bank/QRIS, offline-first, promosi terkontrol, loyalty, 2FA, device binding.

---

## 14. Asumsi & Keputusan
1. **Satu manajer boleh menangani >1 cabang** — didukung via keanggotaan (default diizinkan).
2. **Fitur lanjutan** (offline-first, rekonsiliasi settlement, loyalty) ditempatkan di Fase 7, bukan MVP.
3. **PPN** default non-aktif per cabang; aktifkan bila perlu.
4. **Rekening bank & QRIS per cabang** — diisi Master Admin/Manajer di pengaturan cabang.
5. **Split payment & varian produk** — fase lanjut, bukan MVP.
6. Master Admin pertama di-set manual di DB.

---

## 15. Catatan untuk Claude Code
- Kerjakan **Fase 0 dengan Opus**; salah desain RLS = kebocoran data antar cabang.
- Semua mutasi stok/keuangan lewat **Postgres function (RPC)** atomik; jangan update dari client.
- Implementasikan trigger: append-only, hash chain, seq_no + gap detection.
- **Uji RLS eksplisit**: user manajer/kasir cabang A tidak boleh membaca/menulis data cabang B (uji via query langsung, bukan hanya UI).
- Perbarui `reset-dev-data.sql`: tambahkan tabel-tabel baru; pertahankan `profiles`, `auth.users`, dan minimal satu `branches` default.
- Verifikasi kasir tidak pernah menerima kolom HPP/`base_cost_price`.

---

*Setelah PRD ini disetujui, langkah eksekusi: buat paket prompt Claude Code per fase (mengikuti §13), dimulai dari migrasi skema + RLS.*

---
---

# 16. Rekonsiliasi PRD ↔ Sistem Aktual (2026-08-06)

**Sumber:** dump database produksi di `docs/schema-dump/` (30 tabel, 34 fungsi aplikasi,
60 policy, 15 enum, 28 trigger) + pembacaan kode `app/` dan `lib/`.

**Aturan:** bila berbeda, **sistem aktual yang menang** — sudah melewati QA dan disesuaikan
dengan kebutuhan nyata di lapangan. Seluruh perbedaan sudah ditulis ulang ke dalam dokumen ini.

## 16-A. Yang sudah SESUAI (tidak perlu diubah)

Skema inti PRD v2 terpasang dengan setia: 30 tabel dengan **RLS aktif di semuanya**, keempat
helper RLS (`is_master_admin`, `user_branch_ids`, `has_branch_role`, `has_branch_permission`),
katalog global + `branch_products` per cabang, ledger `stock_movements` append-only + hash chain,
`seq_no` per cabang + deteksi gap, Z-report harian, transfer dua sisi, dan **ke-19 permission
granular** di §4.1 lengkap dengan kedua daftar default-nya.

## 16-B. Enum — 4 perbedaan

| Enum | PRD asli | Aktual |
|---|---|---|
| `payment_method` | 3: cash, qris, transfer | **6** — +`gofood`, +`shopeefood`, +`grabfood` |
| `approval_type` | 6 | **7** — +`wastage` |
| `opname_status` | 4: draft, pending_approval, completed, rejected | **2** — hanya draft, completed |
| `bank` | enum('BNI','BCA','BSI') | **`text`** — nama bank bebas/dinamis |

## 16-C. Tabel & kolom — 14 perbedaan

| # | Objek | Perbedaan |
|---|---|---|
| 1 | `cash_expenses` | 🆕 tabel penuh, tidak ada di PRD |
| 2 | `notifications` | 🆕 tabel penuh, tidak ada di PRD |
| 3 | `store_settings` | 🆕 warisan v1 masih aktif di 13 titik baca |
| 4 | `transactions.shipping_cost` | 🆕 ongkos kirim, NOT NULL |
| 5 | `transactions.voided_by/_at` | 🆕 bukti void in-place |
| 6 | `cash_sessions.total_gofood/_shopeefood/_grabfood` | 🆕 total per kanal online |
| 7 | `cash_sessions.total_expenses` | 🆕 akumulasi `cash_expenses` |
| 8 | `branch_settings.theme_*` | 🆕 4 kolom tema per cabang |
| 9 | `org_settings.alert_whatsapp` | 🆕 nomor penerima alert anti-fraud |
| 10 | `approvals.payload` | 🆕 rincian permintaan (jsonb) |
| 11 | `products.*` | ⚠️ 8 kolom warisan v1 masih hidup (`sell_price`, `cost_price`, `stock`, `min_stock`, `is_taxable`, `discount_type`, `discount_value`, `supplier`) |
| 12 | `profiles.role/permissions` | ⚠️ model peran v1 masih aktif berdampingan dengan v2 |
| 13 | `stock_movements` | ⚠️ punya `reference_id` + `note`; PRD menulis `reference_type` + `reason` |
| 14 | `audit_logs.metadata` | ⚠️ **satu** kolom jsonb; PRD menjanjikan `before` + `after` terpisah |

## 16-D. Perilaku — 4 perbedaan yang menyangkut KEAMANAN

> Empat butir ini adalah alasan §7 tidak boleh dibaca apa adanya.

| # | Klaim PRD | Kenyataan | Dampak |
|---|---|---|---|
| 1 | `transactions` append-only, `UPDATE`/`DELETE` diblokir | Hanya `trg_assign_seq_no`. **Tidak ada** `guard_append_only` | Transaksi masih bisa diubah lewat jalur ber-hak |
| 2 | Pembatalan = transaksi reversal tertaut | `void_sale()` melakukan `UPDATE … SET status='void'`. `reversal_of` tidak pernah diisi | Tidak ada jejak "transaksi asli utuh + pembalik" |
| 3 | `transactions` ber-hash chain | Kolom `prev_hash`/`row_hash` ada tapi **tidak pernah diisi** | Tidak ada bukti tahan-rusak untuk transaksi |
| 4 | Opname butuh approval Manajer | `complete_opname()` langsung `draft → completed` | Penyesuaian stok lewat opname tanpa mata kedua |

**Catatan penting untuk butir 1–3:** ini **keputusan sadar, bukan kelalaian.** Mengaktifkan
guard pada `transactions` menuntut `create_sale`, `void_sale`, dan `refund_sale` ditulis ulang
dengan model reversal penuh; mengaktifkannya lebih dulu akan mematahkan pembatalan & refund yang
sekarang berjalan. Tercatat juga di `CLAUDE.md`.

**Butir 4** perlu diputuskan tersendiri: apakah opname memang sengaja tanpa approval (mis. karena
di lapangan menghambat), atau memang belum sempat dikerjakan. Bandingkan dengan `adjust_stock`
dan `request_wastage` yang **sudah** ber-approval penuh.

## 16-E. Fitur berjalan yang tidak pernah ditulis di PRD — 11 butir

| Fitur | Bukti |
|---|---|
| Kanal pesan-antar online (GoFood/ShopeeFood/GrabFood) | `payment_method`, `cash_sessions.total_*` |
| Ongkos kirim | `transactions.shipping_cost`, `shipping_total` di laporan |
| Pengeluaran kas per shift | tabel `cash_expenses` |
| Notifikasi in-app | tabel `notifications` |
| Tema & font per cabang | `branch_settings.theme_*` |
| Rekening bank dinamis | `bank_accounts.bank` bertipe text |
| Otonomi harga cabang | RPC `set_branch_price_stock`, `apply_price_override`, route `/harga-cabang` |
| Wastage ber-approval | `request_wastage` / `approve_wastage` / `reject_wastage` |
| Struk publik tanpa login | route `/struk/[id]` (service-role) |
| Sinkron katalog → cabang | trigger `trg_sync_bp_insert` / `trg_sync_bp_update` |
| Penjaga eskalasi hak | trigger `guard_profile_privilege` |

## 16-F. Yang tertulis di PRD tapi BELUM ada — 4 butir

| Fitur | § | Catatan | Keputusan pemilik (2026-08-06) |
|---|---|---|---|
| Verifikator rantai hash | §7.2 | Hash ditulis tapi tidak pernah **diperiksa**. Rantai rusak tidak akan terdeteksi | ✅ **Akan dikerjakan — setelah migrasi.** RPC `verify_hash_chain(table)` di modul Keamanan |
| Approval untuk opname | §6.6 | Lihat 16-D butir 4 | ✅ **Akan dikerjakan — setelah migrasi.** Belum sempat, bukan disengaja |
| Log reprint struk | §6.10 | Tidak ada kolom/tabel/fungsi apa pun. §7.5 mengandalkannya | ✅ **Akan dikerjakan — setelah migrasi** |
| Overlay PIN manajer | §6.11 | Persetujuan lewat halaman `/approvals`, bukan overlay di layar kasir | ⏳ belum diputuskan |

> **Prinsip yang dipakai untuk keempatnya:** tidak ada yang dikerjakan **di dalam** Fase 1B.
> Aturan Emas migrasi melarang perubahan perilaku, dan ketiga butir pertama **menambah**
> perilaku baru. Menggabungkannya akan mengaburkan sumber masalah bila uji regresi gagal.
>
> **Baseline uji regresi = perilaku SEKARANG**, bukan yang tertulis di PRD.

## 16-G. Utang teknis yang terungkap dari dump

1. **UUID Cabang Utama di-hardcode** di 13 RPC, 7 DEFAULT kolom, dan 44 titik kode TS.
   `branches` tidak punya kolom penanda cabang pusat.
2. **`cash_expenses.branch_id` tidak pernah diisi** — selalu jatuh ke DEFAULT `…c1`. Tidak
   berdampak pada angka karena semua pembacaan lewat `cash_session_id`, tapi isi kolomnya salah.
3. **Policy Storage tanpa batasan path** — `FOR ALL` + hanya cek peran v1. Foto produk & QRIS
   cabang mana pun bisa ditimpa siapa pun yang berhak upload.
4. **`BANKS` di `lib/constants.ts` sudah mati** — tidak dirujuk di mana pun setelah bank
   menjadi dinamis.
5. **`pg_trgm` terpasang di skema `public`**, bukan `extensions`.

## 16-H. Keputusan pemilik atas hasil rekonsiliasi (2026-08-06)

Tidak ada satu pun temuan di atas yang menghalangi migrasi multi-tenant. Tiga hal yang perlu
diputuskan sudah dijawab:

| # | Pertanyaan | Keputusan |
|---|---|---|
| 1 | Opname tanpa approval — disengaja? | **Belum sempat.** Approval tetap jadi target, dikerjakan **setelah** migrasi |
| 2 | Reprint log & verifikator hash — sekarang? | **Keduanya akan dikerjakan, setelah migrasi.** Tidak masuk Fase 1B |
| 3 | Kapan model peran v1 dipensiunkan? | **Policy Storage dipindah ke helper cabang/workspace saat migrasi** (sekalian dengan prefiks path). Kolom `profiles.role` tetap ada |

### Konsekuensi untuk uji regresi Fase 1B

> ⚠️ **Baseline uji regresi = perilaku SEKARANG, bukan yang tertulis di PRD.**

Empat butir di §16-D **tidak boleh** diuji sebagai "harus tetap sama" — karena memang belum
pernah ada. Menguji mereka akan menghasilkan kegagalan palsu dan membuang waktu mengejar bug
yang tidak eksis:

- ❌ Jangan uji: transaksi menolak `UPDATE`/`DELETE`
- ❌ Jangan uji: void menghasilkan transaksi reversal baru
- ❌ Jangan uji: `transactions.row_hash` terisi
- ❌ Jangan uji: opname meminta approval

Yang **harus** diuji tetap sama: void mengubah status **in-place** + mengembalikan stok lewat
`stock_movements`, opname langsung `draft → completed`, dan `seq_no` tetap berurutan tanpa celah.

### Antrean pasca-migrasi (jangan hilang)

1. Approval opname (enum +2 nilai, `stock_opnames.approved_by`, pisah request/approve)
2. `verify_hash_chain(table)` di modul Keamanan
3. Log reprint struk (untuk §7.5)
4. Immutability `transactions` + model reversal (Fase 4 yang tertunda — paling besar)
