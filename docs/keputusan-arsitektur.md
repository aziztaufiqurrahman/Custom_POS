# Log Keputusan Arsitektur — Migrasi Multi-Tenant

Catatan permanen setiap keputusan yang diambil selama migrasi Kasir Unggul → SaaS multi-tenant.
Rujukan: `PRD-UMKM-Unggul-ClaudeCode.md` (§4C, Fase 1B) · `Handoff-ClaudeCode-Migrasi-MultiTenant.md`

**Aturan Emas:** perubahan bersifat ADITIF. Jangan mengubah/menghapus tabel, kolom fungsional,
atau logika fitur POS. Bila sebuah perubahan memaksa mengubah perilaku fitur — HENTIKAN dan
konfirmasi ke pemilik lebih dulu.

---

## Antrean kerja (urut dari yang paling bermasalah)

| # | Isu | Status |
|---|---|---|
| B1 | Tabrakan nama tabel / lokasi skema platform | ✅ **Diputuskan** |
| B2 | `handle_new_user` — karyawan kasir dapat workspace sendiri | ✅ **Diputuskan** |
| B3 | `org_settings` & `store_settings` singleton → bocor lintas workspace | ✅ **Diputuskan** |
| B4 | Backfill `workspace_id` ditolak trigger append-only | ✅ **Diputuskan** |
| K3 | Daftar final tabel penerima `workspace_id` | ✅ **Diputuskan** |
| L1 | Tidak ada tabel add-on | ✅ **Diputuskan** |
| L2 | Tidak ada metering `monthly_tx_cap` / `storage_mb` | ✅ **Diputuskan** |
| L3 | Peta `subscriptions.status` → `entitlements.status` + grace period | ✅ **Diputuskan** |
| K1/K2/K4 | Kontradiksi mekanis antar-dokumen (Pro 5→3 cabang, 2-3→9 plan, nama model) | ✅ **Dipatch** |
| B5 | UUID cabang pusat hardcoded di 3 lapisan (ditemukan dari dump) | ✅ **Diputuskan** |
| R1 | Rekonsiliasi PRD v2 ↔ sistem aktual (37 perbedaan) | ✅ **Selesai** (KEP-010) |
| D1 | Keputusan komersial PART D (gateway, trial, notifikasi, repo, SSO) | ✅ **Diputuskan** (KEP-011) |
| D2 | Reset data produksi ke nol | ✅ **DILAKSANAKAN** (KEP-012) — dikonfirmasi pemilik 2026-08-06 |
| P1 | Rencana migrasi Fase 1B | ✅ **Tersusun & disetujui** — `docs/RENCANA-MIGRASI-1B.md` |
| P2 | Implementasi Fase 1B (8 migrasi + 12 berkas kode) | ✅ **DITULIS** — menunggu dijalankan ke database |
| S1 | 3 kebocoran baru dari audit `SECURITY DEFINER` | ✅ **Ditutup** di 0030/0031 — lihat KEP-013 |
| — | Ground truth skema produksi | ✅ **Diterima & terverifikasi** |
| — | `PRD-POS-Multi-Cabang-v2.md` — baseline regresi | ✅ **Diterima & direkonsiliasi** |
| — | PROD vs STAGING | ✅ Terjawab: `qeoeqspinyydcmoysbrb` = **PRODUKSI** |
| — | 7 keputusan kosong | ✅ **Semuanya terjawab** (KEP-011 + KEP-012) |
| — | Eksekusi: backup → reset → pilih owner → branch git | 🔴 **Butuh aksi pemilik** |

**Semua keputusan desain selesai (KEP-001 s/d KEP-012).** Langkah berikutnya terhalang input
dari pemilik — lihat bagian paling bawah dokumen ini.

---

## Hasil verifikasi ground truth (2026-08-06)

Dump produksi diterima di `docs/schema-dump/` (10 CSV). **Tidak ditemukan drift.**
Kekhawatiran Handoff §1 — *"database produksi bisa drift dari migrasi"* — tidak terbukti.

| Diperiksa | Hasil |
|---|---|
| Daftar tabel | 30 tabel, **identik** dengan folder migrasi |
| Daftar fungsi | 34 fungsi aplikasi, **identik** — tidak ada RPC siluman |
| RLS | **aktif di semua 30 tabel**; `FORCE RLS` tidak aktif di mana pun (service role tetap menembus) |
| `handle_new_user` | persis 0001 → KEP-002 aman dieksekusi |
| `hash_chain` | persis 0015, mem-hash seluruh baris → KEP-004 terkonfirmasi |
| `guard_append_only` | memblokir tanpa syarat, semua peran → KEP-004 terkonfirmasi |
| `is_master_admin` | **global**; 31 dari 60 policy bergantung padanya |
| Policy Storage | `ALL` + hanya cek bucket & peran, **tanpa batasan path** → KEP-007 terkonfirmasi di produksi |
| Path storage | `products/<uuid>.jpg`, 22 objek, tanpa prefiks workspace |
| Enum | 15 enum |

**Volume tabel** (`pg_stat_user_tables`) sempat tertinggal, tapi **tidak relevan lagi** setelah
KEP-012 — seluruh data direset ke nol, sehingga tidak ada yang perlu diukur untuk merencanakan
backfill.

---

## KEP-001 — Penempatan skema platform

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Terkait:** PRD §6.0, §4C.5, §2.1

### Keputusan
Satu proyek Supabase, **dua skema**. Platform di skema `platform`; Kasir Unggul tetap di
`public` tanpa disentuh. `public.profiles` adalah satu-satunya tabel bersama — hanya ditambah
kolom `is_staff` dan `staff_role`.

### Masalah yang diselesaikan
PRD §6 mendefinisikan `products`, `payments`, dan `audit_logs` untuk platform. Ketiganya
**sudah dipakai POS** dengan arti berbeda total:

| Tabel | Platform | POS (nyata) |
|---|---|---|
| `products` | katalog tool SaaS | barang dagangan (sku, barcode, sell_price) |
| `payments` | pembayaran langganan (gateway) | pembayaran transaksi kasir (cash/QRIS) |
| `audit_logs` | aksi staff internal | audit append-only + hash-chain |

Bila platform dibuat di `public`, `create table if not exists` **lewat tanpa error** dan kode
storefront akan membaca barang dagangan pelanggan sebagai katalog tool. Gagal senyap.

### Alternatif yang ditolak
- **Prefix `saas_*` dalam satu skema** — menyimpang dari nama di PRD §6 sehingga Fase 1–5
  harus ditulis ulang; ~40 tabel bercampur dalam satu skema; rawan salah pilih tabel.
- **Dua proyek Supabase terpisah** — melanggar §2.1 (dua `auth.users` → SSO pecah) dan §4C.5
  (`entitlements` tak terjangkau policy RLS POS, karena fungsi Postgres tidak bisa membaca
  lintas database).

### Konsekuensi yang harus dieksekusi
- [ ] Migrasi Fase 1 diawali `create schema if not exists platform;`
- [ ] **Aksi pemilik:** daftarkan `platform` di Dashboard → Settings → API → Exposed schemas
      (dilakukan setelah skema dibuat di staging)
- [ ] Klien mengakses via `supabase.schema('platform').from(...)`
- [ ] Rujukan `audit_logs` di PRD §5.10 & §7 berarti `platform.audit_logs`, bukan milik POS
- [ ] Helper RLS platform (`is_staff()`, `user_workspace_ids()`, `has_active_entitlement()`)
      dibuat `security definer` + `search_path` eksplisit agar aman dipanggil dari policy `public`

### Dokumen yang sudah dipatch
- `PRD-UMKM-Unggul-ClaudeCode.md` §6.0 (subbab baru) dan prompt Fase 1

---

## KEP-002 — Pembuatan workspace default saat signup

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Terkait:** PRD §5.1, Fase 1

### Keputusan
`handle_new_user` **ditambah satu cabang bersyarat**, bukan ditulis ulang. Workspace default
hanya dibuat bila `new.raw_user_meta_data->>'signup_source' = 'storefront'` — penanda yang
**hanya** ditulis oleh kode signup storefront (belum ada, dibuat di Fase 1).

```sql
-- di dalam handle_new_user(), SETELAH insert profiles yang sudah ada:
if new.raw_user_meta_data->>'signup_source' = 'storefront' then
  -- insert platform.workspaces + platform.workspace_members(role='owner')
end if;
```

