# PRD & Claude Code Build Spec — UMKM Unggul
## Platform / Marketplace SaaS Digitalisasi UMKM

**Versi:** 1.1 (MVP-first + arsitektur multi-tenancy & migrasi Kasir Unggul ke produksi)
**Acuan:** `Brainstorm-UMKM-Unggul.md` · `PRD-POS-Multi-Cabang-v2.md` (Kasir Unggul)
**Tech Stack:** Next.js 15 (App Router, RSC) · TypeScript (strict) · Tailwind CSS · shadcn/ui · Framer Motion · Supabase (Postgres + Auth + Storage + RLS + Edge Functions) · Payment Gateway (Midtrans Snap **atau** Xendit) · Recharts · Vercel

> Dokumen ini **mandiri**. Kerjakan berurutan mengikuti PART C (§15–§16). PART A = spesifikasi, PART B = setup Claude Code, PART C = prompt per fase (tinggal paste), PART D = keputusan.

---
---

# PART A — PRODUCT REQUIREMENTS

## 1. Ringkasan & Tujuan
UMKM Unggul adalah **marketplace SaaS**: menjual tool digital berlangganan untuk UMKM (Kasir Unggul ready hari ini; Marketing/Keuangan Unggul menyusul), satuan maupun bundling. Konsumen klik **Beli** → bayar via **hosted checkout** → **provisioning otomatis & instan** → langsung memakai tool di perusahaannya melalui **satu akun terpadu (SSO)**.

**Tujuan MVP:** menjual & mem-provisioning **Kasir Unggul** secara otomatis, dengan fondasi platform (SSO, entitlement, multi-tenant) yang siap menampung banyak tool.

**Ingat:** ini SaaS, bukan barang fisik. "Produk" = langganan/lisensi; "pengiriman" = provisioning akses otomatis; akses dijaga oleh **entitlement**.

## 2. Prinsip Inti (fondasi wajib)
1. **SSO / Akun Terpadu.** Satu identitas (Supabase Auth) mengakses semua tool yang dimiliki.
2. **Entitlement-gated access.** Akses & batas (limit) tiap tool ditentukan tabel `entitlements`, diverifikasi **server-side/RLS**. Tool tak pernah percaya klien.
3. **Multi-tenant (workspace).** Tiap pelanggan punya `workspace` terisolasi via RLS. Tool berjalan di dalam workspace.
4. **Webhook = sumber kebenaran pembayaran.** Akses/provisioning diberikan **hanya** setelah webhook gateway terverifikasi; handler **idempotent**. Halaman "sukses" hanyalah tampilan.
5. **Server-side authority.** Harga, entitlement, dan provisioning dihitung/diputuskan di server, bukan klien.
6. **Immutability & audit.** Pembayaran, provisioning, dan aksi sensitif tercatat & tak diubah diam-diam.

## 3. Persona & Peran
- **Pengunjung** — melihat storefront, membeli.
- **Pemilik Workspace (Customer Owner)** — akun yang membeli; kelola langganan, tim, tagihan; akses tool.
- **Anggota Tim Workspace** — diundang owner; akses tool sesuai peran (dan sesuai peran di dalam tool, mis. kasir/manajer di Kasir Unggul).
- **Staff Internal UMKM Unggul** — `super_admin`, `finance`, `support`, `marketing` (RBAC internal untuk back-office).

## 4. Arsitektur Platform
- **Identity (SSO):** Supabase Auth = "UMKM Unggul ID".
- **Tenant:** `workspaces` + `workspace_members`.
- **Katalog & Billing terpusat:** `products`, `plans`, `bundles`, `orders`, `payments`, `invoices`, `subscriptions`.
- **Entitlement service:** `entitlements` = satu sumber kebenaran "workspace X boleh pakai tool Y tier Z sampai kapan, dengan limit apa".
- **Tools (mis. Kasir Unggul):** aplikasi terpisah yang **membaca entitlement** dari platform via `workspace_id`. Batas paket (mis. jumlah cabang/user) diambil dari `entitlements.limits`.
- **App Launcher/Hub:** setelah login, tampilkan tool dimiliki (buka) + bisa dibeli (terkunci).

> **Integrasi Kasir Unggul (PRD v2 multi-cabang):** entitas cabang/user Kasir Unggul berada **di bawah `workspace_id`**. Sebelum memberi akses & saat menambah cabang/user, Kasir Unggul mengecek `entitlements` (status aktif + limit). Angka final ada di Handoff §8.2: Gratis 1 · Basic 1 · Pro 3 · Bisnis 10 · Enterprise custom.

---

## 4A. Arsitektur Multi-Tenancy (Database) — WAJIB DIPAHAMI

### 4A.1 Pola yang dipilih: **Pooled — satu database, satu skema, dipisah `workspace_id` + RLS**
Untuk skala UMKM Unggul (perkiraan ~1.000+ pelanggan), gunakan **satu database Supabase** yang dibagi semua tenant, dengan setiap baris ditandai `workspace_id` dan diisolasi oleh **Row Level Security (RLS)**. Ini standar industri SaaS dan sudah sejalan dengan desain kita.

**Kenapa bukan pola lain:**
- **Skema-per-tenant** (1.000 skema) → migrasi harus dijalankan ribuan kali; koneksi rumit. Hindari.
- **Database-per-tenant / silo** (1.000 proyek Supabase) → biaya & operasional tidak masuk akal (ribuan dolar/bulan, 1.000 kali migrasi). Hanya untuk kebutuhan isolasi enterprise/kepatuhan khusus.

**Kenapa pooled aman & cukup untuk 1.000+ tenant:**
- 1.000 tenant itu **kecil** bagi Postgres; yang membebani adalah **volume transaksi**, bukan jumlah tenant. Skala lewat ukuran compute, bukan memecah database.
- **Keamanan berasal dari RLS di level database**, bukan dari memisah database. Selama RLS benar, data antar UMKM mustahil bocor walau berada di tabel yang sama.

### 4A.2 Syarat teknis agar tetap kencang & aman di skala
- **Index kolom tenant**: index komposit yang **diawali `workspace_id`** (lalu `branch_id`, dst.) di semua tabel operasional.
- **Connection pooling**: gunakan Supavisor/PgBouncer (mode transaksi) karena serverless (Vercel) mudah menghabiskan koneksi.
- **RLS efisien**: bungkus `auth.uid()` dalam subquery (`(select auth.uid())`) agar di-cache planner; helper `STABLE`/`SECURITY DEFINER`; index kolom tenant.
- **Backup + Point-in-Time Recovery (PITR)** wajib (ini data keuangan). Uji restore berkala.
- **Partitioning** tabel besar (mis. `transactions`) per cabang/tanggal → hanya bila sudah jutaan baris (pertumbuhan jauh di depan, bukan MVP).
- **Cost control** Supabase diaktifkan agar tak ada tagihan liar.

