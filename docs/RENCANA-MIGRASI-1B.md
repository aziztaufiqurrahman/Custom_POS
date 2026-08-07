# RENCANA MIGRASI — Fase 1B
## Membungkus Kasir Unggul menjadi Multi-Tenant SaaS

**Tanggal:** 2026-08-06 · **Status:** ✅ disetujui — **seluruh berkas SUDAH DITULIS**
**Dasar:** PRD §4C + Fase 1B · Handoff §4 poin 3 · KEP-001 s/d KEP-013
**Ground truth:** `docs/schema-dump/` (dump produksi, nol drift)

> ✅ **IMPLEMENTASI SELESAI DITULIS** — 8 migrasi (3.108 baris SQL) + 12 berkas kode,
> di branch `feat/multi-tenant`.
>
> Urutan menjalankan + verifikasi ada di §6. Setelah seluruh migrasi masuk,
> jalankan `npm run gen:types` lalu `npm run typecheck`.

---

## ✅ SELESAI — seluruh `0029`–`0034` terterap di PROD (2026-08-07)

Fase 1B **tuntas di sisi database**. Urutan: staging lebih dulu (menemukan 5 bug), lalu PROD
bertahap dengan verifikasi di tiap titik henti §6.

| Verifikasi PROD sesudah | Hasil |
|---|---|
| Policy `public` bergerbang `user_workspace_ids` | **60 / 60** |
| Policy tanpa guard workspace | **0** |
| Kolom `branch_id` ber-DEFAULT `…c1` | **0** (dari 7) |
| Fungsi mengandung `…c1` | **0** (dari 13) |
| `adjust_stock` / `restock_product` | hanya signature baru — overload lama **ter-drop** |
| Tabel ber-`workspace_id` | 12, seluruhnya NOT NULL, **0 baris NULL** |
| `stock_movements` / `audit_logs` | **tidak disentuh** (KEP-004) — 48 & 108 baris utuh |
| Storage policy | `storage_products_write_ws`, `storage_brand_write_ws`, `storage_public_read` |
| Trigger gerbang | `trg_guard_max_branches`, `trg_guard_max_users`, `trg_guard_transfer_workspace` |
| **Data pelanggan** | **utuh** — 4 user, 8 transaksi, 15 item, 10 produk, 2 cabang, 1 master admin |
| Riwayat migrasi | **`0001`–`0034` tercatat** (sebelumnya nol catatan) |

Gerbang kode terhadap skema PROD: `tsc` **0 error**, `eslint` **bersih**, `vitest` **15/15**,
`next build` **sukses**.

**Backup pra-migrasi:** `backups/2026-08-07-pre-0029/` (275 baris, 31 berkas, prosedur di
`PEMULIHAN.md`). PITR **tidak** diaktifkan — biayanya $100/bln di atas Pro $25/bln, tidak
sebanding untuk 275 baris; keputusan pemilik 2026-08-07.

### Migrasi lanjutan `0035`–`0037` — temuan dari pengujian

Verifikasi struktural saja ternyata TIDAK cukup. Menyamar sebagai tiap user asli dan
menjalankan alur nyata di staging membongkar tiga cacat yang tak terlihat dari skema:

| # | Temuan | Dampak bila lolos | Perbaikan |
|---|---|---|---|
| 1 | `0028` hanya memasukkan **owner** ke `workspace_members`, karena berpijak pada KEP-012 (reset yang tak pernah terjadi) | Setelah `0031` aktif, **3 dari 4 user terkunci total** — 0 cabang, 0 produk, 0 transaksi | `0035` mendaftarkan seluruh anggota cabang aktif ke workspace-nya |
| 2 | `products_public` dibuat `security_invoker=false` (menembus RLS) **tanpa filter workspace** | Tenant mana pun bisa membaca **seluruh katalog seluruh tenant** | `0036` menanam guard workspace di dalam view; HPP tetap tersembunyi |
| 3 | `branches.code` unik **GLOBAL** | Tenant kedua tidak bisa memakai kode `UTAMA` → **provisioning pelanggan kedua pasti gagal** | `0037` mengganti dengan unik `(workspace_id, code)` |

`0037` sekaligus mengisi KEP-002: **`platform.provision_workspace()`** membuat tenant lengkap
secara atomik — workspace, keanggotaan owner, langganan + entitlement, cabang pusat,
`branch_settings`, `branch_memberships` (16 permission setara manajer PROD), dan baris
singleton `store_settings`/`org_settings`. Owner diangkat `role='admin'` + `is_master_admin`,
yang kini terkurung di workspace sendiri oleh guard `0031`.

