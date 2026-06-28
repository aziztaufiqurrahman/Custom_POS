# Product Requirements Document (PRD)
# Sistem Point of Sale (POS) / Aplikasi Kasir

**Versi:** 1.0
**Pemilik Produk:** Aziz — 8am Business
**Status:** Draft untuk dikerjakan oleh Claude Code
**Tech Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · Supabase (Postgres + Auth + Storage + RLS) · Vercel

---

## 1. Ringkasan & Tujuan

### 1.1 Latar Belakang
Aplikasi POS berbasis web untuk mencatat transaksi penjualan, mengelola produk & stok, memproses pembayaran (Cash, QRIS, Transfer), serta menyajikan laporan penjualan dan pendapatan secara harian, mingguan, dan bulanan. Aplikasi harus setara dengan aplikasi POS profesional dari sisi kelengkapan fitur dan kemudahan pemakaian.

### 1.2 Tujuan Utama
1. Mempercepat dan merapikan proses transaksi di kasir.
2. Mengontrol stok produk secara akurat (termasuk stock opname).
3. Merekonsiliasi kas (uang awal + penjualan cash) secara otomatis di tiap shift.
4. Menyediakan rekap penjualan & pembayaran yang lengkap dan dapat diaudit.
5. Memberikan dashboard pendapatan yang mudah dibaca oleh pemilik.

### 1.3 Pengguna Target
- **Admin** — pemilik/supervisor toko.
- **Kasir** — karyawan operasional di mesin kasir.

---

## 2. Peran Pengguna & Hak Akses (RBAC)

Aplikasi memiliki **2 peran**: `admin` dan `kasir`. Hak akses ditegakkan di dua lapisan: (a) UI (menyembunyikan/menonaktifkan menu), dan (b) **Supabase Row Level Security (RLS)** di database sebagai pertahanan utama.

### 2.1 Penetapan Admin
- Akun **admin pertama** ditetapkan **langsung di database** (mengubah kolom `role` pada tabel `profiles` menjadi `admin`), sesuai permintaan. Tidak ada UI untuk "mempromosikan diri menjadi admin".
- Setelah ada minimal satu admin, admin dapat **mengundang/menambah karyawan** dan **mengatur peran serta hak aksesnya** melalui UI.

### 2.2 Matriks Hak Akses

| Fitur / Aksi | Admin | Kasir |
|---|---|---|
| Login / logout | ✅ | ✅ |
| Lihat & lakukan transaksi (checkout) | ✅ | ✅ |
| Mulai & tutup shift (input uang awal) | ✅ | ✅ |
| Tambah / edit / hapus produk | ✅ | ⚙️ *dapat dikonfigurasi* |
| Upload foto produk | ✅ | ⚙️ |
| Atur harga & harga modal | ✅ | ❌ (harga modal disembunyikan dari kasir) |
| Stock opname | ✅ | ⚙️ |
| Lihat rekap penjualan (semua kasir) | ✅ | ❌ (kasir hanya lihat transaksinya/shiftnya) |
| Lihat dashboard pendapatan & laba | ✅ | ❌ |
| Void / refund transaksi | ✅ | ⚙️ (butuh approval admin) |
| Kelola karyawan & hak akses | ✅ | ❌ |
| Kelola pengaturan toko, pajak, rekening bank | ✅ | ❌ |
| Lihat audit log | ✅ | ❌ |

> **⚙️ Dapat dikonfigurasi** — admin dapat menyalakan/mematikan izin granular ini per karyawan melalui halaman "Manajemen Karyawan". Disimpan sebagai daftar `permissions` (lihat skema DB).

### 2.3 Permission Granular (untuk fitur ⚙️)
`product.create`, `product.edit`, `product.delete`, `product.upload_image`, `stock.opname`, `transaction.void`, `transaction.refund`. Default kasir: hanya transaksi & shift; sisanya OFF kecuali diaktifkan admin.

---

## 3. Functional Requirements

### 3.1 Autentikasi & Manajemen Karyawan
- Login dengan email + password (Supabase Auth).
- Reset password via email.
- Admin dapat menambah karyawan baru (email + nama + peran + permission), menonaktifkan (soft-disable, bukan hapus), dan mengatur ulang permission.
- Setiap akun punya profil: nama lengkap, foto (opsional), nomor HP, status aktif.
- **Audit:** setiap login dan aksi sensitif (hapus produk, void, opname, ubah harga) tercatat di `audit_logs`.

### 3.2 Manajemen Produk (selengkap POS profesional)