### Masalah yang diselesaikan
PRD §5.1 dan prompt Fase 1 memerintahkan trigger selalu membuat workspace default. Diterapkan
apa adanya, **setiap karyawan kasir yang diundang Master Admin akan jadi owner workspace kosong**
— database penuh workspace sampah dan hitungan `max_users` kacau.

Penyebabnya: POS mengundang karyawan lewat
`admin.auth.admin.inviteUserByEmail(email, { data: { full_name } })`
([`app/(dashboard)/employees/actions.ts:57`](../app/(dashboard)/employees/actions.ts)),
yang dari sudut pandang trigger **identik** dengan signup self-serve.

### Kenapa penanda POSITIF, bukan negatif
Gagal-aman. Tanpa penanda = tanpa workspace. Jalur pembuatan user mana pun yang belum
terpikir (user dibuat manual di Dashboard, OAuth Google di §5.1, undangan ulang) otomatis
aman. Penanda negatif akan menjadikan "buat workspace" sebagai perilaku default, sehingga
setiap jalur yang terlewat menghasilkan workspace sampah.

Efek samping yang diinginkan: **kode POS tidak berubah satu baris pun** — Aturan Emas §4C
terpenuhi sepenuhnya.

### Alternatif yang ditolak
- **Workspace dibuat di server action platform** — risiko ke POS nol mutlak, tapi tidak
  atomik (signUp sukses lalu insert gagal = user tanpa workspace) dan menyimpang dari §5.1.
  Ditolak, tapi pengaman `ensureWorkspace()` saat login pertama tetap layak ditambahkan
  sebagai jaring pengaman.
- **Penanda negatif `invited_to_workspace`** — menuntut edit `employees/actions.ts` dan
  gagal-bahaya pada jalur yang terlewat.

### Konsekuensi yang harus dieksekusi
- [x] ✅ **PRASYARAT TERPENUHI (2026-08-06):** versi produksi `handle_new_user` sudah diverifikasi
      dari dump — **persis sama** dengan `0001_init.sql`, hanya melakukan `insert into profiles`.
      Tidak ada drift, sehingga patch aditif aman dilakukan.
- [ ] Kode signup storefront WAJIB mengirim `signup_source: 'storefront'` di `options.data`
- [ ] Tambah `ensureWorkspace(userId)` saat login platform sebagai jaring pengaman
- [ ] **Menyusul (bukan sekarang):** alur undangan karyawan POS perlu ikut menulis baris
      `platform.workspace_members`, karena `max_users` dihitung dari sana. Ini penambahan
      baris di tabel baru (aditif), dikerjakan bersama gerbang entitlement — lihat L1/L2.

### Dokumen yang sudah dipatch
- `PRD-UMKM-Unggul-ClaudeCode.md` §5.1 dan prompt Fase 1

---

## KEP-003 — Tabel singleton `store_settings` & `org_settings`

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Terkait:** PRD §4C.3

### Keputusan
Tambah `workspace_id` + `UNIQUE(workspace_id)` + RLS ke **kedua** tabel. Biarkan 15 titik baca
ber-auth apa adanya; patch **2 titik service-role** secara eksplisit di migrasi yang sama.
**Tidak** dikonsolidasikan.

### Masalah yang diselesaikan
Kedua tabel tidak punya kunci tenant sama sekali dan hanya berisi satu baris:

| Tabel | Isi | Titik baca |
|---|---|---|
| `store_settings` | `store_name`, `logo_url`, `address`, `phone`, `receipt_footer`, `qris_image_url`, `tax_*`, `trx_prefix` | 13 |
| `org_settings` | `org_name`, `logo_url`, `default_*_threshold`, `alert_whatsapp` | 4 |

Semua dibaca dengan `.limit(1).maybeSingle()`. Begitu ada workspace kedua, pola itu
mengembalikan baris **siapa saja**.

### Kenapa 15 titik tidak perlu diubah
RLS mengevaluasi predikat **sebelum** `LIMIT`. Setelah policy
`workspace_id = ANY(user_workspace_ids())` terpasang, user hanya pernah melihat barisnya
sendiri — sehingga `.limit(1).maybeSingle()` justru mengembalikan baris yang benar. Nol
perubahan kode, nol perubahan perilaku saat jumlah workspace = 1.

### Dua titik yang WAJIB dipatch (menembus RLS)
| Titik | Client | Dampak bila dibiarkan |
|---|---|---|
| [`app/struk/[id]/page.tsx:55`](../app/struk/[id]/page.tsx) | `createAdminClient()` | Struk **publik** menampilkan nama toko, logo, dan **gambar QRIS UMKM lain** → pelanggan salah transfer |
| [`lib/alerts.ts:42`](../lib/alerts.ts) | `createAdminClient()` | Alert anti-fraud UMKM A terkirim ke **nomor WhatsApp UMKM B** |

Keduanya harus menurunkan `workspace_id` dari **transaksi/cabang yang sedang dirender**,
bukan dari `auth.uid()` — halaman struk publik memang tidak punya sesi.

### Alternatif yang ditolak
- **Tunda patch 2 titik service-role** — kebocoran tetap terbuka; hanya aman selama jumlah
  workspace = 1, dan tidak terlihat di UI sehingga berisiko tinggi terlupakan.
- **Konsolidasi `store_settings` → `org_settings`** — menyentuh 17 titik kode POS yang sudah
  berjalan; melanggar Aturan Emas §4C demi kerapian skema.

### Konsekuensi yang harus dieksekusi
- [ ] `alter table` + `UNIQUE(workspace_id)` + RLS pada `store_settings` & `org_settings`
- [ ] Backfill: satu baris yang ada → workspace hasil migrasi
- [ ] Patch `app/struk/[id]/page.tsx` dan `lib/alerts.ts`
- [ ] **Provisioning (Fase 3 §5.6) wajib membuat baris `store_settings` + `org_settings`
      untuk setiap workspace baru** — kalau tidak, UMKM baru dapat pengaturan kosong
- [ ] Terima duplikasi identitas brand di 3 tempat (`platform.workspaces`, `org_settings`,
      `store_settings`); jangan konsolidasikan
- [ ] Regresi: modul **Pengaturan** + cetak struk + invoice + alert WA

---

## KEP-004 — `stock_movements` & `audit_logs` tidak didenormalisasi

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Terkait:** PRD §4C.3, Fase 1B langkah 2
**⚠️ Menyimpang dari PRD** — PRD sebelumnya menyebut `stock_movements` sebagai target denormalisasi.

### Keputusan
**Nol perubahan skema** pada `stock_movements` dan `audit_logs`. Tidak ada `ALTER`, tidak ada
`UPDATE`, `hash_chain()` dan `guard_append_only()` tidak disentuh. Workspace diturunkan lewat
join ke `branches`.

### Masalah yang diselesaikan
Tiga fakta yang ditemukan di kode:

1. **`hash_chain()` mem-hash seluruh isi baris:**
   ```sql
   v_json := (to_jsonb(new) - 'prev_hash' - 'row_hash')::text;
   ```
   Sehingga `ALTER TABLE ADD COLUMN workspace_id` **saja sudah** mematahkan verifikasi baris
   historis — `to_jsonb()` baris lama kini memuat `"workspace_id": null` yang tidak ada saat
   hash dulu dihitung. Backfill memperparah, tapi bukan penyebab utamanya.

2. **`guard_append_only()` memblokir UPDATE/DELETE untuk semua peran, termasuk service role**
   ([0015:305](../supabase/migrations/0015_multibranch_foundation.sql)). Backfill akan gagal
   di tengah migrasi kecuali guard dilepas sesaat.

3. **Belum ada verifikator rantai hash di mana pun.** `row_hash`/`prev_hash` hanya muncul di
   `types/database.ts` hasil generate. Modul Keamanan memverifikasi celah nomor urut
   (`branch_seq_gaps`) dan penutupan harian, bukan rantai hash. Artinya kerusakan rantai
   **tidak akan menggagalkan tes apa pun hari ini** — dan justru itu bahayanya: baru ketahuan
   tidak berguna saat dibutuhkan untuk sengketa/forensik.

### Kenapa menyimpang dari PRD dibenarkan
`branches` adalah tabel mungil (beberapa baris per workspace) yang selalu tercache, sehingga
join ke sana praktis gratis. Manfaat performa denormalisasi di dua tabel ini **kecil**,
sementara ongkosnya **merusak jaminan integritas fitur keamanan**. Tukar-tambah tidak sepadan.