### Hasil uji di STAGING — 3 tenant nyata

| Uji | Hasil |
|---|---|
| #1 Isolasi baca lintas workspace | ✅ tiap owner hanya melihat produk/cabang/workspace-nya |
| #2 Isolasi tulis Storage | ✅ boleh ke workspace sendiri, **ditolak** ke tenant lain |
| #3 Transfer stok lintas workspace | ✅ ditolak `Transfer stok antar-workspace tidak diizinkan` |
| #4 `max_branches` paket Gratis (1) | ✅ ditolak `BATAS_CABANG`; paket Bisnis (10) diizinkan |
| Pendaftaran mandiri | ✅ user memanggil `provision_workspace()` sebagai dirinya sendiri |
| `restock_product` signature baru | ✅ jalan, termasuk saat parameter default dilewatkan |
| **Checkout 6 metode bayar** | ✅ cash, qris, transfer, gofood, shopeefood, grabfood |
| Nomor urut struk | ✅ `TRX-20260807-0001` s/d `0006`, tanpa celah |
| Total & kembalian | ✅ 2×15.000 + 1×20.000 = 50.000, kembalian 50.000 |
| Void & refund | ✅ status benar, **stok kembali tepat** |
| `workspace_id` via trigger | ✅ `transaction_items` (tanpa `branch_id`) terisi otomatis |
| Hash-chain `stock_movements` | ✅ 11 baris, 11 hash unik, rantai utuh |

### Yang MASIH kurang sebelum bisa disebut rilis

1. **UI pendaftaran/onboarding belum ada.** RPC `provision_workspace()` sudah siap dan teruji,
   tetapi belum ada halaman yang memanggilnya. Pelanggan baru masih harus dibuatkan lewat SQL.
2. **Belum deploy** ke Vercel.
3. Uji #6–#8 (kedaluwarsa → turun ke limit Gratis, pulih setelah bayar, SSO lintas subdomain)
   belum dijalankan — ketiganya bergantung pada aplikasi platform/billing yang belum ada.

---

## ⚠️ Keadaan SEBELUM migrasi — diverifikasi 2026-08-07 (arsip)

Baris "Belum dijalankan ke database" di atas **sudah tidak benar**. Introspeksi langsung ke
PROD (`qeoeqspinyydcmoysbrb`) lewat Management API menunjukkan **`0027` dan `0028` sudah
terterap PENUH**; yang tersisa adalah `0029`–`0034`. Migrasi dijalankan **manual lewat SQL
Editor**, bukan lewat CLI — itulah sebabnya tidak ada catatan riwayat.

> Artinya **tahap 1 dan 2 pada tabel §6 sudah lewas**. Eksekusi berikutnya dimulai dari
> **tahap 3 (`0029`)**. Jangan menjalankan ulang `0027`/`0028` ke PROD.

| Migrasi | Status nyata | Bukti |
|---|---|---|
| `0027` | ✅ **TERTERAP PENUH** | 19 tabel di skema `platform`, 8 baris `plans`, produk `kasir-unggul`, `profiles.is_staff` ada, 4 helper (`is_staff`, `user_workspace_ids`, `has_active_entitlement`, `recalc_entitlement`) ada |
| `0028` | ✅ **TERTERAP PENUH** | `workspace_id` (NOT NULL) + `is_main` ada; 3 indeks (`idx_branches_one_main`, `idx_branches_id_workspace`, `idx_branches_workspace`) ada; fungsi `is_main_branch()` + `main_branch_of()` ada; 1 workspace, 1 member, 1 subscription + 1 entitlement `active`, 1 cabang `is_main`, 0 cabang tanpa workspace |
| `0029` | ❌ belum | hanya `branches` yang punya `workspace_id`; 11 tabel target belum. Fungsi `set_workspace_from_branch` tidak ada |
| `0030` | ❌ belum | 7 kolom `branch_id` masih ber-DEFAULT; **13 fungsi masih hardcode `…c1`** (termasuk `create_sale`) |
| `0031` | ❌ belum | **0 dari 60** policy memakai `user_workspace_ids` |
| `0032` | ❌ belum | tidak ada policy `storage` ber-workspace |
| `0033` | ❌ belum | `branches` hanya punya trigger `set_updated_at` |
| `0034` | ❌ belum | `stock_transfers` hanya punya trigger `set_updated_at` |

### 🔴 Prasyarat #1 (reset data) TIDAK terpenuhi