### 4A.3 Kapan naik kelas dari satu database
Hanya bila: ada tenant raksasa (enterprise) yang minta isolasi fisik, kepatuhan mengharuskan pemisahan, atau skala ekstrem (puluhan ribu tenant beban berat → sharding). Untuk 1.000 UMKM, **tetap satu database**. Pola **hybrid** (mayoritas pooled + satu–dua tenant besar di-silo) bisa ditambahkan nanti tanpa membongkar arsitektur.

---

## 4B. Strategi Domain & Model Akses

### 4B.1 Model akses: domain sama, akun berbeda = STANDAR & AMAN
Satu aplikasi, satu domain, banyak akun berbeda adalah cara kerja SaaS umum. **Batas keamanan ada di autentikasi + RLS, bukan di URL.** Subdomain terpisah **tidak** otomatis lebih aman — isolasi tetap dari lapisan data. Alur: Supabase Auth mengenali user → `workspace_members` menentukan workspace → RLS menegakkan akses. Ditambah verifikasi email, opsional 2FA, session cookie aman, rate limiting, audit log.

### 4B.2 Tiga opsi routing (pilih bertahap)
- **Opsi A — Satu domain aplikasi bersama** (`app.umkmunggul.com`), workspace dipilih lewat akun. Termurah, tercepat, satu SSL. **→ Dipakai untuk MVP.**
- **Opsi B — Subdomain per tenant** (`namaukm.umkmunggul.com`) via **wildcard DNS `*.umkmunggul.com` + wildcard SSL** (otomatis & praktis gratis di Vercel). Middleware membaca host → resolve workspace. Branding "terasa milik mereka". **→ Peningkatan cepat v1.1.**
- **Opsi C — Custom domain per tenant** (domain milik UMKM). Premium/enterprise; verifikasi domain + SSL per domain. **→ Add-on berbayar, nanti.**

### 4B.3 Penamaan domain (rekomendasi)
`umkmunggul.com` (marketing) · `app.umkmunggul.com` (login + App Launcher) · Kasir Unggul di `app.umkmunggul.com/kasir` (atau `kasir.umkmunggul.com` bila pakai subdomain per tool). Jaga satu payung domain agar brand kohesif & biaya minimal. **Keamanan sama untuk semua opsi (dijaga RLS); subdomain hanya soal UX/branding.**

---

## 4C. Integrasi & Migrasi Kasir Unggul (produksi) ke SaaS — TANPA mengubah fungsi

Kasir Unggul sudah berjalan (multi-cabang, RLS per cabang, semua fitur di `PRD-POS-Multi-Cabang-v2.md`). Tujuan: **membungkusnya menjadi SaaS multi-tenant tanpa mengubah perilaku fitur di dalamnya.**

### 4C.1 Prinsip: tambahkan lapisan `workspace` DI ATAS `branch` (aditif)
- Perkenalkan `workspaces` sebagai **tenant induk**. Setiap `branch` menjadi milik satu `workspace` (`branches.workspace_id`).
- **Seluruh fitur POS tetap sama** (Kasir, Produk, Harga Cabang, Inventory, Gudang, Shift, Penjualan, Persetujuan, Dashboard, Laporan, Keamanan, Audit Log, Pengaturan). Yang berubah hanya **cakupan (scope)**: kini dibatasi per workspace, lalu per cabang seperti semula.

### 4C.2 Perubahan peran yang WAJIB (dan satu-satunya yang berubah)
- Di POS lama, **Master Admin = global**. Di SaaS, itu **tidak boleh** global lintas pelanggan.
- **Master Admin kini di-scope ke workspace**: pemilik/owner tiap UMKM adalah "Master Admin **workspace mereka sendiri**" — fungsinya **identik** (kelola cabang, user, produk, dsb.), tetapi hanya di dalam workspace-nya.
- **Super admin global** kini adalah **staff internal UMKM Unggul** (`profiles.is_staff`), bukan pelanggan. Ini pemisahan penting agar satu UMKM tak bisa melihat data UMKM lain.

### 4C.3 Perubahan data model (aditif, minimal)
- Tambah `workspaces` + `workspace_members` (jika belum ada dari platform) → jadi induk `branches`.
- Tambah kolom `workspace_id` pada `branches` (**FK ke `workspaces`**). Untuk performa RLS, **denormalisasi `workspace_id`** ke tabel anak bervolume tinggi (`transactions`, `payments`, `branch_products`, dll.) — diisi otomatis oleh RPC/trigger, bukan input manual.
- **PENGECUALIAN (KEP-004): `stock_movements` dan `audit_logs` TIDAK didenormalisasi.**
  Keduanya append-only + hash-chain, dan `hash_chain()` mem-hash seluruh isi baris
  (`to_jsonb(new) - 'prev_hash' - 'row_hash'`). Menambah kolom saja — tanpa `UPDATE` sekalipun —
  sudah mematahkan verifikasi baris historis. Workspace diturunkan lewat join ke `branches`
  (tabel mungil, selalu tercache), dengan index pendukung `branches(id, workspace_id)`.
- **Daftar final 30 tabel POS ada di KEP-005** (`docs/keputusan-arsitektur.md`): 12 tabel dapat
  kolom, 18 lewat join. Termasuk katalog global (`products`, `categories`, `suppliers`,
  `notifications`) yang **tidak punya `branch_id` sama sekali** — tanpa `workspace_id` katalog
  semua UMKM bercampur.
- **`stock_transfers` = lubang isolasi tulis (KEP-005).** Tabel ini punya `from_branch_id` dan
  `to_branch_id`, bukan `branch_id`. Tanpa penjaga, stok bisa ditransfer lintas workspace.
  Wajib trigger yang memastikan kedua cabang berada di workspace yang sama.
- Peran POS (`branch_memberships.role` = manager/cashier) **tetap**; "Master Admin workspace" = `workspace_members.role = 'owner'/'admin'`.
- **Tabel singleton wajib ikut** (KEP-003): `store_settings` dan `org_settings` hari ini hanya
  berisi SATU baris tanpa kunci tenant, dan dibaca dengan pola `.limit(1).maybeSingle()` di 17
  titik. Tambah `workspace_id` + `UNIQUE(workspace_id)` + RLS pada keduanya. Dua titik yang
  memakai service-role (`app/struk/[id]/page.tsx`, `lib/alerts.ts`) menembus RLS dan **wajib
  dipatch eksplisit** — bila tidak, struk publik menampilkan QRIS/logo UMKM lain dan alert
  anti-fraud terkirim ke nomor WhatsApp UMKM lain.
- Identitas brand akan terduplikasi di `platform.workspaces`, `org_settings`, dan
  `store_settings`. **Duplikasi ini diterima** — konsolidasi ditolak karena melanggar Aturan Emas.

