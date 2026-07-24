# Rencana Teknis — Fase 0: Migrasi Skema & RLS Multi-Cabang

> Status: **SUDAH DITERAPKAN** via `supabase/migrations/0015_multibranch_foundation.sql`
> (additive, non-breaking; app v1 tetap jalan). Enforcement immutability pada
> `transactions` + RLS branch-scoped tabel operasional lama sengaja DITUNDA
> (lihat §8 & catatan di CLAUDE.md) agar tidak mematahkan RPC/void/refund v1.
> Basis: PRD v2.0 (`PRD-POS-Multi-Cabang-v2.md`) §5, §8, §9, §13.

---

## 0. Tujuan & batasan Fase 0

**Tujuan:** menyiapkan fondasi data multi-cabang yang aman: tabel + `branch_id`,
katalog global vs stok per cabang, immutability (append-only + hash chain +
seq_no), RLS branch-scoped, dan migrasi data lama ke "Cabang Utama".

**Cakupan Fase 0 = DATABASE saja** (skema, helper, RLS, trigger, migrasi data).
Penyesuaian kode aplikasi (auth, pemilih cabang, halaman) = Fase 1+.

**Kondisi awal (menguntungkan):** data transaksional sudah kosong. Yang perlu
dimigrasikan hanya: 7 produk, 2 profil, `store_settings` (1), `categories` (3),
`bank_accounts` (3). Jadi risiko migrasi data rendah.

**Strategi terhadap app live (pilihan Anda: "DB sama, boleh down sebentar"):**
migrasi **additive + kompatibel** — kolom/tabel lama TIDAK langsung dihapus,
melainkan dibiarkan hidup berdampingan (mis. lewat *compatibility view*) sehingga
app v1 tetap bisa boot setelah Fase 0. Pembersihan kolom lama (`DROP`) ditunda ke
fase akhir setelah semua kode pindah. Ini menghindari app mati berminggu-minggu.
Boleh ada jeda singkat saat menerapkan migrasi.

---

## 1. Urutan file migrasi

| File | Isi |
|---|---|
| `0015_branches_core.sql` | enum baru, `branches`, `branch_memberships`, `org_settings`, `branch_settings`; helper RLS |
| `0016_catalog_branch_products.sql` | `products`: tambah `base_cost_price`; `branch_products`; migrasi harga/stok |
| `0017_branch_id_operational.sql` | tambah `branch_id` ke `transactions`, `payments`, `cash_sessions`, `stock_movements`, `audit_logs`, `stock_opnames` dll + backfill |
| `0018_new_operational_tables.sql` | `cash_movements`, `stock_transfers(+items)`, `suppliers`, `goods_receipts(+items)`, `wastages(+items)`, `approvals`, `daily_closures` |
| `0019_immutability.sql` | kolom `seq_no`, `prev_hash`, `row_hash`, `reversal_of`; trigger hash chain, seq_no, append-only guard |
| `0020_rls_policies.sql` | seluruh policy branch-scoped (drop policy lama, buat baru) |
| `0021_data_migration.sql` | buat "Cabang Utama", migrasi profil→membership, produk→branch_products, backfill branch_id |
| `0022_compat_views.sql` | view kompatibilitas agar app v1 tetap jalan sementara |

> Dipecah agar mudah ditinjau & di-rollback bertahap. Diterapkan berurutan.

---

## 2. Skema baru (ringkas — DDL final menyusul di file migrasi)

### Enum
```sql
create type branch_role as enum ('manager','cashier');
create type approval_type as enum ('void','refund','discount_override',
  'price_override','stock_adjustment','no_sale');
create type approval_status as enum ('pending','approved','rejected');
create type transfer_status as enum ('draft','dispatched','received','cancelled');
create type cash_movement_type as enum ('drop','pettycash_out','expense','float_in');
-- movement_type diperluas: + 'transfer_out','transfer_in','wastage','restock'
```

### Inti multi-cabang
```sql
create table branches (
  id uuid pk default gen_random_uuid(),
  code text unique not null, name text not null,
  address text, phone text, timezone text default 'Asia/Jakarta',
  is_active boolean default true, created_at, updated_at);

create table branch_memberships (
  id uuid pk, user_id uuid fk->profiles on delete cascade,
  branch_id uuid fk->branches on delete cascade,
  role branch_role not null, permissions text[] not null default '{}',
  is_active boolean default true, created_at, updated_at,
  unique(user_id, branch_id));

alter table profiles
  add column is_master_admin boolean not null default false;
-- kolom lama `role`,`permissions` DIBIARKAN dulu (kompatibilitas), di-drop di fase akhir.
```

### Katalog global vs per cabang
```sql
alter table products add column base_cost_price numeric(14,2);
-- backfill dari cost_price lama; cost_price dibiarkan sampai kode pindah.

create table branch_products (
  id uuid pk, branch_id fk->branches, product_id fk->products,
  price numeric(14,2) not null default 0,
  min_stock numeric(14,3) not null default 0,
  stock numeric(14,3) not null default 0,   -- cache dari ledger
  is_active boolean not null default true,
  created_at, updated_at, unique(branch_id, product_id));
```