KEP-012 dan §1 tabel prasyarat menyatakan *"Data direset ke nol, 1 master admin tersisa ✅ selesai"*.
**Database tidak kosong:**

| Isi | Jumlah |
|---|---|
| `auth.users` | **4** (1 master admin, 1 admin, 2 kasir) |
| `public.transactions` | **8** |
| `public.products` | **10** |
| `public.branches` | **2** |

Konsekuensinya: penilaian **"Risiko RENDAH (tabel kosong)"** pada `0029` **tidak lagi berlaku** —
`workspace_id` perlu backfill nyata (volumenya kecil, tapi bukan nol). Klaim §4(e)
*"migrasi data existing — tidak ada"* juga perlu ditinjau ulang.

### 🔴 Prasyarat #4 (PITR) TIDAK terpenuhi — tidak ada titik pulih

Management API `/database/backups` mengembalikan `pitr_enabled: false` dan `backups: []`.
**Tidak ada satu pun titik pulih.** Menjalankan `0030`/`0031` (menulis ulang `create_sale` +
membungkus 60 policy) tanpa titik pulih berarti kegagalan tidak bisa di-rollback.

### ✅ STAGING sekarang ADA, dan menangkap 5 bug yang akan menggagalkan PROD

Proyek staging dibuat 2026-08-07: `wmwpjtujtburrybtdivh` (*Taufiqurrahman POS STAGING*,
ap-southeast-1, free tier — nol biaya, kuota free tier org masih 2). Kredensial ada di
`.env.local` (di-gitignore).

`supabase link` + `config.toml` kini terkonfigurasi, jadi **riwayat migrasi resmi sudah ada**
(`supabase_migrations.schema_migrations`, 34 baris di staging). Seluruh `0001`–`0034` terbukti
jalan dari database kosong.

Replay itu menemukan **5 bug nyata** — semuanya akan menghentikan migrasi di PROD juga:

| # | Berkas | Bug | Perbaikan |
|---|---|---|---|
| 1 | `0029` | `platform.current_workspace_id()`: `having count(*) = 1` tanpa `GROUP BY` → `id` bukan agregat (SQLSTATE 42803). **Fungsi ini tidak akan pernah terbentuk.** | Ganti dengan subquery `where (select count(*) from workspaces) = 1` |
| 2 | `0030` | `adjust_stock(...)`: parameter tanpa DEFAULT (`p_branch_id`) berada **setelah** parameter ber-DEFAULT (`p_note`) → SQLSTATE 42P13. Sama pada `restock_product` | `p_branch_id` dipindah ke depan + `drop function` versi lama |
| 3 | `0030` | Karena urutan tipe berubah, `CREATE OR REPLACE` akan membuat **overload baru** dan meninggalkan versi lama yang masih ber-DEFAULT `…c1` tetap hidup — membatalkan KEP-009 dan membuat PostgREST ambigu | `drop function if exists` eksplisit untuk kedua signature lama |
| 4 | `0030` | Blok verifikasi memanggil `pg_get_functiondef()` atas SEMUA `pg_proc` → error `"array_agg" is an aggregate function` (42809) | Tambah filter `p.prokind = 'f'` |
| 5 | `0028`/`0029`/`0033` | Ketiganya `raise exception` bila belum ada master admin/workspace → **rantai migrasi tidak replayable di database kosong**. Ini mematikan staging, CI, pemulihan bencana, dan kelak provisioning tenant baru | Jalur "database tanpa tenant": struktur tetap dibangun penuh, bootstrap data dilewati dengan `raise notice` |

> Bug #1–#4 bukan soal lingkungan — itu SQL yang tidak sah. Menjalankan `0029`/`0030` langsung
> ke PROD **pasti gagal di tengah jalan**. Tanpa staging ini, kegagalan itu terjadi di
> database berisi data pelanggan, tanpa PITR dan tanpa backup.

### Hasil verifikasi STAGING setelah `0001`–`0034`

| Penanda | Hasil |
|---|---|
| Tabel ber-`workspace_id` | **12** (11 + `branches`) — sesuai rencana |
| Kolom `branch_id` ber-DEFAULT `…c1` | **0** |
| Fungsi mengandung `…c1` | **0** (dari 13) |
| Policy `public` memakai `user_workspace_ids` | **60 / 60** |
| Policy tanpa guard workspace | **0** |
| Policy storage ber-workspace | 2 tulis (`storage_products_write_ws`, `storage_brand_write_ws`) + 1 baca publik |
| Trigger `0033` / `0034` | `trg_guard_max_branches`, `trg_guard_max_users`, `trg_guard_transfer_workspace` |