### 4C.4 Gerbang Entitlement (baru, membungkus, tidak mengubah fitur)
- Sebelum memberi akses ke Kasir Unggul & sebelum **menambah cabang/user**, cek `entitlements` workspace: status aktif + `limits` (`max_branches`, `max_users`) sesuai paket.
- Bila langganan gagal bayar → **grace 7 hari dengan fungsi penuh**, lalu workspace **turun ke
  limit tier Gratis** (KEP-008) — BUKAN terkunci. Kasir tetap bisa transaksi (maks 300 tx/bln),
  cabang ke-2 dan seterusnya jadi read-only, fitur Pro terkunci. Data tidak hilang, fungsi tidak
  dihapus — hanya digerbangi. Alasan: memblokir checkout menghentikan operasi toko pelanggan.
- `entitlements.status = 'suspended'` hanya untuk penangguhan manual oleh staff internal
  (mis. penyalahgunaan), bukan akibat kedaluwarsa.

### 4C.5 Perluasan RLS (membungkus RLS lama)
- Helper baru: `is_workspace_member(ws)`, `has_active_entitlement(ws, 'kasir-unggul')`.
- Pola: policy cabang lama **tetap**, ditambahkan guard induk `workspace_id = ANY(user_workspace_ids())` (dan `is_staff()` untuk internal). Efeknya: isolasi kini **workspace → cabang**, sesuai desain semula tanpa mengubah logika fitur.

### 4C.6 Rencana Migrasi Data (produksi berjalan → SaaS) — aman & bertahap
1. **Backup + PITR** dulu. Kerjakan di **staging** dan uji tuntas sebelum produksi.
2. Buat tabel `workspaces`, `workspace_members`, `subscriptions`, `entitlements` (bila belum ada).
3. Buat **satu workspace** untuk pelanggan/instalasi POS yang sudah ada; jadikan Master Admin lama sebagai `owner` workspace itu.
4. Tambah `workspace_id` ke `branches` → isi ke workspace tersebut; backfill denormalisasi `workspace_id` ke tabel anak.
5. Beri workspace itu **entitlement `active`** (paket sesuai) agar semua fitur tetap jalan tanpa terputus.
6. Perbarui helper & policy RLS ke pola workspace→cabang.
7. **Uji regresi**: verifikasi SEMUA fitur POS berperilaku sama untuk workspace itu (checkout, harga cabang, inventory, gudang, shift, persetujuan, dashboard, laporan, audit) — **tidak ada fungsi yang berubah**.
8. Setelah lolos, terapkan ke produksi. Pelanggan baru otomatis dapat workspace + entitlement lewat alur beli (PART C, Fase 3).

> **Aturan emas migrasi:** semua perubahan bersifat **aditif** (menambah lapisan tenant + gerbang entitlement). **Jangan menghapus/mengubah** tabel, kolom fungsional, atau logika fitur POS yang sudah ada. Bila sebuah perubahan memaksa mengubah perilaku fitur, hentikan dan konfirmasi dulu.

---

## 4D. Biaya (efektif & efisien)

> Verifikasi ulang menjelang launch karena harga dapat berubah.

- **Supabase:** Pro ~$25/bulan per organisasi (termasuk ~8 GB DB, 100K MAU, 100 GB storage, kredit compute $10 untuk Micro). Naik compute bila beban besar (Small +$5, Medium +$50, dst.). **Kunci hemat: karena semua tenant di satu proyek/database, Anda bayar satu compute — biaya mengikuti beban, BUKAN jumlah tenant.** 1.000 tenant pooled ~$25–$100/bulan; versus 1.000 database terpisah = ribuan dolar. Aktifkan PITR untuk data keuangan.
- **Vercel:** Hobby gratis tapi **non-komersial**; produksi wajib **Pro ~$20/user/bulan** (termasuk kredit $20 + 1 TB bandwidth). Pantau overage bandwidth/edge request. Wildcard subdomain tidak menambah biaya.
- **Domain:** satu `.com` ~$10–15/tahun; subdomain (Opsi B) gratis; custom domain (Opsi C) nanti.
- **Payment gateway:** QRIS 0,7%/transaksi, umumnya tanpa biaya bulanan.
- **Estimasi awal:** ~$45–50/bulan (Supabase Pro + Vercel Pro + domain) untuk melayani banyak UMKM sekaligus, naik bertahap mengikuti beban. Efisien justru karena **tidak membayar per tenant**.

---

## 5. Functional Requirements

### 5.1 Autentikasi & Akun Terpadu (SSO)
- Daftar/masuk email+password + verifikasi email; reset password; (opsional) OAuth Google.
- Saat signup: trigger `handle_new_user` membuat `profiles`; buat **workspace default** untuk user (owner)
  — **HANYA bila** `raw_user_meta_data->>'signup_source' = 'storefront'`. Lihat KEP-002.
  Tanpa penanda itu (mis. undangan karyawan POS via `inviteUserByEmail`, atau user dibuat manual
  di Dashboard) trigger **tidak** membuat workspace — perilaku identik dengan hari ini.
- 2FA untuk staff internal (fase lanjut).

### 5.2 Workspace & Tim
- Satu user boleh punya/gabung beberapa workspace; ada workspace aktif (pemilih bila >1).
- Owner mengundang anggota (email) + set peran workspace + (untuk tool tertentu) peran di tool.
- Profil workspace: nama perusahaan, logo, alamat, kontak.

### 5.3 Katalog Produk, Plan, Bundling, Waitlist
- **Products** (tool): slug, nama, tagline, deskripsi, ikon, kategori, `status` (`available`/`coming_soon`), urutan.
- **Plans** per produk: nama/tier, periode (bulanan/tahunan), harga, `features` (jsonb), `limits` (jsonb: `max_branches`, `max_users`, dll.), aktif.
- **Bundles**: gabungan beberapa produk+plan, harga hemat, tampilkan penghematan.
- **Coming soon + Waitlist**: tombol "Beri tahu saya" menyimpan email ke `waitlist`.

### 5.4 Checkout & Hosted Payment
- Pilih produk/plan/bundle → checkout (login/daftar bila perlu) → pilih periode → terapkan kupon → ringkasan.
- Server membuat `order` + `order_items` dengan **harga dihitung server**.
- Server memanggil gateway → dapat **token/URL hosted checkout** (Snap/Payment Link) menampilkan semua metode: **VA, e-wallet (GoPay/OVO/Dana/ShopeePay), QRIS, kartu**, (opsional gerai retail).
- Konsumen bayar di halaman gateway (aman, PCI-DSS, 3DS/OTP untuk kartu).
- Sediakan halaman status: `pending` (tampilkan cara bayar/lanjutkan), `paid`, `expired`, `failed` (retry).