### Pola RLS
```sql
-- stock_movements (branch_id NOT NULL, default '...c1')
exists (select 1 from public.branches b
        where b.id = stock_movements.branch_id
          and b.workspace_id = any(user_workspace_ids()))
or is_staff()

-- audit_logs (branch_id NULLABLE — "aksi global")
(branch_id is not null and exists (select 1 from public.branches b
    where b.id = audit_logs.branch_id
      and b.workspace_id = any(user_workspace_ids())))
or (branch_id is null and actor_id in (
    select user_id from platform.workspace_members
    where workspace_id = any(user_workspace_ids())))
or is_staff()
```
Aksi global (branch_id NULL) diresolusi lewat **pelakunya**: "Anda boleh melihat entri audit
global yang dibuat anggota workspace Anda."

### Alternatif yang ditolak
- **Seal & re-chain** — catat seal pra-migrasi, lepas guard, backfill, hitung ulang rantai,
  catat seal baru. Ditolak: seluruh `row_hash` historis ditulis ulang sehingga sifat
  tamper-evident bergeser dari rantai ke seal buatan kita sendiri; guard dilepas sesaat;
  dan bila perhitungan ulang salah, kerusakan permanen tanpa alat deteksi.
- **Tambah kolom + kecualikan dari hash** (`- 'workspace_id'` di `hash_chain()`) — secara
  matematis sah dan baris lama tetap terverifikasi, tapi baris lama tetap `NULL` sehingga RLS
  **tetap** butuh jalur join. Hasilnya dua jalur sekaligus dengan manfaat tambahan tipis,
  plus verifikator masa depan wajib mengingat aturan pengecualian ini.

### Konsekuensi yang harus dieksekusi
- [ ] Index pendukung: `create index on public.branches(id, workspace_id)`
- [ ] RLS `stock_movements` & `audit_logs` memakai pola join di atas
- [ ] Uji performa RLS pada `stock_movements` dengan volume nyata sebelum ke prod
- [ ] **Utang teknis tercatat:** belum ada verifikator rantai hash. Layak ditambahkan sebagai
      RPC `verify_hash_chain(table)` di modul Keamanan — di luar cakupan Fase 1B, tapi jangan
      dilupakan; tanpa itu, hash-chain hanyalah kolom yang terisi tanpa guna.

---

## KEP-005 — Cakupan `workspace_id` pada 30 tabel POS

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Terkait:** PRD §4C.3, §4A.2, Fase 1B langkah 2

### Keputusan
**12 tabel** mendapat kolom `workspace_id`; **18 sisanya** di-scope lewat join ke `branches`.

> ⚠️ Daftar ini diturunkan dari folder `supabase/migrations`, **bukan** dari database nyata.
> **Wajib diverifikasi ulang** terhadap `current_schema.sql` sebelum dieksekusi.

### Peta lengkap

| Kel. | Tabel | Perlakuan | Alasan |
|---|---|---|---|
| **A** | `products`, `categories`, `suppliers`, `notifications`, `store_settings`, `org_settings` | ➕ kolom | **Tidak punya jalur cabang sama sekali.** Tanpa `workspace_id`, katalog produk semua UMKM bercampur |
| **B** | `branches` | ➕ kolom (FK → `platform.workspaces`) | Jangkar seluruh isolasi |
| **C** | `transactions`, `transaction_items`, `payments`, `branch_products`, `cash_sessions` | ➕ kolom | Volume tinggi — join di setiap evaluasi RLS terlalu mahal. `transaction_items` butuh 2 hop bila tidak didenormalisasi |
| **D** | `bank_accounts`, `branch_settings`, `branch_memberships`, `cash_movements`, `stock_opnames`, `goods_receipts`, `wastages`, `approvals`, `daily_closures` | 🔗 join | Punya `branch_id`, volume rendah — join ke `branches` murah |
| **D′** | `cash_expenses` | 🔗 join lewat **`cash_session_id`** | ⚠️ `branch_id`-nya **tidak pernah diisi** (selalu `…c1`, lihat audit KEP-009). Ikuti pola policy yang sudah ada: `cash_session_id → cash_sessions.branch_id` |
| **E** | `stock_opname_items`, `stock_transfer_items`, `goods_receipt_items`, `wastage_items` | 🔗 join 2 hop | Tabel anak, selalu diakses lewat induknya |
| **F** | `stock_transfers` | 🔗 join + **CHECK** | Lihat di bawah |
| **G** | `stock_movements`, `audit_logs` | 🔗 join | Pengecualian KEP-004 (hash-chain) |
| **H** | `profiles` | ❌ tidak dapat kolom | Satu user bisa jadi anggota banyak workspace; keanggotaan lewat `platform.workspace_members` |

### 🔴 Lubang isolasi yang ditemukan saat inventarisasi: `stock_transfers`

Tabel ini **tidak punya `branch_id`** — yang ada `from_branch_id` dan `to_branch_id`:

```sql
from_branch_id uuid not null references public.branches(id),
to_branch_id   uuid not null references public.branches(id),
```

Tanpa batasan eksplisit, **tidak ada yang mencegah transfer stok dari cabang UMKM A ke cabang
UMKM B**. Stok berpindah lintas tenant dan `stock_movements` di kedua sisi ikut tercatat. Ini
kebocoran **tulis**, bukan sekadar baca — lebih berat daripada kebocoran baca biasa.

Belum pernah disebut di PRD maupun Handoff. Wajib:
```sql
-- kedua cabang HARUS berada di workspace yang sama
alter table public.stock_transfers add constraint chk_transfer_same_workspace check (
  (select workspace_id from public.branches where id = from_branch_id)
  = (select workspace_id from public.branches where id = to_branch_id)
);
-- CHECK tidak boleh berisi subquery di Postgres -> implementasikan sebagai
-- BEFORE INSERT/UPDATE TRIGGER yang raise exception, ATAU validasi di dalam
-- RPC create_transfer(). Pilih trigger agar tidak bisa dilewati lewat jalur lain.
```

### Konsekuensi yang harus dieksekusi
- [ ] 12 `alter table ... add column workspace_id` + FK ke `platform.workspaces`
- [ ] 12 index komposit **diawali `workspace_id`** (syarat PRD §4A.2), mis.
      `(workspace_id, branch_id, created_at desc)` pada `transactions`
- [ ] Index pendukung jalur join: `branches(id, workspace_id)`
- [ ] Backfill 12 tabel → workspace hasil migrasi
- [ ] Trigger/RPC mengisi `workspace_id` otomatis untuk baris baru — **jangan** input manual
- [ ] Trigger penjaga `stock_transfers` (kedua cabang satu workspace)
- [ ] `NOT NULL` ditunda: pasang kolom nullable dulu, backfill, verifikasi, baru `set not null`
- [ ] Verifikasi ulang seluruh daftar terhadap `current_schema.sql`

---

## KEP-006 — Tabel add-on & sumber limit efektif

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Terkait:** Handoff §8.3/§8.5, PRD §6
**Menambah tabel yang belum ada di PRD §6.**

### Keputusan
Tambah `platform.subscription_addons` sebagai **sumber kebenaran add-on**.
`platform.entitlements.limits` menyimpan **hasil akhir** (base plan + add-on), dan
**satu-satunya** jalur tulisnya adalah RPC `recalc_entitlement(ws, product)`.

```sql
platform.subscription_addons
  id uuid pk
  subscription_id uuid fk -> platform.subscriptions
  workspace_id    uuid fk -> platform.workspaces
  addon_type      enum('branch','seat','storage')
  qty             int not null
  unit_price      numeric not null
  billing_period  enum('monthly','annual')
  status          enum('active','cancelled')
  valid_until     timestamptz
  created_at, updated_at
```

```
recalc_entitlement(ws, product):
  limits := plans.limits
          + SUM(subscription_addons WHERE workspace_id=ws AND status='active')
```

Dipanggil saat: order `paid` (plan atau add-on baru) · add-on dibatalkan · upgrade/downgrade
plan · refund/expired.