Gerbang kode terhadap skema baru: `tsc --noEmit` **0 error**, `eslint` **bersih**,
`vitest` **15/15 lulus**, `next build` **sukses**.

### ⚠️ Divergensi skema STAGING vs PROD yang masih terbuka

Di staging `branches.workspace_id` masih **NULLABLE** (di PROD sudah NOT NULL), karena cabang
seed `…c1` dari `0015` menggantung tanpa workspace selama belum ada owner. Akibatnya
`types/database.ts` yang digenerate dari staging menandai kolom itu nullable, dan
`BranchLite.workspace_id` ikut menjadi `string | null`.

**Cara menutupnya:** buat satu tenant di staging (user + workspace + klaim cabang), lalu
`alter table public.branches alter column workspace_id set not null`. Itu tepat pekerjaan yang
akan dilakukan **alur provisioning** — yang belum ada (KEP-002). Sampai itu ada, regenerate
`types/database.ts` dari **PROD** setelah PROD selesai dimigrasi.

### 🔴 Tidak ada riwayat migrasi di PROD & PITR masih mati

- Tabel `supabase_migrations.schema_migrations` **tidak ada di PROD** → nol catatan migrasi.
  Sebelum `supabase db push` menyentuh PROD, `0001`–`0028` **wajib** ditandai terterap:
  `supabase migration repair --status applied 0001 0002 … 0028`. Tanpa itu `db push` akan
  mencoba menjalankan ulang seluruh 28 migrasi lama ke database berisi data.
- **PITR masih `false` dan daftar backup masih kosong.** Ini satu-satunya prasyarat §1 yang
  belum tertutup, dan satu-satunya alasan tersisa untuk menunda eksekusi ke PROD.

---

## 0. Ringkasan

Delapan migrasi SQL (`0027`–`0034`) dan sembilan berkas kode aplikasi. Dikerjakan di branch
`feat/multi-tenant`, dijalankan ke database yang **sudah direset ke nol** (KEP-012).

**Yang membuat rencana ini jauh lebih ringan dari rancangan awal PRD:** karena data direset,
seluruh pekerjaan backfill, migrasi data lama, dan jendela pemeliharaan **hilang**. Yang tersisa
murni perubahan struktur.

### Kontradiksi Aturan Emas — ternyata semu

Analisis awal menyimpulkan bahwa "hanya perubahan aditif" bertabrakan dengan "re-scope Master
Admin", karena `is_master_admin()` bersifat global dan dipakai 31 dari 60 policy.

**Tidak perlu menyentuh fungsi itu sama sekali.** Pola policy yang ada:

```sql
is_master_admin() OR branch_id IN (SELECT user_branch_ids())
```

Cukup dibungkus guard induk:

```sql
(is_master_admin() OR branch_id IN (SELECT user_branch_ids()))
  AND workspace_id = ANY(platform.user_workspace_ids())
OR platform.is_staff()
```

`AND` mengikat lebih kuat dari `OR`, sehingga terbaca
`((lama AND guard_workspace) OR is_staff())`. Master Admin tetap "global" menurut fungsinya, tapi
terkurung di workspace-nya sendiri. **Nol perubahan fungsi, nol perubahan perilaku dalam satu
workspace** — persis PRD §4C.5.

---

## 1. Prasyarat sebelum baris pertama ditulis

| # | Prasyarat | Status |
|---|---|---|
| 1 | Data direset ke nol, 1 master admin tersisa (KEP-012) | ✅ selesai |
| 2 | **2 trigger append-only kembali terpasang** — verifikasi Bagian 3 | ⬜ pastikan |
| 3 | Branch git `feat/multi-tenant` | ⬜ |
| 4 | PITR aktif di PROD | ⬜ |
| 5 | Skema `platform` didaftarkan di Dashboard → Settings → API → **Exposed schemas** | ⬜ setelah `0027` |

### ⚠️ Keputusan yang perlu dikonfirmasi: di mana migrasi platform tinggal?

KEP-011 menetapkan platform sebagai **repo terpisah**, tapi KEP-001 menetapkan **satu database**
untuk keduanya. Dua repo dengan folder migrasi terpisah yang menulis ke satu database akan
berebut tabel riwayat migrasi Supabase.