### 5.5 Webhook & Verifikasi Pembayaran
- Endpoint webhook (Edge Function/route) menerima notifikasi gateway.
- **Verifikasi signature** + konfirmasi status resmi ke gateway.
- **Idempotent** via `payment_webhook_events` (unik per `event_id`); event ganda diabaikan.
- Update `payments` + `orders.status`; tangani semua status termasuk `refund`/`chargeback`.
- **Hanya di sini** akses/provisioning dipicu.

### 5.6 Provisioning Instan & Entitlement
- Setelah order `paid`: buat/`upsert` `subscription` (periode, auto_renew) + `entitlement` (produk, plan, limits, valid_until, status active).
- Jalankan **provisioning job**: aktifkan tool untuk workspace (untuk Kasir Unggul: siapkan tenant + cabang default + membership admin).
- Provisioning **idempotent & retryable** (`provisioning_jobs` dengan attempts/error).
- Setelah sukses: kirim notifikasi + tombol "Mulai Sekarang" (akses langsung, hitungan detik).

### 5.7 Portal Pelanggan
- **App Launcher/Hub**: tool dimiliki (buka) + bisa dibeli (upgrade).
- **Langganan Saya**: status, periode, perpanjangan, kelola seat/limit, upgrade/downgrade, beli tool lain.
- **Tagihan & Invoice**: riwayat + unduh PDF.
- **Metode & auto-renew** (aktif/nonaktif — recurring di fase lanjut).
- **Tim & workspace**, **notifikasi**, **bantuan/tiket**.

### 5.8 Billing
- Invoice PDF + nomor berurutan; (opsional) faktur/PPN.
- Pengingat perpanjangan (email/WA) sebelum jatuh tempo.
- **Recurring/auto-renew** (tokenisasi kartu / e-wallet linking), **proration**, **dunning** → **Fase lanjut** (bukan MVP).

### 5.9 Kupon/Promo
- Kode kupon: persen/nominal, batas pakai, kadaluarsa, aktif; divalidasi server-side saat checkout.

### 5.10 Admin Back-office (staff internal)
- Kelola produk/plan/bundle/harga/status; kupon; waitlist.
- Kelola pelanggan/workspace/langganan/entitlement (termasuk **provisioning manual** sebagai fallback).
- **Pembayaran & rekonsiliasi** (webhook vs settlement gateway); lihat order/invoice.
- CMS ringan (landing/blog/testimoni) — MVP boleh minimal.
- Analitik: MRR/ARR, churn, funnel konversi (bertahap).
- RBAC internal + audit log.

### 5.11 Notifikasi
- **Email transaksional** (verifikasi, invoice, pembayaran sukses, onboarding, pengingat).
- **WhatsApp** (via WA Business API/provider) untuk notifikasi & support — bisa menyusul.

### 5.12 Storefront / Halaman Marketing
Home (hero + bento suite + social proof + CTA), Halaman Produk per tool, Halaman Bundling, Pricing (toggle bulanan/tahunan + kalkulator hemat), Compare, Demo/Studi Kasus, Testimoni, Blog/Edukasi (SEO), Tentang/Visi, Kontak, FAQ, Help Center, halaman legal (T&C, Privasi/UU PDP, Refund, SLA), "Segera Hadir"+waitlist.

### 5.13 Integrasi Kasir Unggul
- Kasir Unggul (aplikasi multi-cabang) memverifikasi `entitlements` untuk `workspace_id` sebelum memberi akses dan sebelum menambah cabang/user (limit dari plan).
- Bila langganan kedaluwarsa → grace 7 hari, lalu turun ke limit tier Gratis + ajakan perpanjang
  (KEP-008). Toko pelanggan tidak pernah berhenti beroperasi.
- **Detail arsitektur & migrasi produksi ada di §4C** (membungkus POS menjadi multi-tenant **tanpa mengubah fungsi**). Master Admin POS di-scope ke workspace; super admin global = staff internal.

## 6. Skema Database (Supabase / Postgres)

> Semua tabel: `id uuid default gen_random_uuid()`, `created_at`, `updated_at` bila relevan, **RLS aktif**.

### 6.0 Penempatan Skema — KEPUTUSAN TERKUNCI (2026-08-06)

**Satu proyek Supabase, DUA skema.** Platform tinggal di skema **`platform`**; Kasir Unggul
tetap utuh di skema **`public`** tanpa disentuh.

**Alasan:** POS sudah memakai nama `products`, `payments`, dan `audit_logs` dengan arti yang
sama sekali berbeda (barang dagangan / pembayaran kasir / audit hash-chain). Menaruh skema
platform di `public` membuat `create table if not exists` **lewat tanpa error** dan storefront
akan membaca barang dagangan pelanggan sebagai katalog tool — gagal senyap. Skema terpisah
menghilangkan tabrakan tanpa mengubah satu baris pun milik POS (sesuai Aturan Emas §4C).

| Aspek | Konsekuensi |
|---|---|
| SSO (§2.1) | Utuh — `auth.users` tetap tunggal |
| Helper `has_active_entitlement()` (§4C.5) | Jalan — fungsi lintas-skema dalam satu database |
| Aturan Emas §4C | Terpenuhi — nol perubahan pada tabel POS |
| Ongkos | Daftarkan `platform` di **Dashboard → Settings → API → Exposed schemas** |
| Akses klien | `supabase.schema('platform').from('plans')` |

**Aturan penempatan:**
- **`platform.*`** — `workspaces`, `workspace_members`, `products`, `plans`, `bundles`,
  `bundle_items`, `coupons`, `orders`, `order_items`, `payments`,
  `payment_webhook_events`, `invoices`, `subscriptions`, `entitlements`,
  `provisioning_jobs`, `waitlist`, `audit_logs`.
- **`public.profiles`** — TETAP di `public`. Satu-satunya tabel bersama; hanya **ditambah**
  kolom `is_staff` + `staff_role` (aditif murni). Jangan buat `platform.profiles`.
- **`public.*` lainnya** — milik POS. Jangan diubah/dihapus.
- Rujukan `audit_logs` di §5.10/§7 berarti **`platform.audit_logs`** (aksi staff), BUKAN
  `public.audit_logs` milik POS yang append-only + hash-chain.