### Masalah yang diselesaikan
Handoff §8.3 menjual 3 SKU add-on dan §8.5 menyatakan add-on menaikkan angka di
`entitlements.limits` — tapi PRD §6 tidak punya tempat menyimpannya. Bila add-on hanya ditulis
langsung ke `limits`, maka begitu pelanggan upgrade/downgrade, `limits` ditimpa dari
`plans.limits` dan **semua add-on yang sudah dibayar hilang tanpa jejak**. Pelanggan membayar
Rp900.000 untuk 60 seat, lalu naik paket, dan seat-nya lenyap.

Dengan `subscription_addons` sebagai sumber kebenaran, upgrade plan justru **memicu perhitungan
ulang** yang otomatis mengembalikan add-on.

### Satuan storage — DIKUNCI
§8.3 menjual "+5 GB" sedangkan `limits` memakai `storage_mb`. **1 GB = 1.000 MB** (bukan 1.024),
supaya angka tagihan bulat dan mudah dijelaskan. Satu add-on storage = `storage_mb += 5000`.

### Alternatif yang ditolak
- **`limits` = base saja, efektif dihitung on-the-fly** — mustahil basi, tapi menyimpang dari
  §8.5, membuat setiap cek limit jadi JOIN+agregasi, dan yang terburuk: aplikasi tidak boleh
  lagi membaca `entitlements.limits` langsung — padahal itu hal paling alami untuk dilakukan,
  sehingga angka yang terbaca akan diam-diam salah.
- **Tunda add-on ke pasca-MVP** — §8.3 sudah menetapkan harga add-on sebagai final, dan jawaban
  §8.1 atas kekhawatiran "1 UMKM 100 user" bergantung sepenuhnya pada add-on seat. Tanpa add-on,
  pelanggan yang mentok hanya bisa lompat tier penuh (Rp99rb → Rp299rb).

### Konsekuensi yang harus dieksekusi
- [ ] Tambah `platform.subscription_addons` ke migrasi Fase 1
- [ ] RPC `recalc_entitlement(ws, product)` — **satu-satunya** jalur tulis `entitlements.limits`
- [ ] ⚠️ **Disiplin keras:** jangan pernah `UPDATE entitlements.limits` langsung dari kode
      aplikasi mana pun. Pertimbangkan trigger penjaga yang menolak UPDATE di luar RPC
- [ ] Add-on dijual sebagai `order_items` tersendiri (`item_type` perlu nilai baru: `addon`)
- [ ] Admin back-office (Fase 5) perlu melihat rincian base vs add-on, bukan cuma total
- [ ] Uji: beli add-on → upgrade plan → pastikan add-on **tidak hilang**

---

## KEP-007 — Metering `monthly_tx_cap` & `storage_mb`

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Terkait:** Handoff §8.2/§8.4/§8.5, PRD §6

### 🔴 Lubang keamanan yang ditemukan saat menelusuri storage

Path upload hari ini **tidak punya penanda tenant sama sekali**:

| Berkas | Path |
|---|---|
| [`product-image-uploader.tsx:43`](../components/domain/product-image-uploader.tsx) | `products/<uuid>.jpg` |
| [`store-image-uploader.tsx:38`](../components/domain/store-image-uploader.tsx) | `store/logo-<uuid>.jpg` |
| [`qris-uploader.tsx:35`](../components/domain/qris-uploader.tsx) | `store/qris-<uuid>.jpg` |

Dan policy hanya mengecek bucket + peran, **tanpa batasan path**
([0004_storage.sql](../supabase/migrations/0004_storage.sql)):
```sql
create policy "storage_admin_write" on storage.objects for all to authenticated
  using (bucket_id in ('qris','store-logos') and public.is_admin())
```

`for all` mencakup UPDATE dan DELETE, dan `is_admin()` masih global. Maka begitu ada workspace
kedua: **admin UMKM A bisa menimpa gambar QRIS milik UMKM B.** Bucket baca-publik dan gambar itu
tampil di struk — sehingga **pelanggan UMKM B akan mentransfer ke rekening UMKM A**. Kasir mana
pun dengan izin `product.upload_image` juga bisa menghapus seluruh foto produk semua UMKM.

Belum pernah disebut di PRD maupun Handoff.

### Keputusan L2a — prefiks path `workspace_id`
```
<workspace_id>/products/<uuid>.jpg
<workspace_id>/store/qris-<uuid>.jpg
<workspace_id>/store/logo-<uuid>.jpg
```
```sql
-- policy tulis: folder pertama HARUS workspace milik user
(storage.foldername(name))[1]::uuid = any(user_workspace_ids())
```
Satu perubahan menyelesaikan dua hal: menutup lubang timpa-menimpa **dan** membuat `storage_mb`
bisa diatribusikan (`sum(metadata->>'size') group by folder[1]`).

Objek lama (tanpa prefiks) **tidak dipindahkan** — diklaim milik workspace hasil migrasi lewat
policy pengecualian. Memindahkan berkas akan mematikan URL lama yang sudah tercetak di struk.

### Keputusan L2b — periode reset = anniversary langganan
Periode mengikuti `subscriptions.current_period_start/end` yang **sudah ada** di PRD §6. Timezone
tampilan **Asia/Jakarta**. Ditolak: kalender bulanan — pelanggan yang berlangganan tanggal 30
akan mendapat 2× cap dalam 2 hari, dan kuota tidak sejalan dengan yang dibayar.

### Keputusan — `create_sale` TIDAK disentuh
Perhitungan transaksi memakai **agregasi berkala** (Edge Function terjadwal) yang menulis ke
`platform.usage_counters`, bukan increment di dalam `create_sale`. Alasan: `create_sale` sudah
ditulis ulang 6× dan merupakan fungsi paling kritikal; menambah counter di sana persis jenis
perubahan yang dilarang Aturan Emas. Karena §8.5 menyatakan ini **soft cap** yang dilarang
menghentikan transaksi, akurasi real-time memang tidak diperlukan.

```sql
platform.usage_counters
  id, workspace_id FK, product_id FK
  metric enum('tx_count','storage_mb')
  period_start, period_end        -- dari subscriptions
  value numeric, computed_at
  UNIQUE(workspace_id, product_id, metric, period_start)
```

### Konsekuensi yang harus dieksekusi
- [ ] Patch 3 komponen uploader → prefiks `workspace_id` (baris path saja)
- [ ] Policy Storage baru per folder + policy pengecualian objek lama
- [ ] Tambah `platform.usage_counters`
- [ ] Edge Function terjadwal: hitung `tx_count` & `storage_mb` per workspace per periode
- [ ] Alert 80% & 100% (§8.5) — kanal menyusul keputusan PART D #5
- [ ] ⚠️ **Jangan pernah** memblokir transaksi karena `monthly_tx_cap` — soft cap, §8.5 eksplisit
- [ ] Regresi: upload foto produk, logo, QRIS masih berfungsi; URL lama masih hidup

---

## KEP-008 — Peta status langganan & perilaku saat kedaluwarsa

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Terkait:** PRD §4C.4, §5.13, §6, Handoff §6/§8.2
**Memperjelas §4C.4** yang sebelumnya hanya menulis "read-only/terkunci" tanpa definisi.

### Keputusan
**Bisnis pelanggan tidak pernah berhenti.** Grace 7 hari dengan fungsi penuh, lalu workspace
**turun ke limit tier Gratis** — bukan terkunci.

| Hari | `subscriptions.status` | `entitlements` | Perilaku POS |
|---|---|---|---|
| 0 | `past_due` | `active`, limits plan | Jalan penuh + banner + pengingat |
| 1–7 | `past_due` | `active`, limits plan | **Grace.** Jalan penuh, pengingat menguat |
| 8+ | `expired` | `active`, **limits tier Gratis** | Kasir jalan (maks 300 tx/bln), cabang ke-2..N read-only, user ke-3..N tidak bisa login, fitur Pro terkunci |

Peta lengkap `subscriptions.status` → `entitlements.status`:

| `subscriptions.status` | `entitlements.status` | `entitlements.limits` |
|---|---|---|
| `trialing` | `active` | limits plan |
| `active` | `active` | limits plan + add-on |
| `past_due` | `active` | limits plan + add-on (selama grace) |
| `expired` | `active` | **limits tier Gratis** |
| `cancelled` | `active` | **limits tier Gratis** |
| `suspended` | `suspended` | — (penangguhan manual staff, mis. penyalahgunaan) |

Catatan: `entitlements.status = 'inactive'` hanya dipakai untuk produk yang memang tidak pernah
dibeli. Kedaluwarsa **tidak** menghasilkan `inactive`.