**Rekomendasi:** seluruh migrasi — termasuk skema `platform` — tetap di
`Aplikasi POS/supabase/migrations` sebagai **satu-satunya sumber kebenaran database**. Repo
platform *memakai* database, tapi tidak memiliki migrasinya. Alasannya: 26 migrasi sudah ada di
sini, `supabase link` sudah terkonfigurasi di sini, dan satu database hanya boleh punya satu
riwayat migrasi.

---

## 2. (a) Migrasi SQL — tabel & kolom baru

### `0027_platform_schema.sql` — fondasi platform
**Risiko: RENDAH.** Murni aditif, tidak menyentuh `public` kecuali menambah 2 kolom.

```sql
create schema if not exists platform;
```

| Objek | Isi |
|---|---|
| Tenant | `workspaces`, `workspace_members` |
| Katalog & harga | `products`, `plans`, `bundles`, `bundle_items`, `coupons` |
| Transaksi bisnis | `orders`, `order_items`, `payments`, `payment_webhook_events`, `invoices` |
| Langganan | `subscriptions`, `subscription_addons` (KEP-006), `entitlements` |
| Operasional | `provisioning_jobs`, `usage_counters` (KEP-007), `waitlist`, `audit_logs` |
| Helper | `is_staff()`, `user_workspace_ids()`, `is_workspace_member(ws)`, `workspace_role(ws)`, `has_active_entitlement(ws, product)`, `recalc_entitlement(ws, product)` |

Perubahan pada `public` — **hanya dua kolom, murni aditif**:
```sql
alter table public.profiles
  add column if not exists is_staff boolean not null default false,
  add column if not exists staff_role text;   -- enum: super_admin|finance|support|marketing
```

**Seed:** 1 produk `kasir-unggul` + **8 baris `plans`** (Handoff §8.2/§8.4 — Gratis, Basic×2,
Pro×2, Bisnis×2, Enterprise; tanpa alur trial, KEP-011).

Seluruh helper `stable security definer set search_path = platform, public` agar aman dipanggil
dari policy di `public`.

> ⚠️ Setelah migrasi ini: daftarkan `platform` di **Exposed schemas**, kalau tidak klien tidak
> bisa mengaksesnya sama sekali.

---

### `0028_branches_workspace.sql` — jangkar tenant
**Risiko: SEDANG.** Mengubah `branches` yang dirujuk hampir semua tabel.

```sql
alter table public.branches
  add column workspace_id uuid references platform.workspaces(id),
  add column is_main boolean not null default false;

create unique index idx_branches_one_main
  on public.branches(workspace_id) where is_main;
create index idx_branches_id_workspace
  on public.branches(id, workspace_id);   -- penopang jalur join KEP-004
```

Lalu, dalam migrasi yang sama:
1. Buat **satu workspace** untuk master admin yang tersisa (KEP-012 membuat ini deterministik —
   hanya ada satu akun)
2. `workspace_members` → `role='owner'`
3. `branches` id `…c1` → `workspace_id` = workspace itu, `is_main = true`
4. `entitlements` status `active`, plan **Bisnis**, agar seluruh fitur tetap terbuka selama
   pengembangan
5. `workspace_id` di-`set not null` **setelah** langkah 3

---

### `0029_workspace_id_kolom.sql` — 11 tabel penerima kolom
**Risiko: RENDAH** (tabel kosong). Ini yang tadinya paling berat; reset menghapus seluruh bobotnya.

| Kelompok | Tabel | Sumber pengisian |
|---|---|---|
| **A** — tanpa jalur cabang | `products`, `categories`, `suppliers`, `notifications` | wajib diisi RPC/aplikasi |
| **A** — singleton | `store_settings`, `org_settings` | backfill 1 baris yang tersisa (KEP-003) |
| **C** — volume tinggi | `transactions`, `transaction_items`, `payments`, `branch_products`, `cash_sessions` | trigger turunan dari `branch_id` |

Untuk kelompok C, `workspace_id` diisi **otomatis oleh trigger** yang menurunkannya dari
`branch_id` — bukan input manual (PRD §4C.3):

```sql
create function public.set_workspace_from_branch() returns trigger ... as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id
      from public.branches where id = new.branch_id;
  end if;
  return new;
end $$;
```

`transaction_items` tidak punya `branch_id` → diturunkan dari `transaction_id`.

**Index komposit diawali `workspace_id`** (syarat PRD §4A.2), contoh:
```sql
create index on public.transactions (workspace_id, branch_id, created_at desc);
create index on public.branch_products (workspace_id, branch_id, product_id);
```