```
-- KECUALI `profiles` (tetap di public), SEMUA TABEL DI BAWAH INI DIBUAT DI SKEMA `platform`.
profiles                       -- UMKM Unggul ID  [public.profiles — HANYA tambah kolom]
  id uuid PK FK->auth.users ON DELETE CASCADE
  full_name, phone, avatar_url
  is_staff boolean default false
  staff_role enum('super_admin','finance','support','marketing') null
  created_at

workspaces
  id, name, slug, logo_url, owner_id FK->profiles
  address, phone, created_at

workspace_members
  id, workspace_id FK, user_id FK->profiles
  role enum('owner','admin','member'), is_active
  UNIQUE(workspace_id, user_id)

products                       -- katalog tool
  id, slug UNIQUE, name, tagline, description, icon, category
  status enum('available','coming_soon'), sort_order, is_active

plans
  id, product_id FK, name, tier
  billing_period enum('monthly','annual')
  price numeric, currency default 'IDR'
  features jsonb, limits jsonb   -- {max_branches, max_users, ...}
  is_active

bundles
  id, slug, name, description, billing_period, price, is_active
bundle_items
  id, bundle_id FK, product_id FK, plan_id FK

coupons
  id, code UNIQUE, type enum('percent','amount'), value numeric
  max_uses int, used_count int default 0, valid_from, valid_until, is_active

orders
  id, workspace_id FK, user_id FK, code UNIQUE
  status enum('pending','paid','expired','failed','cancelled','refunded')
  subtotal, discount, tax, total numeric, coupon_id FK null
  created_at, paid_at
order_items
  id, order_id FK, item_type enum('plan','bundle')
  product_id FK null, plan_id FK null, bundle_id FK null
  qty, unit_price, line_total

payments
  id, order_id FK, gateway enum('midtrans','xendit')
  gateway_ref, method, amount numeric
  status enum('pending','paid','expired','failed','refunded')
  raw_payload jsonb, paid_at, created_at

payment_webhook_events         -- idempotency & audit
  id, gateway, event_id UNIQUE, order_ref
  signature_verified boolean, processed boolean default false
  payload jsonb, received_at

invoices
  id, order_id FK, number UNIQUE, pdf_url, issued_at

subscriptions
  id, workspace_id FK, product_id FK, plan_id FK, order_id FK
  status enum('trialing','active','past_due','suspended','cancelled','expired')
  current_period_start, current_period_end, trial_ends_at
  auto_renew boolean default false, created_at

entitlements                   -- SUMBER KEBENARAN AKSES
  id, workspace_id FK, product_id FK, plan_id FK
  status enum('active','inactive','suspended'), limits jsonb
  valid_until, created_at, updated_at
  UNIQUE(workspace_id, product_id)
  -- limits = HASIL AKHIR (plan + add-on). Satu-satunya jalur tulis:
  -- RPC recalc_entitlement(ws, product). JANGAN UPDATE langsung. Lihat KEP-006.

subscription_addons            -- KEP-006: sumber kebenaran add-on (Handoff §8.3)
  id, subscription_id FK, workspace_id FK
  addon_type enum('branch','seat','storage')
  qty int, unit_price numeric
  billing_period enum('monthly','annual')
  status enum('active','cancelled'), valid_until, created_at, updated_at
  -- Satuan storage DIKUNCI: 1 GB = 1.000 MB, jadi "+5 GB" = storage_mb += 5000

provisioning_jobs
  id, order_id FK, workspace_id FK, product_id FK
  status enum('pending','running','done','failed'), attempts int, error text
  created_at, updated_at

usage_counters                 -- KEP-007: metering fair-use (Handoff §8.5)
  id, workspace_id FK, product_id FK
  metric enum('tx_count','storage_mb')
  period_start, period_end       -- mengikuti subscriptions (anniversary, bukan kalender)
  value numeric, computed_at
  UNIQUE(workspace_id, product_id, metric, period_start)
  -- Diisi Edge Function terjadwal. JANGAN increment di dalam create_sale.

waitlist
  id, email, product_id FK null, created_at

audit_logs                     -- aksi staff & sistem (append-only)
  id, actor_id FK null, action, entity, entity_id
  before jsonb, after jsonb, created_at
```

### 6.1 Integritas
- `orders.total` = jumlah `order_items.line_total` − diskon (+pajak). Dihitung server.
- Provisioning & pembuatan entitlement lewat **RPC/Edge Function** yang dipicu webhook, **idempotent**.
- `entitlements` diperbarui saat: pembayaran sukses (aktif), refund/expired (nonaktif), perpanjangan.

## 7. Keamanan & RLS
- **RLS semua tabel.** Data workspace hanya untuk anggotanya; staff internal (`is_staff`) punya kebijakan terpisah.
- Helper: `is_staff()`, `user_workspace_ids()`, `is_workspace_member(ws)`, `workspace_role(ws)`, `has_active_entitlement(ws, product)`.
- **Pola:** tabel workspace-scoped → `SELECT/WRITE` bila `is_workspace_member(workspace_id)` (+cek role untuk aksi sensitif) `OR is_staff()`.
- **Katalog (`products/plans/bundles`)**: baca publik (storefront), tulis hanya staff.
- **`payments`, `payment_webhook_events`, `entitlements`, `orders`**: tulis hanya lewat server/service-role (webhook & RPC), bukan dari klien.
- **Rahasia**: `SUPABASE_SERVICE_ROLE_KEY` & server key gateway hanya di server/Edge Function; jangan `NEXT_PUBLIC_*`.
- **UU PDP**: consent, kebijakan privasi, data minim, jangan simpan data kartu (delegasi gateway/PCI-DSS).

## 8. Alur Pembayaran (urutan teknis)
```
User -> Checkout (pilih plan/bundle, kupon)
Server: buat order + order_items (harga tervalidasi)
Server -> Gateway: buat transaksi hosted checkout (Snap token / Xendit invoice)
Server -> User: tampilkan hosted checkout (semua metode)
User -> Gateway: bayar (VA/e-wallet/QRIS/kartu)
Gateway -> Server (WEBHOOK): notifikasi
Server: verifikasi signature + status; simpan event (idempotent)
Server: order.paid + payments.paid + buat subscription + entitlement
Server: jalankan provisioning_job (aktifkan tool utk workspace)
Server -> User: notifikasi + tombol "Mulai Sekarang" (akses instan)
```
> Verifikasi detail API gateway terbaru via **Context7 MCP**; jangan hardcode dari ingatan.

## 9. Arah Desain (Gen-Z / 2026)
Modern, kekinian, tapi tetap **kredibel** (ini transaksi berbayar).
- **Bento grid** untuk suite/fitur (beri kedalaman + motion, bukan datar).
- **Tipografi ekspresif/kinetik** (headline oversized, variable font reaktif saat scroll).
- **Warna "dopamine"** dengan **satu aksen konsisten**; hindari terlalu ramai.
- **Soft brutalism** terukur (border tegas + whitespace + font ramah) → anti-template.
- **Glassmorphism/claymorphism** sebagai aksen; **elemen 3D/organik** ringan; **micro-delights** (hover, transisi, konfeti sukses bayar via Framer Motion).
- **Scroll storytelling**, **dark-mode** opsional, sentuhan **retro/Y2K** secukupnya.
- **Mobile-first mutlak**; **aksesibilitas** WCAG AA, tap target ≥44px.
- **Design system** konsisten (token warna, tipografi, komponen shadcn/ui) di storefront + portal.
- **Kode semantik/MX** (struktur bersih; cepat; SEO; mudah dibaca AI assistant).