**Field produk:**
- Nama produk *(wajib)*
- SKU / kode produk *(unik, auto-generate atau manual)*
- Barcode *(opsional, mendukung input via barcode scanner — scanner umumnya bertindak sebagai keyboard input)*
- Kategori & sub-kategori
- Deskripsi
- **Foto produk** (1 utama + maksimal 4 tambahan, disimpan di **Supabase Storage**, kompres otomatis sebelum upload)
- Harga jual *(wajib)*
- Harga modal / HPP *(untuk hitung laba — hanya terlihat admin)*
- Satuan unit (pcs, box, kg, liter, dll.)
- Stok saat ini
- Stok minimum / titik reorder *(memicu alert "stok menipis")*
- Pajak: produk kena PPN atau tidak *(lihat §3.9)*
- Diskon per produk (opsional: nominal atau persen)
- Status aktif/non-aktif *(produk non-aktif tidak muncul di kasir tapi tetap di histori)*
- Supplier *(opsional)*

**Varian produk (opsional, fase lanjutan):** dukungan varian seperti ukuran/warna dengan harga & stok terpisah per varian.

**Aksi:**
- Tambah produk (form lengkap dengan preview foto).
- Edit produk.
- Hapus produk → **soft delete** (`deleted_at`) agar histori transaksi tetap utuh; UI tampak seperti terhapus.
- Pencarian & filter (nama, SKU, barcode, kategori, status stok).
- Tampilan grid (kartu dengan foto) & tampilan tabel.
- Import/export produk via CSV *(opsional, fase lanjutan)*.

### 3.3 Inventory & Stock Opname
- **Stok bergerak otomatis:** setiap penjualan mengurangi stok; void/refund menambah kembali. Semua perubahan dicatat di `stock_movements` (tipe: `sale`, `void`, `refund`, `opname`, `adjustment`, `initial`, `restock`).
- **Stock Opname (penghitungan fisik):**
  - Kasir/admin (sesuai izin) membuat sesi opname.
  - Menampilkan stok sistem vs input stok fisik per produk.
  - Sistem menghitung selisih otomatis.
  - Wajib isi alasan untuk selisih (rusak, hilang, salah catat, dll.).
  - Setelah dikonfirmasi, stok sistem disesuaikan dan tercatat di `stock_movements` (tipe `opname`).
  - Riwayat opname tersimpan & dapat ditinjau.
- **Restock / barang masuk:** admin dapat menambah stok dengan mencatat sumber & (opsional) harga modal baru.
- **Alert stok menipis** ditampilkan di dashboard & halaman produk.

### 3.4 Sesi Kas / Uang Awal (Cash Session / Shift)

Ini fitur rekonsiliasi kas yang Anda minta.

- **Buka shift:** sebelum mulai transaksi, kasir wajib **input uang awal (modal kas/opening balance)**. Tanpa shift aktif, transaksi cash diblokir.
- Selama shift, semua transaksi terhubung ke `cash_session` yang aktif milik kasir tersebut.
- **Tutup shift:** kasir input **hitungan fisik uang di laci**, lalu sistem menampilkan rekonsiliasi:

```
Uang Awal (opening)            : Rp X
+ Total Penjualan CASH         : Rp Y
= Kas Cash Seharusnya (expected): Rp X + Y

Hitungan Fisik (actual count)  : Rp Z
Selisih (variance)             : Rp Z - (X + Y)   → lebih / kurang
```

- **Ringkasan shift juga menampilkan total per metode bayar:**
  - Total Cash, Total QRIS, Total Transfer (rincian per bank).
  - **Total Transaksi = Cash + QRIS + Transfer.**
- Selisih kas dicatat & dapat ditinjau admin.
- Satu kasir hanya boleh punya **satu shift aktif** dalam satu waktu.
- Laporan shift dapat dicetak/diekspor.

### 3.5 Transaksi / Checkout (Layar Kasir)
- Pencarian produk cepat (ketik nama / SKU / scan barcode).
- Tampilan kategori + grid produk berfoto untuk pemilihan cepat.
- Keranjang (cart): tambah item, ubah qty (+/-), hapus item.
- Diskon per item & diskon total (nominal atau persen).
- Tampilkan subtotal, diskon, pajak (PPN bila diaktifkan), dan **total akhir**.
- **Hold / Park sale:** simpan transaksi sementara untuk dilanjutkan (mis. pelanggan ambil barang lain).
- Catatan transaksi (opsional) & data pelanggan (opsional: nama/HP).
- Setelah bayar → **struk** dibuat (lihat §3.7).
- **Void transaksi** (butuh izin/approval admin) → stok dikembalikan, tercatat di audit.

### 3.6 Pembayaran (Payment)

Tiga metode wajib:

1. **Cash**
   - Input "uang diterima", sistem menghitung **kembalian** otomatis.
   - Tombol nominal cepat (mis. Rp50.000, Rp100.000, uang pas).

2. **QRIS**
   - Tampilkan QRIS toko (gambar QRIS statis dari pengaturan).
   - Kasir konfirmasi pembayaran berhasil + (opsional) nomor referensi.

3. **Transfer Bank** — pilih bank: **BNI, BCA, BSI**
   - Tampilkan **nomor rekening + nama pemilik** sesuai bank terpilih (dari pengaturan).
   - Input nomor referensi/keterangan transfer (opsional).

**Catatan desain:**
- Mendukung **pembayaran tunggal** dahulu (MVP). *Split payment* (gabungan beberapa metode dalam satu transaksi) menjadi fase lanjutan.
- Setiap pembayaran tersimpan di tabel `payments` dengan metode, bank (jika transfer), nominal, referensi → inilah sumber data untuk **integrasi laporan keuangan**.

### 3.7 Struk / Receipt
- Struk digital (tampil di layar) + opsi **cetak** (thermal printer 58mm/80mm via browser print, atau export PDF).
- Isi struk: nama & logo toko, alamat, tanggal/jam, nomor transaksi, nama kasir, daftar item (qty × harga), subtotal, diskon, pajak, total, metode bayar, uang diterima & kembalian (untuk cash), ucapan terima kasih.
- Nomor transaksi unik berurutan (mis. `TRX-YYYYMMDD-0001`).

### 3.8 Rekap Penjualan
- Daftar **semua transaksi** dengan kolom: no. transaksi, tanggal/jam, kasir, jumlah item, total, **metode pembayaran**, status (selesai/void/refund).
- **Filter:** rentang tanggal, metode bayar, kasir, status, shift.
- **Pencarian** berdasarkan nomor transaksi/pelanggan.
- **Detail transaksi:** klik untuk lihat rincian item & pembayaran.
- **Ringkasan di atas tabel:** total transaksi, total per metode (Cash/QRIS/Transfer per bank), jumlah item terjual.
- **Export** ke CSV/Excel.
- Akses: admin melihat semua; kasir hanya melihat transaksi shift/dirinya (sesuai §2.2).

### 3.9 Pajak (PPN) — Konteks Indonesia
- Pengaturan pajak global: aktif/non-aktif, persentase (mis. PPN 11%), mode **inklusif** (pajak sudah termasuk harga) atau **eksklusif** (pajak ditambahkan di akhir).
- Per produk dapat ditandai kena pajak atau tidak.
- *(Default disarankan: pajak NON-AKTIF dulu agar sederhana — tinggal diaktifkan bila perlu. Mohon konfirmasi preferensi Anda.)*

### 3.10 Dashboard Penjualan / Pendapatan (Admin)
Menampilkan kesimpulan penjualan **harian, mingguan, bulanan**, mencakup:

- **Kartu ringkasan (KPI):** Pendapatan hari ini, minggu ini, bulan ini; jumlah transaksi; rata-rata nilai transaksi; **estimasi laba kotor** (jika harga modal terisi).
- **Grafik tren penjualan** (garis/bar) — pilih rentang harian/mingguan/bulanan.
- **Breakdown per metode pembayaran** (Cash / QRIS / Transfer per bank) — chart pie/bar.
- **Produk terlaris** (top 10) berdasarkan qty & nilai.
- **Penjualan per kategori.**
- **Performa per kasir** (total penjualan per karyawan).
- **Alert stok menipis & selisih kas terbaru.**
- Filter rentang tanggal kustom.

### 3.11 Pengaturan (Admin)
- **Profil toko:** nama, logo, alamat, no. HP, footer struk.
- **Rekening bank:** nomor rekening + nama pemilik untuk BNI, BCA, BSI.
- **QRIS:** upload gambar QRIS statis.
- **Pajak:** sesuai §3.9.
- **Kategori produk.**
- **Manajemen karyawan & hak akses.**
- **Format nomor transaksi.**

---

## 4. Skema Database (Supabase / Postgres)

> Semua tabel pakai `id uuid default gen_random_uuid()`, `created_at`, `updated_at`. Gunakan **RLS** di semua tabel. Soft delete dengan `deleted_at` di mana relevan.