**Tidak disentuh (KEP-004):** `stock_movements`, `audit_logs` — append-only + hash chain.
Keduanya di-scope lewat join ke `branches`.

---

### `0030_hapus_hardcode_cabang.sql` — KEP-009
**Risiko: TINGGI.** Menulis ulang 13 RPC termasuk `create_sale`.

Tiga lapisan sekaligus:

**Lapisan 1 — hapus DEFAULT dari 7 kolom**
```sql
alter table public.transactions   alter column branch_id drop default;
-- payments, cash_sessions, stock_movements, stock_opnames, cash_expenses, bank_accounts
```
> Audit sudah selesai: hanya **1 jalur** yang mengandalkan default —
> `shifts/actions.ts:166` (`cash_expenses`). Dipatch bersamaan di §3.

**Lapisan 2 — hapus DEFAULT parameter**
```sql
adjust_stock(..., p_branch_id uuid)      -- tanpa DEFAULT '…c1'
restock_product(..., p_branch_id uuid)   -- idem
```

**Lapisan 3 — `v_main` menjadi dinamis di 13 fungsi**
```sql
-- lama:  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
-- baru:
select b.id into v_main
from public.branches b
where b.workspace_id = (select workspace_id from public.branches where id = v_branch)
  and b.is_main;
```

Fungsi terdampak: `adjust_stock`, `approve_wastage`, `complete_opname`, **`create_sale`**,
`dispatch_transfer`, `receive_goods`, `receive_transfer`, `record_wastage`, `refund_sale`,
`restock_product`, `set_branch_price_stock`, `sync_branch_products_insert`, `void_sale`.

> ⚠️ `create_sale` ditulis ulang untuk **ketujuh kalinya**. Ini titik regresi terberat di seluruh
> rencana. Uji checkout paling ketat di sini.

---

### `0031_rls_workspace_guard.sql` — (b) perubahan RLS
**Risiko: TINGGI.** 60 policy dibungkus ulang.

Pola seragam untuk tabel ber-`workspace_id`:
```sql
using (
  (<predikat_cabang_lama>)
  and workspace_id = any(platform.user_workspace_ids())
  or platform.is_staff()
)
```

Pola untuk `stock_movements` (KEP-004 — lewat join):
```sql
exists (select 1 from public.branches b
        where b.id = stock_movements.branch_id
          and b.workspace_id = any(platform.user_workspace_ids()))
or platform.is_staff()
```

Pola untuk `audit_logs` (branch nullable):
```sql
(branch_id is not null and exists (select 1 from public.branches b
    where b.id = audit_logs.branch_id
      and b.workspace_id = any(platform.user_workspace_ids())))
or (branch_id is null and actor_id in (
    select user_id from platform.workspace_members
    where workspace_id = any(platform.user_workspace_ids())))
or platform.is_staff()
```

Pola untuk `cash_expenses` (KEP-005 kelompok D′ — **lewat `cash_session_id`, bukan `branch_id`**):
```sql
exists (select 1 from public.cash_sessions s
        join public.branches b on b.id = s.branch_id
        where s.id = cash_expenses.cash_session_id
          and b.workspace_id = any(platform.user_workspace_ids()))
or platform.is_staff()
```

Optimasi PRD §4A.2: bungkus `auth.uid()` menjadi `(select auth.uid())` di helper agar
di-cache planner.

---

### `0032_storage_workspace.sql` — KEP-007 + KEP-010
**Risiko: SEDANG.** Menutup lubang timpa-menimpa lintas workspace.

```sql
-- Ganti policy lama yang FOR ALL tanpa batasan path
create policy "storage_write_workspace" on storage.objects for all to authenticated
using (
  bucket_id in ('product-images','qris','store-logos')
  and (storage.foldername(name))[1]::uuid = any(platform.user_workspace_ids())
  and public.has_branch_permission(...)      -- ganti is_admin() (KEP-010 #3)
)
with check ( ... sama ... );
```

Objek lama tanpa prefiks **tidak dipindahkan** — URL yang sudah tercetak di struk akan mati bila
dipindah. Ditangani policy pengecualian. (Setelah KEP-012, hanya tersisa foto produk yatim yang
boleh dihapus manual.)

---

### `0033_gerbang_entitlement.sql` — (d) gerbang entitlement
**Risiko: SEDANG.**