## 10. Non-Functional
Keamanan (RLS, webhook idempotent, no card data), keandalan (provisioning retryable), performa (SSR/ISR untuk storefront, edge webhook), skalabilitas (multi-tenant, banyak tool), observability (log pembayaran/provisioning), SEO, aksesibilitas.

## 11. Tech Stack
Next.js 15 · TS strict · Tailwind · shadcn/ui · Framer Motion · TanStack Query · react-hook-form + zod · Recharts · Supabase (Postgres/Auth/Storage/RLS/Edge Functions) · Midtrans Snap atau Xendit · Email (Resend/gateway) · WA Business API (opsional) · Vercel.

---
---

# PART B — SETUP CLAUDE CODE

## 12. Isi `CLAUDE.md` (letakkan di root)
```markdown
# CLAUDE.md — UMKM Unggul (SaaS Marketplace)

## Tentang
Marketplace SaaS untuk UMKM. Menjual tool berlangganan (Kasir Unggul dulu),
provisioning otomatis via webhook. Sumber kebenaran fitur: PRD (file ini + PRD doc).

## Stack (jangan ganti tanpa izin)
Next.js 15 (App Router, RSC default) · TypeScript strict · Tailwind + shadcn/ui ·
Framer Motion · Supabase (Postgres/Auth/Storage/RLS/Edge Functions) · TanStack Query ·
react-hook-form + zod · Recharts · Payment: Midtrans Snap ATAU Xendit (pilih satu).

## Prinsip Arsitektur (WAJIB)
1. SSO: Supabase Auth = akun terpadu; satu login untuk semua tool.
2. Entitlement-gated: akses tool ditentukan tabel `entitlements`, dicek server-side/RLS.
3. Multi-tenant: semua data workspace-scoped via RLS; isolasi antar pelanggan.
4. Webhook = sumber kebenaran pembayaran. Akses/provisioning HANYA setelah webhook
   terverifikasi. Handler idempotent (pakai payment_webhook_events).
5. Server-side authority: harga, entitlement, provisioning diputuskan di server.
6. Katalog & billing terpusat; tools membaca entitlement via workspace_id.

## Keamanan (TIDAK BOLEH dilanggar)
- Jangan simpan data kartu; delegasikan ke gateway (PCI-DSS).
- SERVICE_ROLE_KEY & gateway server key hanya di server/Edge Function, bukan NEXT_PUBLIC_*.
- Tulis ke payments/entitlements/orders/webhook_events HANYA via server/service-role.
- Validasi harga & kupon di server. RLS aktif di semua tabel. Patuhi UU PDP.
- Verifikasi signature webhook + konfirmasi status ke gateway sebelum provisioning.

## Konvensi
- Uang: numeric di DB, IDR tanpa desimal; helper formatRupiah -> "Rp1.250.000".
- Bahasa UI: Indonesia. Mobile-first. Design tokens konsisten (lihat PRD §9).
- Gunakan Context7 MCP untuk API terbaru (Next.js 15, Supabase, gateway).
- shadcn: pakai skill shadcn; Framer Motion untuk micro-interactions.

## Definition of Done
tsc --noEmit & lint lolos; RLS aktif & teruji; empty/loading/error state;
responsif & aksesibel; tidak ada kebocoran data lintas workspace; webhook idempotent.

## Cara Kerja
Sebelum fitur yang menyentuh DB/RLS/pembayaran, ringkas rencana & tunggu konfirmasi.
Commit kecil bermakna (conventional commits). Jangan commit .env/kunci.
```

## 13. MCP, Skills, Hooks
- **MCP:** Context7 (dok terbaru — wajib), Supabase/Postgres MCP (jalankan & uji migrasi ke **staging**), Chrome DevTools/Playwright MCP (QA UI/responsif). Minta Claude Code memasang & memverifikasi setup terbaru.
- **Skills:** `find-docs`, `shadcn`, `supabase-postgres-best-practices`, `vercel-react-best-practices`, `frontend-design`.
- **Hooks:** pre-commit → `typecheck` + `lint` + `test`.

## 14. Strategi Model & Konteks
- **Opus 5** untuk Fase 0–1, 1B, dan 3 (skema, RLS, auth/SSO, webhook/provisioning — paling kritikal).
- **Sonnet 5** untuk eksekusi fitur & UI harian (Fase 2, 4, 5, 6, 7).
- `/clear` saat pindah fitur; `/compact` di ~60–70% konteks; `/context` tambahkan PRD + file relevan (hindari node_modules).

---
---

# PART C — PAKET PROMPT PER FASE (tinggal paste ke Claude Code)

## 15. PROMPT — Bootstrap (Opus)
```
Kamu akan membangun "UMKM Unggul", marketplace SaaS, sesuai PRD ini dan CLAUDE.md.
Sebelum menulis kode:
1. Baca PRD & CLAUDE.md sepenuhnya.
2. Pakai Context7 MCP untuk verifikasi API terbaru Next.js 15, Supabase, dan
   gateway pembayaran (Midtrans Snap / Xendit) — konfirmasi mana yang kupilih dulu.
3. Sajikan RENCANA EKSEKUSI ringkas mengikuti fase di PART C, termasuk daftar tabel,
   route/halaman, alur webhook→provisioning, dan hal yang perlu kukonfirmasi (PART D).
4. JANGAN mulai coding sampai kusetujui. Tampilkan rencananya sekarang.
```

## 16. Prompt Fase

### Fase 0 — Inisialisasi (Opus/Sonnet)
```
Inisialisasi proyek: Next.js 15 (App Router, TS strict, Tailwind), shadcn/ui,
Framer Motion, @supabase/supabase-js + @supabase/ssr, zod, react-hook-form,
@tanstack/react-query, recharts. Buat struktur folder untuk storefront (public),
app/portal (pelanggan), app/admin (staff), dan supabase/ (migrations, functions).
Buat helper Supabase (browser/server/service-role terpisah), formatRupiah, util tanggal.
.env.example: URL/ANON publik; SERVICE_ROLE & GATEWAY server key hanya server.
Script npm: dev, build, typecheck, lint, test. Pastikan typecheck & lint lolos.
Commit: "chore: scaffolding".
```