### Kenapa bukan read-only penuh
Memblokir checkout berarti **antrean kasir pelanggan mandek di jam sibuk**. Untuk UMKM
warung/kuliner itu fatal, dan menjadi insiden dukungan sekaligus risiko reputasi terbesar yang
mungkin terjadi — "aplikasi kasir mematikan usaha saya karena telat bayar sehari". Turun ke tier
Gratis mempertahankan kelangsungan usaha sambil tetap memberi dorongan bayar yang kuat: bisnis
nyata pasti melampaui 300 transaksi/bulan dan 1 cabang, sementara mikro-UMKM mendarat lembut di
tier yang memang dirancang untuk mereka (§8.1 "funnel gratis → berbayar").

### Aturan pemilihan cabang & seat saat limit menyusut
Berlaku untuk **dua** kejadian: kedaluwarsa otomatis, dan downgrade sukarela (mis. Pro → Basic).

- **Cabang:** yang **tertua** (`created_at` paling awal) tetap aktif; sisanya **read-only** —
  data utuh, tidak dihapus, tidak bisa transaksi. Owner boleh menukar pilihan lewat portal.
- **Seat:** owner + anggota terlama tetap aktif; sisanya tidak bisa login ke POS. Baris
  `branch_memberships` **tidak dihapus** — hanya digerbangi, sehingga pulih utuh saat bayar.
- Prinsip §4C.4 dipegang: *"data tidak hilang, fungsi tidak dihapus — hanya digerbangi."*

### Alternatif yang ditolak
- **Read-only penuh setelah grace** — persis bunyi harfiah §4C.4 dan paling tegas menagih,
  tapi menghentikan operasi toko pelanggan.
- **Bertingkat: admin terkunci 30 hari, kasir tetap jalan** — paling aman bagi pelanggan, tapi
  memberi 37 hari pemakaian gratis tanpa batas transaksi (bisa diakali: bayar 1 bulan, pakai 2),
  dan tiga keadaan berbeda berarti tiga jalur uji regresi.

### Konsekuensi yang harus dieksekusi
- [ ] Job harian: `past_due` → `expired` setelah 7 hari; picu `recalc_entitlement()` ke limits Gratis
- [ ] Fungsi pemilihan cabang/seat aktif saat limit menyusut (dipakai ulang untuk downgrade)
- [ ] UI: banner status di POS + halaman perpanjangan; cabang read-only harus jelas terlihat
- [ ] **T&C wajib menyebut "downgrade otomatis ke tier Gratis"** — jangan sampai mengejutkan
- [ ] Uji regresi §6: `expired → read-only` pada checklist Handoff **diperbarui** menjadi
      "expired → turun ke limit Gratis"
- [ ] Uji: bayar kembali setelah expired → seluruh cabang & seat pulih utuh

---

## KEP-009 — UUID cabang pusat yang tertanam hardcode

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Ditemukan dari:** dump produksi
**Tidak ada di PRD maupun Handoff.** Hanya terlihat setelah membaca definisi asli dari database.

### Keputusan
Bereskan **ketiga lapisan**. Tambah penanda cabang pusat per workspace, hapus semua DEFAULT
yang menunjuk ke satu UUID global, dan ubah `v_main` menjadi resolusi per-workspace.

### Masalah yang diselesaikan
UUID `00000000-0000-0000-0000-0000000000c1` tertanam di tiga tempat sekaligus:

**Lapisan 1 — DEFAULT kolom di 7 tabel** (paling berbahaya karena senyap):

| Tabel | Kolom |
|---|---|
| `transactions`, `payments`, `cash_sessions`, `stock_movements`, `stock_opnames`, `cash_expenses`, `bank_accounts` | `branch_id NOT NULL DEFAULT '…c1'` |

Setiap `INSERT` yang lupa menyertakan `branch_id` **mendarat diam-diam di cabang pusat workspace
pertama**. `NOT NULL` + `DEFAULT` berarti tidak ada error yang muncul.

**Lapisan 2 — DEFAULT parameter RPC:**
```sql
adjust_stock(..., p_branch_id uuid DEFAULT '…c1')
restock_product(..., p_branch_id uuid DEFAULT '…c1')
```
Keduanya `SECURITY DEFINER` → **menembus RLS**. Dipanggil dari workspace B tanpa `p_branch_id`,
mereka menulis ke cabang milik workspace A tanpa ditolak siapa pun.

**Lapisan 3 — `v_main` di 13 fungsi:** `adjust_stock`, `approve_wastage`, `complete_opname`,
`create_sale`, `dispatch_transfer`, `receive_goods`, `receive_transfer`, `record_wastage`,
`refund_sale`, `restock_product`, `set_branch_price_stock`, `sync_branch_products_insert`,
`void_sale`. Polanya:
```sql
if v_branch = v_main then update public.products set stock = v_after ...
```
Artinya "hanya cabang pusat yang menyalin stok ke kolom legacy `products.stock`". Di
multi-tenant tiap workspace butuh cabang pusatnya sendiri — dan `branches` **tidak punya kolom
penanda** (hanya `code, name, address, phone, timezone, is_active`).

### Perubahan
```sql
-- penanda cabang pusat per workspace
alter table public.branches add column is_main boolean not null default false;
create unique index on public.branches(workspace_id) where is_main;
-- backfill: cabang '…c1' -> is_main = true

-- Lapisan 1: lupa isi branch_id jadi ERROR, bukan salah alamat senyap
alter table public.transactions alter column branch_id drop default;  -- dst, 7 tabel

-- Lapisan 2: pemanggil WAJIB kirim branch_id eksplisit
adjust_stock(..., p_branch_id uuid)   -- tanpa DEFAULT

-- Lapisan 3: resolusi dinamis
select id into v_main from public.branches
 where workspace_id = v_ws and is_main;
```

### Alternatif yang ditolak
- **Lapisan 2 & 3 saja** — permukaan lebih kecil, tapi jalur `INSERT` langsung yang lupa
  `branch_id` tetap mendarat senyap di workspace pertama. Bom waktu: aman selama masih satu
  workspace, meledak saat pelanggan kedua onboard.
- **Tunda, andalkan validasi aplikasi** — bertentangan langsung dengan prinsip `CLAUDE.md`
  *"RLS-FIRST: keamanan ditegakkan di database, bukan hanya di UI"*, dan tidak memberi jaring
  pengaman apa pun terhadap `SECURITY DEFINER` yang menembus RLS.

### Konsekuensi yang harus dieksekusi
### ✅ Hasil audit jalur INSERT (2026-08-06) — SUDAH DIKERJAKAN

Hanya ada **4 jalur tulis langsung** ke 7 tabel itu dari kode aplikasi; sisanya lewat RPC.

| Jalur | Tabel | `branch_id` |
|---|---|---|
| [`inventory/actions.ts:107`](../app/(dashboard)/inventory/actions.ts) | `stock_opnames` | ✅ eksplisit |
| [`settings/actions.ts:186`](../app/(dashboard)/settings/actions.ts) | `bank_accounts` | ✅ eksplisit |
| [`shifts/actions.ts:37`](../app/(dashboard)/shifts/actions.ts) | `cash_sessions` | ✅ eksplisit |
| [`shifts/actions.ts:166`](../app/(dashboard)/shifts/actions.ts) | `cash_expenses` | ❌ **mengandalkan DEFAULT** |

**Temuan: `cash_expenses` tidak pernah mengisi `branch_id`,** dan tidak ada trigger yang
mengisinya. Jadi **setiap pengeluaran kas di produksi hari ini tercatat di cabang `…c1`**,
terlepas dari cabang tempat kasir sebenarnya bekerja.

**Dampaknya hari ini: laten, bukan bug yang terlihat.** Kolom `cash_expenses.branch_id` tidak
pernah dibaca oleh siapa pun — baik `getSessionExpenses()` maupun ketiga policy RLS-nya
mengambil jalur `cash_session_id → cash_sessions.branch_id`. Jadi angka yang tampil di UI
selama ini benar; hanya isi kolomnya yang salah.

**Dua konsekuensi untuk multi-tenant:**
1. RLS `cash_expenses` **wajib** lewat `cash_session_id`, **bukan** `branch_id`-nya sendiri
   (mengoreksi kelompok D di KEP-005). Kalau lewat `branch_id`, seluruh pengeluaran semua
   workspace akan terlihat sebagai milik workspace pertama.