**Batas keras** (Handoff §8.5) — dicek saat menambah, bukan saat membaca:
```sql
-- BEFORE INSERT ON public.branches
if (select count(*) from public.branches where workspace_id = new.workspace_id)
   >= (limits->>'max_branches')::int then
  raise exception 'BATAS_CABANG';   -- ditangkap UI -> tawaran upgrade, bukan error mentah
end if;
```
Sama untuk `max_users` pada `platform.workspace_members` + `public.branch_memberships`.

`NULL` pada limit = tak terbatas (Enterprise, Handoff §8.4).

**Fair-use** `monthly_tx_cap` & `storage_mb`: **tidak menghalangi apa pun**. Dihitung Edge
Function terjadwal → `platform.usage_counters`. **Jangan pernah** menambah counter di dalam
`create_sale` (KEP-007).

**Kedaluwarsa** (KEP-008): job harian `past_due` → `expired` setelah 7 hari, lalu
`recalc_entitlement()` menurunkan limits ke tier **Gratis** — bukan mengunci.

---

### `0034_guard_transfer_workspace.sql` — lubang isolasi tulis
**Risiko: RENDAH.** Ditemukan saat inventarisasi KEP-005.

`stock_transfers` punya `from_branch_id`/`to_branch_id` tanpa penjaga → stok bisa berpindah
lintas tenant. `CHECK` tidak boleh memuat subquery di Postgres, jadi memakai trigger:

```sql
-- BEFORE INSERT OR UPDATE ON public.stock_transfers
if (select workspace_id from public.branches where id = new.from_branch_id)
   is distinct from
   (select workspace_id from public.branches where id = new.to_branch_id) then
  raise exception 'Transfer antar-workspace tidak diizinkan';
end if;
```

---

## 3. Perubahan kode aplikasi

| # | Berkas | Perubahan | Dasar |
|---|---|---|---|
| 1 | `lib/constants.ts` | Hapus `MAIN_BRANCH_ID`; ganti dengan resolusi per-workspace | KEP-009 |
| 2 | `lib/branch.ts`, `lib/validations/common.ts` | Ikuti perubahan #1 (total 44 rujukan) | KEP-009 |
| 3 | `app/(dashboard)/shifts/actions.ts:166` | **Isi `branch_id`** pada insert `cash_expenses` — akan gagal setelah `drop default` | KEP-009 |
| 4 | `app/struk/[id]/page.tsx:55` | Turunkan `workspace_id` dari transaksi; hapus `.limit(1)` pada `store_settings` | KEP-003 |
| 5 | `lib/alerts.ts:42` | Turunkan `workspace_id` dari cabang pemicu alert | KEP-003 |
| 6 | `components/domain/product-image-uploader.tsx` | Path `<workspace_id>/products/…` | KEP-007 |
| 7 | `components/domain/store-image-uploader.tsx` | Path `<workspace_id>/store/…` | KEP-007 |
| 8 | `components/domain/qris-uploader.tsx` | Path `<workspace_id>/store/…` | KEP-007 |
| 9 | `types/database.ts` | Regenerasi setelah seluruh migrasi | — |

**Belum dikerjakan di Fase 1B** (menunggu aplikasi platform, KEP-002): kode signup storefront
yang mengirim `signup_source: 'storefront'`, dan patch `handle_new_user`. Selama belum ada
storefront, trigger berperilaku persis seperti sekarang.

---

## 4. (c) Re-scope Master Admin & (e) migrasi data

**(c) Re-scope Master Admin** — lihat §0. Tidak ada fungsi yang diubah; pengurungan terjadi lewat
guard `AND` di `0031`. `platform.is_staff()` menjadi satu-satunya jalan tembus lintas workspace,
dan itu hanya untuk staff internal.

**(e) Migrasi data existing** — **tidak ada** (KEP-012). `0028` cukup membuat satu workspace untuk
master admin yang tersisa dan memberinya entitlement aktif. Ini menghapus PRD §4C.6 langkah 3–5
seluruhnya.

---

## 5. (f) Matriks uji regresi per modul

> ⚠️ **Baseline = perilaku SEKARANG, bukan yang tertulis di PRD** (KEP-010). Empat hal di
> PRD v2 §16-D **tidak boleh** diuji sebagai "harus tetap sama" karena memang belum pernah ada.

### Yang HARUS sama sebelum & sesudah