### Fase 1 — Skema DB + RLS + Auth/SSO (Opus, paling kritikal)
```
WAJIB baca §6.0 dulu: SEMUA tabel platform dibuat di skema `platform`, BUKAN `public`.
`public` milik Kasir Unggul dan tidak boleh disentuh. Satu-satunya pengecualian:
`public.profiles` — hanya DITAMBAH kolom is_staff + staff_role, jangan dibuat ulang.

Buat migrasi SQL (supabase/migrations) untuk SELURUH skema di PRD §6:
create schema if not exists platform; lalu
platform.{workspaces, workspace_members, products, plans, bundles, bundle_items,
coupons, orders, order_items, payments, payment_webhook_events, invoices,
subscriptions, entitlements, provisioning_jobs, waitlist, audit_logs}
+ alter table public.profiles add column is_staff / staff_role.
Aktifkan RLS semua tabel. Buat helper: is_staff(), user_workspace_ids(),
is_workspace_member(ws), workspace_role(ws), has_active_entitlement(ws, product).
Terapkan pola RLS PRD §7 (katalog baca publik/tulis staff; tabel workspace-scoped;
payments/entitlements/orders/webhook_events tulis hanya service-role).
Trigger: handle_new_user — TAMBAHKAN cabang baru, jangan tulis ulang perilaku lama:
tetap insert profiles seperti sekarang, LALU buat workspace + membership owner HANYA bila
new.raw_user_meta_data->>'signup_source' = 'storefront' (KEP-002). Kode signup storefront
WAJIB mengirim penanda itu; alur undangan karyawan POS jangan disentuh.
Trigger lain: updated_at, append-only platform.audit_logs.
Implementasikan auth: signup/login/verify/reset (Supabase Auth) + middleware proteksi
route + pemilih workspace. Seed: 1 produk "Kasir Unggul" (available) + 9 baris plan =
5 tier (Gratis/Basic/Pro/Bisnis/Enterprise) x periode, angka & limits PERSIS dari
Handoff §8.2 + §8.4 (Gratis & Enterprise hanya 1 baris, sisanya bulanan + tahunan)
+ beberapa produk "coming_soon".
Jalankan migrasi ke STAGING via Supabase MCP & verifikasi. Uji RLS: user workspace A
tidak bisa membaca data workspace B (via query langsung).
Commit: "feat(core): schema, RLS, auth/SSO, workspaces".
```

### Fase 1B — Migrasi Kasir Unggul (produksi) ke Multi-Tenant (Opus, KRITIKAL, aditif)
```
Bungkus aplikasi Kasir Unggul (PRD-POS-Multi-Cabang-v2.md) menjadi multi-tenant SaaS
SESUAI PRD §4C, dengan ATURAN EMAS: hanya perubahan ADITIF, JANGAN mengubah/menghapus
tabel, kolom fungsional, atau logika fitur POS yang sudah ada. Semua fitur POS harus
berperilaku sama.

Langkah:
1. Kerjakan di STAGING. Backup + PITR dulu.
2. Jadikan `workspaces` induk dari `branches`: tambah kolom branches.workspace_id (FK).
   Denormalisasi workspace_id ke tabel anak bervolume tinggi (transactions, payments,
   branch_products, cash_sessions, dst.) via RPC/trigger, bukan input manual.
   JANGAN sentuh stock_movements & audit_logs — append-only + hash-chain, lihat KEP-004.
   Keduanya di-scope lewat join ke branches.
3. Re-scope peran: "Master Admin" POS menjadi workspace-level (workspace_members.role=
   owner/admin) — fungsi identik, tapi hanya di dalam workspace-nya. Super admin global =
   staff internal (profiles.is_staff), TIDAK terlihat sebagai pelanggan.
4. Gerbang entitlement: sebelum akses & sebelum tambah cabang/user, cek has_active_
   entitlement(workspace,'kasir-unggul') + limits (max_branches, max_users). Expired/
   suspended -> read-only/terkunci (data & fitur tidak dihapus, hanya digerbangi).
5. Perluas RLS: policy cabang lama TETAP, tambahkan guard induk workspace_id = ANY(
   user_workspace_ids()) OR is_staff(). Isolasi menjadi workspace -> cabang.
6. Migrasi data existing: buat 1 workspace untuk data POS yang ada, set Master Admin lama
   sebagai owner, isi workspace_id ke branches + backfill tabel anak, beri entitlement active.
7. UJI REGRESI menyeluruh: verifikasi SEMUA fitur (Kasir, Produk, Harga Cabang, Inventory,
   Gudang, Shift, Penjualan, Persetujuan, Dashboard, Laporan, Keamanan, Audit Log,
   Pengaturan) berperilaku SAMA. Uji isolasi: workspace A tak bisa akses data workspace B.
Bila ada perubahan yang memaksa mengubah perilaku fitur, HENTIKAN dan konfirmasi dulu.
Commit: "feat(kasir): wrap POS into multi-tenant SaaS (additive, no feature change)".
```

### Fase 2 — Katalog, Pricing, Waitlist (Sonnet)
```
Bangun katalog & pricing (data dari DB):
- Halaman katalog produk + halaman detail per produk (fitur, screenshot, harga, FAQ, CTA).
- Halaman pricing: tabel tier + toggle bulanan/tahunan + kalkulator hemat bundling.
- Bundling: halaman & kartu bundle dengan penghematan.
- "Segera Hadir" + form waitlist (simpan ke tabel waitlist).
Pakai skill shadcn + frontend-design; terapkan design tokens PRD §9 (bento, motion).
Commit: "feat(catalog): products, plans, bundles, pricing, waitlist".
```

### Fase 3 — Checkout + Hosted Payment + Webhook + Provisioning (Opus, INTI)
```
Implementkan alur beli end-to-end sesuai PRD §5.4–5.6 & §8:
1. Checkout: pilih plan/bundle + kupon (validasi server) → buat order + order_items
   dengan harga DIHITUNG SERVER → simpan.
2. Integrasi gateway (yang dipilih) untuk HOSTED CHECKOUT (Snap token / Xendit invoice);
   aktifkan VA + e-wallet + QRIS + kartu. Tampilkan ke user. Verifikasi API via Context7.
3. Endpoint WEBHOOK (Edge Function/route): verifikasi signature + konfirmasi status;
   simpan payment_webhook_events (idempotent by event_id); update payments + orders.
4. Saat order PAID: buat subscription + entitlement (limits dari plan); jalankan
   provisioning_job (idempotent, retryable) untuk mengaktifkan Kasir Unggul bagi workspace
   (siapkan tenant + cabang default + membership admin).
5. Halaman status pembayaran (pending/paid/expired/failed) + tombol "Mulai Sekarang".
Aturan keras: akses/provisioning HANYA dari webhook terverifikasi, bukan halaman sukses.
Semua tulis ke payments/entitlements via service-role di server.
Uji end-to-end di sandbox gateway (bayar sukses → entitlement aktif → tool ter-provision).
Commit: "feat(checkout): hosted payment, webhook, instant provisioning".
```