### Settings dipecah
```sql
create table org_settings (         -- 1 baris global
  id uuid pk, org_name text, logo_url text,
  default_discount_threshold numeric, default_adjustment_threshold numeric,
  -- tema global dipindah ke sini (lihat Pertanyaan #3)
  ...);

create table branch_settings (      -- 1 baris per cabang
  id uuid pk, branch_id fk unique,
  tax_enabled boolean default false, tax_percent numeric default 0,
  tax_inclusive boolean default false,
  receipt_footer text, qris_image_url text, trx_prefix text default 'TRX',
  created_at, updated_at);
```

### `branch_id` + immutability di tabel operasional
```sql
alter table transactions
  add column branch_id uuid fk->branches,
  add column seq_no bigint,
  add column reversal_of uuid references transactions(id),
  add column prev_hash text, add column row_hash text;
-- serupa: payments.branch_id, cash_sessions.branch_id,
-- stock_movements.branch_id + prev_hash/row_hash, audit_logs.branch_id + hash,
-- stock_opnames.branch_id, dst.
```

---

## 3. Migrasi data lama → "Cabang Utama"

```
1. INSERT branches (code='UTAMA', name='Cabang Utama', ...) → :main
2. org_settings: 1 baris dari store_settings (org_name, logo, tema global)
3. branch_settings: 1 baris utk :main dari store_settings (pajak, footer, qris, prefix)
4. bank_accounts: tambah branch_id=:main ke 3 baris lama
5. profiles: yang role='admin' → is_master_admin=true;
   yang role='kasir' → INSERT branch_memberships(role='cashier', branch:main, permissions dipetakan)
   (admin juga boleh dibuatkan membership manager di :main bila diinginkan — Pertanyaan #4)
6. products: base_cost_price = cost_price
7. branch_products: 1 baris per produk utk :main (price=sell_price, stock=stock lama, min_stock, is_active)
8. backfill branch_id=:main pada seluruh baris lama transactions/payments/cash_sessions/
   stock_movements/audit_logs/stock_opnames (saat ini kebanyakan kosong)
9. seq_no transaksi lama diisi berurutan per branch (bila ada); hash chain di-*seed*.
```

---

## 4. Helper RLS (SECURITY DEFINER, stable)

```sql
create function is_master_admin() returns boolean language sql stable security definer as $$
  select coalesce((select is_master_admin from profiles where id = auth.uid()), false);
$$;

create function user_branch_ids() returns setof uuid language sql stable security definer as $$
  select branch_id from branch_memberships
  where user_id = auth.uid() and is_active = true;
$$;

create function has_branch_role(b uuid, r branch_role) returns boolean language sql stable security definer as $$
  select is_master_admin() or exists (
    select 1 from branch_memberships
    where user_id = auth.uid() and branch_id = b and role = r and is_active);
$$;

create function has_branch_permission(b uuid, perm text) returns boolean language sql stable security definer as $$
  select is_master_admin() or exists (
    select 1 from branch_memberships
    where user_id = auth.uid() and branch_id = b and is_active
      and perm = any(permissions));
$$;
```

---

## 5. Pola RLS per tabel (contoh)

```sql
-- Tabel branch-scoped biasa (mis. branch_products, cash_sessions):
create policy sel on branch_products for select
  using (is_master_admin() or branch_id = any(array(select user_branch_ids())));

create policy ins on branch_products for insert
  with check (is_master_admin() or has_branch_permission(branch_id,'product.branch_edit'));

-- Tabel immutable (transactions, stock_movements, audit_logs):
--   SELECT: sesuai scope cabang;  INSERT: via RPC (SECURITY DEFINER);
--   TIDAK ADA policy UPDATE/DELETE untuk siapa pun (ditambah guard trigger).

-- Kolom sensitif HPP:
--   products.base_cost_price TIDAK diselect utk cashier — ditegakkan lewat
--   RPC/`view` khusus + seleksi kolom di server (kasir tak pernah query kolom itu).
```

`branches`/`branch_memberships`/`org_settings`: tulis hanya `is_master_admin()`.
`branch_settings`: update oleh `is_master_admin()` atau `has_branch_permission(branch_id,'settings.branch_edit')`.

---

## 6. Trigger wajib

1. **Append-only guard** (`transactions`, `stock_movements`, `audit_logs`):
   `BEFORE UPDATE OR DELETE → RAISE EXCEPTION` (berlaku utk SEMUA peran, termasuk master admin).
   > Konsekuensi: void/refund TIDAK lagi meng-`UPDATE` status, melainkan buat transaksi **reversal** (`reversal_of`). Ini mengubah `create_sale`/void di Fase 3–4.