```
profiles
  id (uuid, FK -> auth.users)
  full_name, phone, avatar_url
  role: enum('admin','kasir')
  permissions: text[]            -- granular permissions untuk kasir
  is_active: boolean
  created_at, updated_at

categories
  id, name, parent_id (nullable, self-FK), created_at

products
  id, sku (unique), barcode (nullable)
  name, description, category_id (FK)
  image_url, image_urls (text[])  -- foto utama + tambahan
  sell_price (numeric)
  cost_price (numeric, nullable)   -- HPP, hanya admin
  unit (text), stock (numeric), min_stock (numeric)
  is_taxable (boolean)
  discount_type enum('none','amount','percent'), discount_value
  is_active (boolean), deleted_at (nullable)
  created_at, updated_at

stock_movements
  id, product_id (FK)
  type: enum('initial','sale','void','refund','opname','adjustment','restock')
  qty_change (numeric)            -- + masuk / - keluar
  stock_after (numeric)
  reference_id (uuid, nullable)   -- mis. transaction_id / opname_id
  note, created_by (FK profiles), created_at

stock_opnames
  id, code, status enum('draft','completed')
  created_by (FK), completed_at, note, created_at

stock_opname_items
  id, opname_id (FK), product_id (FK)
  system_qty, physical_qty, difference, reason

cash_sessions                     -- shift
  id, cashier_id (FK profiles)
  opening_balance (numeric)
  status enum('open','closed')
  opened_at, closed_at
  expected_cash, counted_cash, variance   -- diisi saat tutup
  total_cash, total_qris, total_transfer  -- ringkasan
  note

bank_accounts
  id, bank enum('BNI','BCA','BSI')
  account_number, account_name, is_active

transactions
  id, code (unique, mis. TRX-YYYYMMDD-0001)
  cashier_id (FK), cash_session_id (FK)
  customer_name (nullable), customer_phone (nullable)
  subtotal, discount_total, tax_total, grand_total
  status enum('completed','void','refunded')
  note, voided_by (nullable), voided_at (nullable)
  created_at

transaction_items
  id, transaction_id (FK), product_id (FK)
  product_name_snapshot, sku_snapshot        -- snapshot agar histori tetap akurat
  unit_price, qty, discount, line_total

payments
  id, transaction_id (FK)
  method enum('cash','qris','transfer')
  bank enum('BNI','BCA','BSI', null)
  amount (numeric)
  cash_received (nullable), change_given (nullable)
  reference (nullable)
  created_at

store_settings                    -- single row
  id, store_name, logo_url, address, phone, receipt_footer
  qris_image_url
  tax_enabled (boolean), tax_percent, tax_inclusive (boolean)
  trx_prefix

audit_logs
  id, actor_id (FK), action, entity, entity_id
  metadata (jsonb), created_at
```

### 4.1 Catatan Integritas Data
- `transaction_items` menyimpan **snapshot** nama & harga produk saat transaksi, sehingga rekap historis tidak berubah meski produk diedit/dihapus.
- Pengurangan stok & pembuatan `stock_movements` sebaiknya dilakukan dalam **satu transaksi DB / Postgres function (RPC)** agar atomik (mencegah stok tidak konsisten).
- `grand_total` transaksi harus sama dengan jumlah `amount` di `payments`-nya.

---

## 5. Keamanan & RLS (Supabase)
- **Wajib** aktifkan RLS di semua tabel; tidak boleh ada tabel terbuka.
- Helper: fungsi `is_admin()` (cek `profiles.role = 'admin'`) dan `has_permission(perm text)`.
- Contoh aturan:
  - `products`: SELECT untuk semua user terautentikasi; INSERT/UPDATE/DELETE hanya admin atau kasir dengan permission terkait.
  - `cost_price` disembunyikan dari kasir (gunakan **view** khusus atau filter kolom di query; jangan kirim `cost_price` ke klien kasir).
  - `transactions`/`payments`: kasir hanya boleh SELECT baris milik shift/dirinya; admin semua.
  - `store_settings`, `profiles` (ubah role/permission), `bank_accounts`: tulis hanya admin.
- Foto produk & QRIS di **Supabase Storage** dengan policy yang sesuai (baca publik untuk foto produk bila perlu; QRIS bisa publik-read).
- Jangan pernah menaruh `cost_price`, data sensitif, atau service key di sisi klien.

---

## 6. Arsitektur Teknis & Konvensi Proyek

### 6.1 Stack
- **Next.js 15 (App Router)** + **TypeScript** (mode strict).
- **Tailwind CSS** + **shadcn/ui** untuk komponen.
- **Supabase**: Postgres, Auth, Storage, RLS, Realtime (opsional untuk update stok live).
- **Recharts** (atau setara) untuk grafik dashboard.
- **Vercel** untuk deployment.
- **Zod** untuk validasi form + **react-hook-form**.
- **TanStack Query** untuk data fetching/caching (opsional tapi disarankan).