### Fase 4 — Portal Pelanggan (Sonnet)
```
Bangun portal pelanggan (PRD §5.7):
- App Launcher/Hub: tool dimiliki (buka, cek entitlement) + bisa dibeli (upgrade).
- Langganan Saya: status, periode, perpanjangan, kelola limit, upgrade/downgrade.
- Tagihan & Invoice: riwayat + unduh PDF invoice.
- Tim & workspace: undang anggota, atur peran; profil workspace.
- Notifikasi & bantuan.
Semua data workspace-scoped (RLS). Commit: "feat(portal): launcher, subscriptions, invoices, team".
```

### Fase 5 — Admin Back-office (Sonnet)
```
Bangun back-office staff internal (PRD §5.10), akses hanya is_staff() + RBAC:
- Kelola produk/plan/bundle/harga/status; kupon; waitlist.
- Kelola workspace/pelanggan/langganan/entitlement + provisioning manual (fallback).
- Pembayaran & rekonsiliasi (webhook vs settlement); lihat order/invoice.
- Audit log. (Analitik MRR/churn/funnel versi dasar.)
Commit: "feat(admin): catalog, customers, billing ops, reconciliation".
```

### Fase 6 — Storefront Marketing + Polish Desain (Sonnet)
```
Bangun halaman marketing (PRD §5.12) & poles desain (PRD §9):
Home (hero + bento suite + social proof + CTA), Tentang/Visi, FAQ, Help Center,
Blog/Edukasi (SEO), halaman legal (T&C, Privasi/UU PDP, Refund, SLA).
Terapkan tren 2026: bento + motion, tipografi kinetik, warna dopamine 1 aksen,
soft brutalism terukur, micro-delights (Framer Motion), scroll storytelling,
mobile-first, aksesibilitas WCAG AA, kode semantik untuk SEO/MX.
QA responsif via Chrome DevTools/Playwright MCP.
Commit: "feat(marketing): storefront pages + design polish".
```

### Fase 7 — Notifikasi & Lanjutan (Sonnet)
```
Tambahkan: email transaksional (verifikasi, invoice, sukses bayar, onboarding,
pengingat perpanjangan). (Lanjut) WhatsApp notifikasi/support; recurring/auto-renew
(tokenisasi kartu/e-wallet linking) + dunning + proration; referral/afiliasi;
analitik SaaS lengkap. Kerjakan bertahap sesuai prioritas.
Commit per fitur.
```

## 16.1 Checklist Penyerahan
- [ ] RLS teruji: tak ada kebocoran data lintas workspace.
- [ ] **Migrasi Kasir Unggul aditif**: SEMUA fitur POS berperilaku sama (uji regresi lolos); tidak ada tabel/kolom/logika fitur yang diubah/dihapus.
- [ ] **Master Admin POS di-scope ke workspace**; super admin global hanya staff internal.
- [ ] `workspace_id` terpasang di `branches` + terdenormalisasi ke tabel anak; index tenant terpasang.
- [ ] Webhook idempotent + signature terverifikasi; akses hanya dari webhook.
- [ ] Harga & kupon divalidasi server; tak ada data kartu tersimpan.
- [ ] Entitlement menggerbangi akses tool; limit plan dihormati (Kasir Unggul).
- [ ] Provisioning instan, idempotent, retryable; ada fallback manual di admin.
- [ ] Backup + PITR aktif; connection pooling dipakai untuk serverless.
- [ ] tsc & lint lolos; pre-commit hook aktif; UI responsif & aksesibel.
- [ ] README: cara set staff internal pertama di DB + setup env gateway.

---
---

# PART D — Keputusan yang Perlu Ditetapkan

> ✅ **SELURUHNYA SUDAH DITETAPKAN per 2026-08-06.** Rincian & alasan ada di
> `docs/keputusan-arsitektur.md`.

| # | Keputusan | Ketetapan |
|---|---|---|
| 1 | **Gateway** | ✅ **Midtrans Snap** — hosted checkout drop-in yang persis cocok §5.4; GoPay native; paling cepat sampai transaksi pertama. Onboarding merchant butuh dokumen usaha → **urus PARALEL dengan Fase 1B** agar tidak menghambat Fase 3 |
| 2 | **Metode aktif MVP** | ✅ VA + e-wallet + QRIS (kartu & recurring menyusul) |
| 3 | **Model harga** | ✅ Final di Handoff §8.2 — 5 tier, 9 baris `plans` |
| 4 | **Trial** | ✅ **TIDAK ADA trial terpisah.** Tier **Gratis** sudah berfungsi sebagai trial permanen. Menghapus `trialing`, kartu di muka, pengingat akhir trial, dan dunning-trial dari cakupan MVP. Sesuai funnel §8.1 |
| 5 | **Kanal notifikasi** | ✅ **Email dulu** (Resend). WhatsApp memakai mekanisme **tautan wa.me yang SUDAH ADA** (`lib/alerts.ts` + `org_settings.alert_whatsapp`) — gratis, tanpa verifikasi Meta. WA Business API ditunda ke Fase 7 |
| 6 | **Limit paket** | ✅ Final di Handoff §8.4 |
| 7 | **Strategi domain** | ✅ Opsi A untuk MVP; wildcard subdomain (Opsi B) menyusul |
| 8 | **Urutan build** | ✅ Fase 1 → 1B → 3; marketing di Fase 6 |
| 9 🆕 | **Lokasi aplikasi platform** | ✅ **Repo terpisah** di `SaaS Website/`. Repo POS **tidak disentuh** — Aturan Emas terjaga, deploy mandiri, riwayat git POS utuh |
| 10 🆕 | **Routing & SSO** | ✅ `app.umkmunggul.com` (platform) + `kasir.umkmunggul.com` (POS). Cookie Supabase di-set `domain: '.umkmunggul.com'` **di KEDUA aplikasi** — kalau salah satu lupa, SSO diam-diam tidak jalan |
| 11 🆕 | **Skema database** | ✅ Satu proyek Supabase, skema `platform` terpisah (§6.0 / KEP-001) |

> ⚠️ **`trialing` tetap ada di enum `subscriptions.status`** meski trial tidak dipakai di MVP —
> agar tidak perlu migrasi enum bila kelak diaktifkan. Cukup jangan pernah diisi.

> **Catatan urutan yang Anda minta:** selesaikan arsitektur & migrasi (Fase 0 → 1 → 1B → 3) lebih dulu; **website marketing UMKM Unggul dibangun di Fase 6** setelah fondasi & komersialisasi siap.

---

*Mulai dari §15 (Bootstrap, Opus) → Fase 0 → Fase 3 adalah tulang punggung (checkout+webhook+provisioning). Setelah Fase 3 berjalan di sandbox, MVP "jualan + provisioning Kasir Unggul" sudah hidup.*