2. Begitu DEFAULT dihapus, `shifts/actions.ts:166` akan **langsung gagal** (`NOT NULL` tanpa
   default). Call site itu **wajib** dipatch dalam perubahan yang sama.
- [ ] `branches.is_main` + unique index parsial per workspace
- [ ] Backfill `is_main = true` untuk cabang `…c1`
- [ ] Provisioning workspace baru (Fase 3) **wajib** membuat 1 cabang dengan `is_main = true`
- [ ] Tulis ulang 13 fungsi — termasuk `create_sale` untuk **ketujuh kalinya**
- [ ] Ganti 44 rujukan UUID hardcode di kode TS (`lib/branch.ts`, `lib/constants.ts`,
      `lib/validations/common.ts`)
- [ ] Regresi paling ketat ada di sini: checkout, void, refund, opname, transfer, wastage

---

## KEP-010 — Hasil rekonsiliasi PRD-POS-Multi-Cabang-v2 ↔ sistem aktual

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Terkait:** PRD v2 §16

### Konteks
PRD v2 diterima dan dibandingkan baris demi baris dengan dump produksi + kode. Ditemukan
**37 perbedaan**: 4 enum · 14 tabel/kolom · 4 perilaku · 11 fitur berjalan di luar PRD ·
4 rencana yang belum ada. Seluruhnya sudah ditulis ulang ke PRD dengan aturan **"sistem aktual
yang menang"** (aturan yang juga sudah tertulis di PRD itu sendiri, baris 11).

### Tiga keputusan

**1. Approval opname — belum sempat, bukan disengaja.**
Tetap jadi target, dikerjakan **setelah** migrasi multi-tenant. Alasan: menambahkannya di dalam
Fase 1B berarti menambah perilaku baru pada fase yang Aturan Emas-nya justru melarang itu.

**2. Verifikator rantai hash & log reprint struk — keduanya akan dikerjakan, setelah migrasi.**
Tidak masuk cakupan Fase 1B, dengan alasan yang sama. Verifikator hash punya keterkaitan dengan
KEP-004 (yang mengandalkan rantai tetap utuh), tapi menambahkannya bukan prasyarat migrasi —
justru sebaliknya, migrasi dirancang agar **tidak menyentuh** rantai sama sekali.

**3. Policy Storage dipindahkan ke helper berbasis cabang/workspace saat migrasi.**
KEP-007 sudah mewajibkan policy Storage disentuh (prefiks path `workspace_id`), jadi penggantian
`is_admin()` / `has_permission()` → `has_branch_permission()` + guard workspace dikerjakan
sekalian — sekali sentuh, dua masalah beres. Kolom `profiles.role` **tidak** dihapus.

### ⚠️ Konsekuensi terpenting: baseline uji regresi

**Baseline = perilaku SEKARANG, bukan yang tertulis di PRD.** Empat butir §16-D tidak boleh
diuji sebagai "harus tetap sama" karena memang belum pernah ada:

| ❌ Jangan diuji | ✅ Yang benar untuk diuji |
|---|---|
| Transaksi menolak `UPDATE`/`DELETE` | Void mengubah status **in-place** (`voided_by`, `voided_at`) |
| Void menghasilkan transaksi reversal baru | Stok kembali lewat `stock_movements` tipe `void` |
| `transactions.row_hash` terisi | `seq_no` tetap berurutan tanpa celah |
| Opname meminta approval | Opname langsung `draft → completed` |

Tanpa catatan ini, uji regresi akan menghasilkan kegagalan palsu dan waktu terbuang mengejar
bug yang tidak eksis.

### Antrean pasca-migrasi (jangan hilang)
- [ ] Approval opname — enum +`pending_approval`/`rejected`, `stock_opnames.approved_by`,
      pisah `request_opname` / `approve_opname`
- [ ] RPC `verify_hash_chain(table)` di modul Keamanan
- [ ] Log reprint struk (dibutuhkan §7.5 deteksi anomali)
- [ ] Immutability `transactions` + model reversal — **Fase 4 yang tertunda, paling besar**;
      menuntut `create_sale`/`void_sale`/`refund_sale` ditulis ulang
- [ ] Overlay PIN manajer (§6.11) — belum diputuskan
- [ ] Bersihkan `BANKS` di `lib/constants.ts` (kode mati sejak bank jadi dinamis)

---

## KEP-011 — Keputusan komersial & penempatan aplikasi (PART D)

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik · **Terkait:** PRD PART D

### 1. Gateway pembayaran → **Midtrans Snap**
Snap adalah hosted checkout drop-in yang persis berbentuk seperti yang diminta PRD §5.4; GoPay
native karena satu grup dengan GoTo; dan paling banyak contoh berbahasa Indonesia. Xendit ditolak
untuk MVP — keunggulannya (recurring/tokenisasi, jangkauan SEA) baru relevan di Fase 7.

⚠️ **Aksi paralel:** onboarding merchant Midtrans butuh dokumen usaha dan verifikasi yang memakan
waktu di luar kendali kita. **Mulai urus bersamaan dengan Fase 1B**, jangan menunggu Fase 3 —
kalau tidak, checkout selesai dikoding tapi tidak bisa diuji dengan akun sungguhan.

### 2. Trial → **tidak ada trial terpisah**
Tier **Gratis** (1 cabang, 2 user, 300 tx/bln) sudah berfungsi sebagai trial yang tidak pernah
kedaluwarsa. Menambah trial di atasnya menduplikasi fungsi yang sama sambil menyeret
`subscriptions.status='trialing'`, kartu di muka, pengingat akhir trial, dan dunning-trial ke
dalam MVP.

Alur: daftar → pakai Gratis → mentok limit → upgrade. Persis funnel yang ditulis Handoff §8.1.
Bonus: tidak ada "tebing" saat trial berakhir, dan hambatan pendaftaran paling rendah karena
tidak perlu kartu.

**Catatan implementasi:** nilai `trialing` **tetap dibuat** di enum `subscriptions.status` supaya
tidak perlu migrasi enum bila kelak diaktifkan — cukup jangan pernah diisi.

### 3. Kanal notifikasi → **email dulu**
Email transaksional via Resend: verifikasi akun, invoice, sukses bayar, onboarding, pengingat
perpanjangan, dan alert kuota 80%/100% (KEP-007).

**Temuan yang memengaruhi keputusan ini:** sistem **sudah punya** jalur WhatsApp semi-otomatis —
[`lib/alerts.ts`](../lib/alerts.ts) membuat tautan `wa.me` dengan nomor tujuan dari
`org_settings.alert_whatsapp`. Gratis, tanpa verifikasi Meta, sudah berjalan. Jadi WhatsApp tidak
benar-benar absen di MVP; yang ditunda hanyalah otomatisasi penuh.

WA Business API ditolak untuk MVP: verifikasi bisnis Meta memakan waktu berminggu-minggu, tiap
template pesan harus disetujui, ada biaya per percakapan, dan seluruh prosesnya **di luar kendali
kita** sehingga berisiko menghambat peluncuran. Tetap di Fase 7 sesuai rencana PRD semula.

### 4. Lokasi aplikasi platform → **repo terpisah**
Platform menjadi repo baru di `SaaS Website/`. Repo POS **tidak disentuh sama sekali**.

| Ditolak | Alasan |
|---|---|
| Monorepo (`apps/platform` + `apps/pos`) | Memindahkan repo **produksi** ke dalam monorepo tepat saat bersiap migrasi adalah risiko yang tidak perlu. Semua path, CI, `.githooks`, dan setelan Vercel POS harus dikonfigurasi ulang. Manfaatnya baru terasa saat ada tool kedua — masih jauh |
| Satu domain via Vercel rewrite | Menuntut perubahan `basePath` pada **aplikasi POS yang sedang berjalan**, dan membuat Opsi B (subdomain per tenant) lebih rumit nanti |

### 5. Routing & SSO → **subdomain + cookie di domain induk**

```
app.umkmunggul.com     -> platform  (SaaS Website/)
kasir.umkmunggul.com   -> POS       (Aplikasi POS/)
umkmunggul.com         -> marketing (Fase 6)
```