| Modul | Uji | Titik risiko |
|---|---|---|
| **Kasir** | Checkout 6 metode bayar (termasuk GoFood/ShopeeFood/GrabFood), ongkir, hold, void, struk, **nomor urut berlanjut tanpa celah** | `create_sale` ditulis ulang ke-7 |
| **Produk & Harga Cabang** | CRUD, foto, harga & min-stock per cabang, sinkron katalog → cabang | `workspace_id` pada katalog global |
| **Inventory** | Ledger, opname **langsung `draft`→`completed` tanpa approval**, penyesuaian ber-approval | KEP-010 |
| **Gudang** | Transfer dua sisi, penerimaan, wastage ber-approval | `v_main` dinamis |
| **Shift** | Buka/tutup, blind count, rekonsiliasi, cash movements, **`cash_expenses` tetap tersimpan** | #3 di §3 — akan gagal bila terlewat |
| **Penjualan/Dashboard/Laporan** | Angka & diagram identik; ekspor jalan | filter `workspace_id` |
| **Persetujuan** | 7 jenis approval, peminta ≠ penyetuju | — |
| **Keamanan & Audit** | Hash-chain utuh, celah nomor urut terdeteksi, Z-report | `stock_movements` tidak disentuh (KEP-004) |
| **Pengaturan** | Pajak, rekening (bank dinamis), QRIS, tema per cabang | KEP-003 |

### Yang BARU dan harus dibuktikan

| # | Uji | Cara |
|---|---|---|
| 1 | Workspace A tidak bisa membaca data workspace B | Query langsung sebagai user A, **bukan lewat UI** |
| 2 | Workspace A tidak bisa **menimpa** foto/QRIS workspace B | Upload ke path workspace lain → harus ditolak |
| 3 | Transfer stok antar-workspace mustahil | `create_transfer` lintas workspace → harus `raise exception` |
| 4 | `max_branches` dihormati | Tambah cabang melebihi limit → tawaran upgrade, bukan error mentah |
| 5 | `max_users` dihormati | Idem untuk penambahan user |
| 6 | Kedaluwarsa → turun ke limit Gratis | Set `past_due` +8 hari → kasir **tetap jalan**, cabang ke-2 read-only |
| 7 | Bayar kembali → pulih utuh | Cabang & seat kembali aktif seluruhnya |
| 8 | **SSO lintas subdomain** | Login di `app.` → buka `kasir.` → sudah masuk tanpa login ulang |

> Uji #1 **wajib lewat query langsung**. UI bisa menyembunyikan kebocoran; RLS tidak.
> Uji #8 adalah titik gagal paling halus di seluruh arsitektur (KEP-011).

---

## 6. Urutan eksekusi & titik henti

| Tahap | Migrasi | Titik henti |
|---|---|---|
| 1 | `0027` | Daftarkan **Exposed schemas**, verifikasi seed 8 plan |
| 2 | `0028` | Verifikasi 1 workspace + 1 entitlement aktif + `is_main` |
| 3 | `0029` | **Uji regresi penuh** — masih 1 workspace, semua harus identik |
| 4 | `0030` + kode #1–3 | **Uji regresi kasir paling ketat.** `create_sale` ditulis ulang |
| 5 | `0031` | Uji isolasi #1 dengan workspace kedua buatan |
| 6 | `0032` + kode #6–8 | Uji isolasi #2 |
| 7 | `0033` | Uji #4–7 |
| 8 | `0034` | Uji #3 |
| 9 | kode #4, #5, #9 | Uji struk publik & alert |

**Berhenti dan lapor** bila tahap mana pun gagal uji regresinya. Jangan menumpuk migrasi di atas
tahap yang belum bersih.

---

## 7. Yang TIDAK dikerjakan di Fase 1B

Dicatat agar tidak hilang, dan agar tidak menambah perubahan perilaku pada fase yang justru
melarangnya (KEP-010):

1. Approval opname (enum +2 nilai, `stock_opnames.approved_by`)
2. RPC `verify_hash_chain(table)`
3. Log reprint struk
4. **Immutability `transactions` + model reversal** — Fase 4 yang tertunda, paling besar
5. Overlay PIN manajer
6. Bersihkan `BANKS` di `lib/constants.ts` (kode mati)
7. Signup storefront + patch `handle_new_user` (menunggu aplikasi platform)
8. Pensiunkan model peran v1 di `profiles`

---

## 8. Yang perlu Anda setujui

1. **Rencana ini secara keseluruhan** (Handoff §4 poin 4)
2. **Lokasi migrasi platform** — rekomendasi: tetap di `Aplikasi POS/supabase/migrations` (§1)
3. **Plan awal workspace pengembangan** — rekomendasi: **Bisnis**, agar semua fitur terbuka
   selama pengembangan tanpa terhalang gerbang entitlement sendiri