2. **Hash chain** (`BEFORE INSERT`): `prev_hash` = `row_hash` baris terakhir (per cabang);
   `row_hash = encode(digest(canonical_payload || coalesce(prev_hash,''), 'sha256'),'hex')`
   (pakai `pgcrypto`). Payload kanonik = kolom bisnis yang tetap.
3. **seq_no per cabang** (`BEFORE INSERT` transactions): ambil `max(seq_no)+1` per `branch_id`
   dengan `advisory lock`/`SELECT ... FOR UPDATE` agar tanpa celah; deteksi gap = job/laporan.
4. **updated_at** auto (sudah ada polanya).
5. **handle_new_user**: sudah ada; pastikan set default `is_master_admin=false`.

---

## 7. Pemetaan peran lama → baru

| Lama | Baru |
|---|---|
| `profiles.role='admin'` | `is_master_admin=true` (+ opsional membership manager di Cabang Utama) |
| `profiles.role='kasir'` | `branch_memberships(role='cashier', branch=Utama)` |
| `profiles.permissions[]` | dipetakan ke `branch_memberships.permissions[]` (nama permission baru) |

Kolom `profiles.role`/`permissions` dipertahankan hingga kode auth pindah (Fase 1), lalu di-drop.

---

## 8. Dampak ke kode app & kompatibilitas

Setelah Fase 0, tabel baru ada TAPI kode lama masih mengacu skema lama. Agar app
v1 tetap boot tanpa langsung refactor besar:

- **Biarkan** `store_settings`, `products.cost_price/stock/sell_price`, `cash_expenses`,
  `profiles.role` tetap ada (tidak di-drop).
- Buat **compatibility view** bila perlu (mis. `store_settings` tetap terbaca).
- `stock_movements`/`transactions` dapat hash & branch_id via trigger + default
  ke Cabang Utama, sehingga RPC `create_sale` lama masih jalan (dengan sedikit
  penyesuaian minimal bila `branch_id`/`seq_no` `NOT NULL`).

> Titik risiko: kolom baru yang `NOT NULL` tanpa default akan mematahkan INSERT
> lama. Solusi: default ke Cabang Utama selama transisi, dijadikan wajib di fase akhir.

Refactor penuh (auth 3-peran, pemilih cabang, branch_products di POS) = **Fase 1–3**.

---

## 9. Backup & rollback

- **Sebelum eksekusi:** dump seluruh tabel publik ke JSON (scratchpad) + catat snapshot.
- Tiap file migrasi punya blok **rollback** (drop tabel/kolom/enum baru, restore policy lama).
- Karena additive, rollback Fase 0 = drop objek baru; data lama tak tersentuh.

---

## 10. Uji RLS lintas cabang (wajib sebelum lanjut)

Skenario uji (via query langsung pakai JWT tiap user, bukan hanya UI):
1. Kasir Cabang A **tidak** bisa `select`/`insert` data Cabang B.
2. Manajer A tidak bisa ubah `branch_settings` B.
3. Master admin bisa semua cabang.
4. Tak seorang pun bisa `update`/`delete` `transactions`/`stock_movements`/`audit_logs`.
5. Kasir tak pernah menerima kolom `base_cost_price`.
6. Hash chain: ubah 1 baris (via superuser) → verifikasi rantai putus terdeteksi.

---

## 11. TIDAK termasuk Fase 0 (fase berikutnya)

Pemilih cabang & UI 3-peran (F1), katalog/branch_products di UI + settings per cabang
(F2), kasir/pembayaran/shift + RPC baru (F3), approval/Z-report/anti-fraud (F4),
transfer/goods receipt/wastage/opname approval (F5), dashboard & laporan (F6).

---

## 12. Pertanyaan yang perlu Anda jawab sebelum eksekusi

1. **Kompatibilitas vs cutover bersih.** Setuju pendekatan *additive + kompatibel*
   (app v1 tetap hidup selama transisi), atau Anda lebih suka *cutover* penuh
   (skema bersih sesuai PRD, app sengaja mati sampai Fase 1–3 selesai)?
2. **Nama Cabang Utama & kodenya** (usulan: nama "Pudingkuu Lucky - Pusat", code "UTAMA").
3. **Tema (warna/font) yang baru dibuat**: jadikan **per cabang** (`branch_settings`)
   atau **global** (`org_settings`)? (Usulan: per cabang, agar tiap cabang bisa beda.)
4. **Akun admin Anda**: selain `is_master_admin=true`, apakah juga dibuatkan
   keanggotaan **manager** di Cabang Utama agar bisa ikut transaksi/shift langsung?
5. **`cash_expenses` lama** → migrasikan ke `cash_movements` (tipe `expense`) atau
   biarkan (data pengeluaran lama sudah kosong, jadi bisa diabaikan)?
6. **HPP untuk kasir**: pakai **view** `branch_products` tanpa kolom HPP, atau cukup
   seleksi kolom di server? (Usulan: keduanya — view aman + seleksi server.)