SSO bekerja lewat cookie Supabase yang di-set pada **domain induk**:
```ts
// @supabase/ssr — WAJIB SAMA di KEDUA aplikasi
cookieOptions: { domain: '.umkmunggul.com' }
```

⚠️ **Titik gagal paling halus di seluruh arsitektur ini.** Setelan itu harus benar di **dua**
tempat. Bila salah satu lupa, SSO tidak error — ia hanya diam-diam tidak bekerja, dan pengguna
diminta login dua kali tanpa penjelasan. Masukkan ke checklist uji regresi:
**"login di `app.` → buka `kasir.` → harus sudah masuk tanpa login ulang."**

### Konsekuensi yang harus dieksekusi
- [ ] Mulai onboarding merchant Midtrans **sekarang**, paralel dengan Fase 1B
- [ ] Seed `plans`: 9 baris dari Handoff §8.2/§8.4, **tanpa** kolom/alur trial
- [ ] Enum `subscriptions.status` tetap memuat `trialing` (dibuat, tidak dipakai)
- [ ] Siapkan akun Resend + template email transaksional
- [ ] Alert kuota (KEP-007) memakai email + tautan wa.me yang sudah ada
- [ ] Inisialisasi repo baru di `SaaS Website/` (Fase 0)
- [ ] DNS: `app` + `kasir` (+ wildcard `*` disiapkan untuk Opsi B)
- [ ] `cookieOptions.domain = '.umkmunggul.com'` di **kedua** aplikasi
- [ ] Uji SSO lintas subdomain masuk checklist regresi

---

## KEP-012 — Reset data produksi ke nol

**Tanggal:** 2026-08-06 · **Status:** ✅ Disetujui pemilik
**Dasar:** pemilik mengonfirmasi **tidak ada usaha nyata** yang memakai database ini; seluruh
isinya data uji coba.

### Keputusan
Kosongkan seluruh data operasional di PROD memakai
[`supabase/reset-dev-data.sql`](../supabase/reset-dev-data.sql) — berkas yang diminta
PRD v2 §15 tapi belum pernah dibuat. Lalu bangun multi-tenant dari nol.

### Tiga hal yang WAJIB selamat
Kalau salah satu hilang, sistem rusak — semuanya konsekuensi langsung dari KEP-009:

| Yang dipertahankan | Kalau hilang |
|---|---|
| `branches` id `…c1` | 7 kolom ber-`DEFAULT` + FK ke sini → **setiap INSERT gagal**; 13 RPC memakai `v_main`; `MAIN_BRANCH_ID` di `lib/constants.ts` |
| **Tepat satu** `auth.users` + `profiles` `is_master_admin` | **Tidak ada yang bisa login**; pemulihan hanya lewat SQL manual |
| 1 baris `store_settings` + `org_settings` | Dibaca `.limit(1).maybeSingle()` di 17 titik → `null` → layout, kasir, struk, invoice berpotensi rusak |

### Penghapusan akun (Bagian 2e) — bagian paling berbahaya
Atas permintaan pemilik, **seluruh akun dihapus kecuali satu master admin**.

Peta FK sudah diverifikasi dari `docs/schema-dump/03-constraints.csv`:

| Pola | FK |
|---|---|
| **Tanpa `ON DELETE`** (menghalangi) | `transactions.cashier_id`, `transactions.voided_by`, `cash_sessions.cashier_id`, `cash_expenses.created_by` |
| `ON DELETE CASCADE` | `profiles.id → auth.users`, `branch_memberships.user_id`, `notifications.user_id` |
| `ON DELETE SET NULL` | 13 FK lainnya (`audit_logs.actor_id`, `approvals.*`, `stock_*.created_by`, dll.) |

Keempat FK tanpa `ON DELETE` menunjuk ke tabel yang **sudah dikosongkan di Bagian 1**, sehingga
penghapusan akun tidak tertahan. **Kalau Bagian 1 dilewati, Bagian 2e akan gagal** — dan itu
memang disengaja sebagai pengaman urutan.

Dua pengaman di dalam blok `DO`:
1. Dibatalkan bila akun yang akan disimpan **tidak ditemukan**
2. Dibatalkan bila akun terpilih **bukan master admin aktif** — mencegah skenario "akun tersisa
   ternyata kasir, dan tidak ada yang bisa mengelola sistem"

Akun yang disimpan dipilih lewat `v_keep_email`; bila dibiarkan `NULL`, otomatis memilih master
admin aktif **tertua**. Bagian 0 menampilkan tabel bertanda `>>> DISIMPAN <<<` / `dihapus`
supaya bisa diperiksa **sebelum** apa pun terhapus.

### Kendala teknis yang ditangani skrip
`guard_append_only()` menolak `DELETE` **tanpa syarat, untuk semua peran** — sehingga
`stock_movements` dan `audit_logs` mustahil dikosongkan tanpa melepas triggernya lebih dulu.
Skrip melepas keduanya, menghapus, lalu **memasang ulang dengan definisi yang disalin persis**
dari dump produksi. Verifikasi di Bagian 3 memastikan keduanya kembali terpasang — kalau tidak,
ledger diam-diam kehilangan sifat append-only-nya.

### Dampak terhadap cakupan migrasi

**Berkurang:**

| Pekerjaan | Status baru |
|---|---|
| PRD §4C.6 langkah 3–5 (migrasi data lama) | ❌ tidak perlu — tidak ada data |
| Backfill `workspace_id` di 12 tabel (KEP-005) | ❌ tidak perlu — kolom bisa langsung `NOT NULL` |
| Backfill `cash_expenses.branch_id` (KEP-009) | ❌ tidak perlu — tidak ada baris salah alamat |
| Blok C "berapa UMKM di prod" | ✅ terjawab: **nol** |
| Blok A "volume tabel" | ✅ tidak relevan lagi — semuanya jadi nol |
| Jendela pemeliharaan untuk backfill | ❌ tidak perlu |

**TIDAK berkurang sedikit pun:**
- Seluruh perubahan skema, RLS, dan RPC
- Penghapusan hardcode `…c1` di 3 lapisan (KEP-009) — **justru lebih mudah** karena
  `drop default` tidak lagi berisiko terhadap data lama
- Patch 2 titik service-role (KEP-003), prefiks path Storage (KEP-007)
- Blok B "siapa owner workspace" — **tetap perlu**; dari nol pun harus ada satu Master Admin

### Dampak terhadap kebutuhan STAGING
Dengan PROD kosong, **PROD boleh dipakai sebagai lingkungan kerja** untuk membangun dan menguji
multi-tenant. Ini mengendurkan Handoff §5 poin 2 untuk sementara.

⚠️ **Kelonggaran ini berakhir saat pelanggan pertama mendaftar.** Sejak saat itu staging kembali
wajib, dan setiap migrasi harus lolos di staging sebelum menyentuh PROD. Jangan sampai kebiasaan
"langsung ke prod" terbawa setelah ada data nyata.

### Konsekuensi yang harus dieksekusi
- [ ] **Backup dulu** (Dashboard → Database → Backups) — bukan karena datanya berharga, tapi
      karena skrip reset yang salah tulis bisa merusak **skema**, bukan cuma data
- [ ] Jalankan Bagian 0 (pra-terbang) dan baca hasilnya
- [ ] Uji kering: Bagian 1–2 dengan `ROLLBACK;`
- [ ] Jalankan sungguhan dengan `COMMIT;`
- [ ] Jalankan Bagian 3 — **pastikan 2 trigger append-only kembali terpasang**
- [ ] Bagian 3 juga harus menunjukkan **tepat 1 akun tersisa**, master admin, aktif
- [ ] Setelah reset: **coba login** sebelum melanjutkan apa pun
- [ ] Bersihkan foto produk yatim di Storage (manual, atau biarkan sampai KEP-007)
- [ ] Perbarui `supabase/seed.sql` bila ingin data awal berbeda