### 6.2 Konvensi Claude Code (sesuai pola Anda)
- `CLAUDE.md` — panduan proyek, aturan stack, konvensi penamaan, perintah build/test.
- `mcp.json` — konfigurasi **Context7 MCP** (untuk dokumentasi library terbaru).
- `.claude/skills/` dan `.claude/hooks/` sesuai pola proyek sebelumnya.
- Variabel lingkungan di `.env.local` (jangan commit): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (hanya server).

### 6.3 Struktur Folder (disarankan)
```
/app
  /(auth)/login
  /(dashboard)
    /pos                 -- layar kasir
    /products            -- manajemen produk
    /inventory           -- stok & opname
    /shifts              -- sesi kas / shift
    /sales               -- rekap penjualan
    /dashboard           -- dashboard pendapatan (admin)
    /settings            -- pengaturan (admin)
    /employees           -- manajemen karyawan (admin)
/components/ui           -- shadcn
/components/...          -- komponen domain
/lib/supabase           -- client & server helpers
/lib/validations        -- skema zod
/lib/utils              -- format rupiah, tanggal, dll.
/supabase/migrations    -- SQL skema + RLS
/types
```

---

## 7. UI/UX Requirements
- **Mobile-friendly & responsif**; layar kasir dioptimalkan untuk tablet/desktop touchscreen.
- Format mata uang **Rupiah** (`Rp1.234.567`) dan tanggal lokal Indonesia di seluruh aplikasi.
- Bahasa antarmuka **Indonesia**.
- Layar kasir: alur cepat, tombol besar, minim klik, dukungan keyboard & barcode scanner.
- State kosong (empty state), loading skeleton, dan pesan error yang jelas.
- Tema terang/gelap (opsional).
- Konfirmasi untuk aksi destruktif (hapus, void, tutup shift).
- Toast/notifikasi untuk sukses/gagal.

---

## 8. Non-Functional Requirements
- **Performa:** layar kasir responsif (<200ms interaksi lokal); pencarian produk instan.
- **Keandalan:** operasi stok atomik; tidak boleh stok minus tak terkontrol.
- **Keamanan:** RLS ketat, validasi sisi server, tidak ada kebocoran data harga modal ke kasir.
- **Auditability:** semua aksi sensitif tercatat.
- **Skalabilitas:** desain mendukung penambahan banyak produk & transaksi tanpa degradasi berarti.
- **Backup:** mengandalkan backup Supabase + ekspor berkala data penjualan.

---

## 9. Roadmap / Fase Pengerjaan (disarankan)

**Fase 1 — Fondasi & MVP Inti**
1. Setup proyek, Supabase, skema DB + RLS, autentikasi.
2. Manajemen karyawan & peran (admin set di DB; admin kelola kasir).
3. Manajemen produk + upload foto.
4. Sesi kas (uang awal / buka-tutup shift) + rekonsiliasi.
5. Layar kasir + checkout + pembayaran (Cash/QRIS/Transfer) + struk.

**Fase 2 — Operasional & Pelaporan**
6. Stock movements otomatis + stock opname.
7. Rekap penjualan (filter, detail, export).
8. Dashboard pendapatan (harian/mingguan/bulanan, breakdown metode bayar).

**Fase 3 — Penyempurnaan (opsional)**
9. Void/refund dengan approval, audit log UI.
10. PPN, diskon lanjutan, varian produk, split payment, import/export CSV, realtime stok.

---

## 10. Asumsi & Hal yang Perlu Konfirmasi Anda

Hal-hal berikut saya beri **default yang masuk akal**, namun mohon konfirmasi/lengkapi:

1. **Nomor rekening bank** (BNI, BCA, BSI) beserta nama pemilik — *belum diisi, akan dimasukkan di Pengaturan.*
2. **Gambar QRIS** toko (statis) — *akan diupload di Pengaturan.*
3. **PPN** — default saya buat **non-aktif** dulu. Aktifkan bila perlu (mis. PPN 11%).
4. **Cetak struk** — apakah Anda pakai thermal printer? (Default: cetak via browser + opsi PDF.)
5. **Single store** (satu toko) — default. Multi-cabang belum termasuk; bisa jadi fase lanjutan.
6. **Split payment** & **varian produk** — saya tempatkan di fase lanjutan, bukan MVP. Boleh dinaikkan prioritasnya bila diperlukan.
7. **Pembulatan & uang pas** — default tanpa pembulatan khusus.

---

*Dokumen ini siap diserahkan ke Claude Code sebagai spesifikasi pembangunan. Disarankan mengerjakan secara bertahap mengikuti roadmap di §9, dimulai dari skema DB + RLS sebagai fondasi.*