### Efek samping yang menguntungkan
Dengan tersisa **satu akun master admin**, pertanyaan Handoff §7.2 ("siapa owner workspace
existing") **terjawab dengan sendirinya** — akun itulah owner-nya. Blok B di
`kuesioner-keputusan.sql` tidak diperlukan lagi.

---

## KEP-013 — Kebocoran yang ditemukan saat implementasi Fase 1B

**Tanggal:** 2026-08-06 · **Status:** ✅ Ditutup di migrasi 0030–0031
**Tidak ada di PRD, Handoff, maupun rencana awal.** Muncul hanya setelah membaca definisi
fungsi yang sebenarnya berjalan di produksi.

### Akar masalah bersama
`SECURITY DEFINER` **menembus RLS**. Guard workspace di lapisan policy (0031 §3) tidak berlaku
di dalam fungsi semacam itu — filternya harus eksplisit di dalam badan fungsi.

### 1. `has_branch_role()` / `has_branch_permission()` — jalan pintas terbesar
Keduanya diawali `is_master_admin() or …`. Karena fungsi itu **global**, ia memotong seluruh
pemeriksaan cabang di **setiap RPC**. Master Admin workspace A lolos untuk cabang mana pun,
termasuk milik workspace B — dan seluruh RPC (checkout, stok, transfer, wastage) memakainya.

**Perbaikan (0031 §1):** `is_master_admin()` kini harus disertai bukti bahwa cabang yang diminta
berada di workspace pemanggil. Satu perbaikan di dua helper menutup semua RPC sekaligus — jauh
lebih aman daripada menambal 13 fungsi satu per satu.

### 2. `dashboard_kpis()` & `dashboard_analytics()` — omzet lintas tenant
Keduanya `SECURITY DEFINER` dengan penjaga `is_admin()` saja. Saat `p_branch_id` NULL — kondisi
normal untuk dashboard konsolidasi — keduanya **menjumlahkan seluruh transaksi lintas workspace**.
Admin UMKM A melihat omzet seluruh pelanggan platform.

**Perbaikan (0031 §2):** 17 filter cabang ditambahi guard workspace.

### 3. `branch_seq_gaps()` — audit nomor urut lintas tenant
Mengagregasi celah nomor urut seluruh cabang tanpa filter workspace. Modul Keamanan workspace A
menampilkan data workspace B. **Perbaikan (0031 §2):** filter workspace pada join `branches`.

### 4. `sync_branch_products_insert()` — katalog bocor lintas tenant
`insert … select b.id … from public.branches b` **tanpa filter apa pun**: produk baru workspace A
otomatis dibuatkan baris `branch_products` di **seluruh cabang workspace B**.
**Perbaikan (0030):** `where b.workspace_id = new.workspace_id`.

### 5. `lib/alerts.ts` — peringatan anti-fraud salah alamat
Memakai service-role (menembus RLS) dan mengambil **seluruh** master admin secara global.
Peringatan anti-fraud UMKM A terkirim ke pemilik UMKM B **beserta isinya**.
**Perbaikan:** penerima dibatasi anggota workspace cabang pemicu; `org_settings` juga difilter.

### 6. Bug pelaporan yang sudah berjalan — ikut diperbaiki
`dashboard_analytics.expenses_total` memfilter `cash_expenses.branch_id`, padahal kolom itu
**tidak pernah diisi** kode (selalu `…c1`, lihat KEP-009). Akibatnya **manajer cabang selain
pusat melihat `expenses_total = 0`** padahal ada pengeluaran.

> Ini mengoreksi kesimpulan audit KEP-009 yang menyebut cacat `cash_expenses.branch_id` sebagai
> "laten, tidak terlihat pengguna". Ternyata terlihat — di dashboard.

**Perbaikan (0031 §2):** di-join lewat `cash_sessions`, sekaligus menutup kebocoran dan
membetulkan angkanya.

---
---

# ⛔ AKSI PEMILIK — eksekusi terhalang di sini

Seluruh keputusan desain (KEP-001 s/d KEP-012) sudah terkunci. **Tidak ada satu baris SQL pun
yang boleh ditulis** sebelum hal-hal berikut tersedia.

## 1. ~~Ground truth database~~ ✅ SELESAI (2026-08-06)

Diterima di `docs/schema-dump/` (10 CSV). Terverifikasi: **nol drift**. Ringkasannya ada di
bagian "Hasil verifikasi ground truth" di atas.

**Sisa satu query** — volume tabel, untuk memverifikasi kelompok C di KEP-005:
```sql
select relname as tabel, n_live_tup as perkiraan_baris,
       pg_size_pretty(pg_total_relation_size(relid)) as ukuran
from pg_stat_user_tables order by n_live_tup desc;
```

## 2. ~~`PRD-POS-Multi-Cabang-v2.md`~~ ✅ SELESAI (2026-08-06)

Diterima dan **direkonsiliasi penuh** dengan sistem aktual. Ditemukan **31 perbedaan**; seluruhnya
sudah ditulis ulang ke dalam dokumen itu dengan aturan "sistem aktual yang menang". Ringkasan
lengkap ada di **§16** PRD tersebut.

**Tiga keputusan pemilik atas hasil rekonsiliasi — lihat KEP-010.**

**Empat klaim keamanan di PRD yang ternyata belum terpasang** (§16-D) — penting untuk checklist
regresi Handoff §6, karena tidak boleh diuji sebagai "harus tetap sama" padahal memang belum ada:
`transactions` belum append-only · void masih in-place (bukan reversal) · hash chain transaksi
tidak pernah diisi · opname tanpa approval.

## 3. PROD vs STAGING — ⚠️ TERJAWAB, dan ini blocker eksekusi utama

✅ **Dikonfirmasi pemilik (2026-08-06): `qeoeqspinyydcmoysbrb` adalah PRODUKSI.**

Ini mengoreksi [`CLAUDE.md:42`](../CLAUDE.md) yang menyatakan migrasi diterapkan ke "instance
STAGING" — pernyataan itu **tidak lagi benar** dan harus diperbaiki.

**Dump yang sudah diambil aman:** seluruh query Blok 1–9 murni `SELECT`, tidak ada yang menulis.

🔴 **Belum ada proyek staging sama sekali.** Handoff §5 poin 2 mewajibkannya sebelum apa pun.
Ini sekarang menjadi **penghalang eksekusi nomor satu** — bukan lagi keputusan desain.

## 4. ~~Keputusan yang masih kosong~~ ✅ SELESAI (2026-08-06)

| Sumber | Keputusan |
|---|---|
| PART D #1 | ✅ Midtrans Snap (KEP-011) |
| PART D #4 | ✅ Tanpa trial — tier Gratis sudah jadi trial (KEP-011) |
| PART D #5 | ✅ Email dulu + tautan wa.me yang sudah ada (KEP-011) |
| Lokasi app platform | ✅ Repo terpisah di `SaaS Website/` (KEP-011) |
| Cookie SSO | ✅ Subdomain + `domain: '.umkmunggul.com'` di kedua app (KEP-011) |

**Dua sisanya** — dipengaruhi oleh KEP-012 (reset data ke nol):

| Sumber | Pertanyaan | Status |
|---|---|---|
| PRD §4C.6 langkah 3 | Berapa UMKM di prod? | ✅ **Terjawab: NOL.** Data direset (KEP-012) |
| Handoff §7.2 | Owner workspace — akun mana? | ✅ **Terjawab dengan sendirinya.** Reset menyisakan **tepat satu** akun master admin — itulah owner-nya |

> ⚠️ **Seluruh `kuesioner-keputusan.sql` sudah tidak relevan.** Blok A–E gugur karena data
> direset ke nol; Blok B gugur karena hanya tersisa satu akun. Yang tersisa hanya
> **Blok F — cek PITR**, dan itu dilakukan manual di Dashboard, bukan lewat SQL.

## 5. Prasyarat wajib sebelum menyentuh apa pun (Handoff §5)

| # | Prasyarat | Status |
|---|---|---|
| 1 | **Backup sebelum reset** | 🔴 **lakukan SEKARANG** — Dashboard → Database → Backups |
| 2 | Jalankan `supabase/reset-dev-data.sql` (KEP-012) | ⬜ Bagian 0 → uji kering → COMMIT → verifikasi |
| 3 | **Coba login** setelah reset, sebelum melanjutkan | ⬜ pembuktian akhir bahwa sistem masih hidup |
| 4 | Branch git `feat/multi-tenant` | ⬜ masih di `main` |
| 5 | **PITR aktif di PROD** | ⬜ cek Dashboard → Settings → Add-ons |
| 6 | Onboarding merchant Midtrans | ⬜ mulai paralel, jangan tunggu Fase 3 |
| 7 | ~~Proyek staging~~ | ⏸️ **ditangguhkan** oleh KEP-012 — PROD kosong boleh jadi lingkungan kerja. **Wajib kembali begitu pelanggan pertama mendaftar** |
