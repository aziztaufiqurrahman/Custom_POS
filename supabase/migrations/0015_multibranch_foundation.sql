-- =============================================================================
-- 0015_multibranch_foundation.sql — FASE 0: Fondasi Multi-Cabang (PRD v2.0)
--
-- Bersifat ADDITIVE & NON-BREAKING: seluruh kolom/tabel lama dipertahankan.
-- `branch_id` diberi DEFAULT = Cabang Utama sehingga RPC lama (create_sale,
-- void_sale, refund_sale) tetap berfungsi tanpa perubahan.
--
-- Immutability (hash chain + append-only) DIAKTIFKAN pada stock_movements &
-- audit_logs (yang hanya di-INSERT). Pada `transactions` hanya KOLOM yang
-- disiapkan; enforcement ditunda ke Fase 4 (perlu create_sale ditulis ulang
-- jadi hitung-lalu-insert + model reversal untuk void/refund).
--
-- Diterapkan sebagai SATU transaksi (atomik). Aman diulang (idempoten).
-- Cabang Utama id tetap: 00000000-0000-0000-0000-0000000000c1
-- =============================================================================

-- ── 1. ENUM baru ────────────────────────────────────────────────────────────
do $$ begin create type branch_role as enum ('manager','cashier'); exception when duplicate_object then null; end $$;
do $$ begin create type cash_movement_type as enum ('drop','pettycash_out','expense','float_in'); exception when duplicate_object then null; end $$;
do $$ begin create type transfer_status as enum ('draft','dispatched','received','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type approval_type as enum ('void','refund','discount_override','price_override','stock_adjustment','no_sale'); exception when duplicate_object then null; end $$;
do $$ begin create type approval_status as enum ('pending','approved','rejected'); exception when duplicate_object then null; end $$;
do $$ begin create type goods_receipt_status as enum ('draft','received','cancelled'); exception when duplicate_object then null; end $$;
do $$ begin create type wastage_status as enum ('pending_approval','approved','rejected'); exception when duplicate_object then null; end $$;

-- ── 2. profiles.is_master_admin ─────────────────────────────────────────────
alter table public.profiles
  add column if not exists is_master_admin boolean not null default false;

-- ── 3. branches + Cabang Utama ──────────────────────────────────────────────
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  address text,
  phone text,
  timezone text not null default 'Asia/Jakarta',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.branches (id, code, name, address, phone)
select '00000000-0000-0000-0000-0000000000c1'::uuid, 'UTAMA',
       'Pudingkuu Lucky - Pusat',
       (select address from public.store_settings limit 1),
       (select phone from public.store_settings limit 1)
on conflict (id) do nothing;

-- ── 4. branch_memberships ───────────────────────────────────────────────────
create table if not exists public.branch_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  role branch_role not null,
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, branch_id)
);
create index if not exists idx_memberships_user on public.branch_memberships(user_id) where is_active;
create index if not exists idx_memberships_branch on public.branch_memberships(branch_id) where is_active;

-- ── 5. Fungsi helper RLS ────────────────────────────────────────────────────
create or replace function public.is_master_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_master_admin from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.user_branch_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select branch_id from public.branch_memberships
  where user_id = auth.uid() and is_active = true;
$$;

create or replace function public.has_branch_role(b uuid, r branch_role)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_master_admin() or exists (
    select 1 from public.branch_memberships
    where user_id = auth.uid() and branch_id = b and role = r and is_active = true
  );
$$;

create or replace function public.has_branch_permission(b uuid, perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_master_admin() or exists (
    select 1 from public.branch_memberships
    where user_id = auth.uid() and branch_id = b and is_active = true
      and perm = any(permissions)
  );
$$;

grant execute on function public.is_master_admin() to authenticated;
grant execute on function public.user_branch_ids() to authenticated;
grant execute on function public.has_branch_role(uuid, branch_role) to authenticated;
grant execute on function public.has_branch_permission(uuid, text) to authenticated;

-- ── 6. org_settings + branch_settings ───────────────────────────────────────
create table if not exists public.org_settings (
  id uuid primary key default gen_random_uuid(),
  org_name text not null default 'Organisasi',
  logo_url text,
  default_discount_threshold numeric(14,2) not null default 0,
  default_adjustment_threshold numeric(14,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.org_settings (org_name, logo_url)
select coalesce(nullif(split_part(coalesce(store_name,''), E'\n', 1), ''), 'Pudingkuu Lucky'),
       logo_url
from public.store_settings limit 1;
-- hanya sekali (tabel baru, kosong) — aman.

create table if not exists public.branch_settings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null unique references public.branches(id) on delete cascade,
  tax_enabled boolean not null default false,
  tax_percent numeric(5,2) not null default 0,
  tax_inclusive boolean not null default false,
  receipt_footer text,
  qris_image_url text,
  trx_prefix text not null default 'TRX',
  theme_preset text not null default 'classic',
  theme_primary text,
  theme_radius text not null default 'md',
  theme_font text not null default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.branch_settings (
  branch_id, tax_enabled, tax_percent, tax_inclusive, receipt_footer,
  qris_image_url, trx_prefix, theme_preset, theme_primary, theme_radius, theme_font)
select '00000000-0000-0000-0000-0000000000c1'::uuid,
  coalesce(tax_enabled,false), coalesce(tax_percent,0), coalesce(tax_inclusive,false),
  receipt_footer, qris_image_url, coalesce(trx_prefix,'TRX'),
  coalesce(theme_preset,'classic'), theme_primary, coalesce(theme_radius,'md'),
  coalesce(theme_font,'default')
from public.store_settings limit 1
on conflict (branch_id) do nothing;

-- ── 7. Katalog: base_cost_price + branch_products ───────────────────────────
alter table public.products
  add column if not exists base_cost_price numeric(14,2);
update public.products set base_cost_price = cost_price
  where base_cost_price is null and cost_price is not null;

create table if not exists public.branch_products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  price numeric(14,2) not null default 0,
  min_stock numeric(14,3) not null default 0,
  stock numeric(14,3) not null default 0,   -- cache dari ledger
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, product_id)
);
create index if not exists idx_branch_products_branch on public.branch_products(branch_id);
insert into public.branch_products (branch_id, product_id, price, min_stock, stock, is_active)
select '00000000-0000-0000-0000-0000000000c1'::uuid, id, sell_price, min_stock, stock, is_active
from public.products where deleted_at is null
on conflict (branch_id, product_id) do nothing;

-- ── 8. branch_id pada tabel operasional (default Cabang Utama) ──────────────
alter table public.transactions   add column if not exists branch_id uuid not null default '00000000-0000-0000-0000-0000000000c1'::uuid references public.branches(id);
alter table public.payments        add column if not exists branch_id uuid not null default '00000000-0000-0000-0000-0000000000c1'::uuid references public.branches(id);
alter table public.cash_sessions   add column if not exists branch_id uuid not null default '00000000-0000-0000-0000-0000000000c1'::uuid references public.branches(id);
alter table public.stock_movements add column if not exists branch_id uuid not null default '00000000-0000-0000-0000-0000000000c1'::uuid references public.branches(id);
alter table public.stock_opnames   add column if not exists branch_id uuid not null default '00000000-0000-0000-0000-0000000000c1'::uuid references public.branches(id);
alter table public.cash_expenses   add column if not exists branch_id uuid not null default '00000000-0000-0000-0000-0000000000c1'::uuid references public.branches(id);
alter table public.audit_logs      add column if not exists branch_id uuid references public.branches(id); -- nullable (aksi global)
create index if not exists idx_transactions_branch on public.transactions(branch_id);
create index if not exists idx_stock_movements_branch on public.stock_movements(branch_id);

-- ── 9. Tabel operasional baru (Fase 5) ──────────────────────────────────────
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text, note text, is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  cash_session_id uuid references public.cash_sessions(id) on delete cascade,
  type cash_movement_type not null,
  amount numeric(14,2) not null,
  reason text, receipt_url text,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_cash_movements_session on public.cash_movements(cash_session_id);

create table if not exists public.stock_transfers (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  from_branch_id uuid not null references public.branches(id),
  to_branch_id uuid not null references public.branches(id),
  status transfer_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  dispatched_by uuid references public.profiles(id) on delete set null,
  received_by uuid references public.profiles(id) on delete set null,
  dispatched_at timestamptz, received_at timestamptz, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.stock_transfer_items (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.stock_transfers(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric(14,3) not null
);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  code text unique not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status goods_receipt_status not null default 'draft',
  received_by uuid references public.profiles(id) on delete set null,
  received_at timestamptz, note text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.goods_receipts(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric(14,3) not null, cost_price numeric(14,2)
);

create table if not exists public.wastages (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  code text unique not null,
  status wastage_status not null default 'pending_approval',
  reason text, photo_url text,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.wastage_items (
  id uuid primary key default gen_random_uuid(),
  wastage_id uuid not null references public.wastages(id) on delete cascade,
  product_id uuid not null references public.products(id),
  qty numeric(14,3) not null
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  request_type approval_type not null,
  reference_type text, reference_id uuid,
  requested_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  status approval_status not null default 'pending',
  reason text, created_at timestamptz not null default now(), decided_at timestamptz
);
create index if not exists idx_approvals_branch_status on public.approvals(branch_id, status);

create table if not exists public.daily_closures (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  business_date date not null,
  totals jsonb not null default '{}'::jsonb,
  closed_by uuid references public.profiles(id) on delete set null,
  closed_at timestamptz not null default now(),
  is_locked boolean not null default true,
  unique (branch_id, business_date)
);

-- ── 10. Immutability: kolom + hash chain + append-only (ledger) ─────────────
alter table public.stock_movements add column if not exists prev_hash text, add column if not exists row_hash text;
alter table public.audit_logs      add column if not exists prev_hash text, add column if not exists row_hash text;
-- transactions: kolom disiapkan, enforcement DITUNDA ke Fase 4.
alter table public.transactions
  add column if not exists seq_no bigint,
  add column if not exists reversal_of uuid references public.transactions(id),
  add column if not exists prev_hash text,
  add column if not exists row_hash text;

-- Hash chain generik (per tabel, urut created_at,id).
-- search_path menyertakan `extensions` karena pgcrypto (digest) ada di sana.
create or replace function public.hash_chain()
returns trigger language plpgsql set search_path = public, extensions as $$
declare v_prev text; v_json text;
begin
  execute format('select row_hash from public.%I order by created_at desc, id desc limit 1', tg_table_name)
    into v_prev;
  v_json := (to_jsonb(new) - 'prev_hash' - 'row_hash')::text;
  new.prev_hash := v_prev;
  new.row_hash := encode(digest(v_json || coalesce(v_prev, ''), 'sha256'), 'hex');
  return new;
end $$;

drop trigger if exists trg_hash_stock_movements on public.stock_movements;
create trigger trg_hash_stock_movements before insert on public.stock_movements
  for each row execute function public.hash_chain();
drop trigger if exists trg_hash_audit_logs on public.audit_logs;
create trigger trg_hash_audit_logs before insert on public.audit_logs
  for each row execute function public.hash_chain();

-- Guard append-only: blokir UPDATE/DELETE (semua peran, termasuk service role).
create or replace function public.guard_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'Tabel % bersifat append-only: UPDATE/DELETE tidak diizinkan.', tg_table_name;
end $$;

drop trigger if exists trg_append_only_stock_movements on public.stock_movements;
create trigger trg_append_only_stock_movements before update or delete on public.stock_movements
  for each row execute function public.guard_append_only();
drop trigger if exists trg_append_only_audit_logs on public.audit_logs;
create trigger trg_append_only_audit_logs before update or delete on public.audit_logs
  for each row execute function public.guard_append_only();

-- ── 11. Migrasi data peran lama → model baru ────────────────────────────────
update public.profiles set is_master_admin = true where role = 'admin';

insert into public.branch_memberships (user_id, branch_id, role, permissions, is_active)
select id, '00000000-0000-0000-0000-0000000000c1'::uuid, 'manager',
  array['stock.opname','stock.adjust','stock.receive','stock.wastage',
        'stock.transfer_request','stock.transfer_receive','report.view','report.export',
        'sales.view_branch','settings.branch_edit','audit.view','approval.grant',
        'discount.override','price.override','cash.drop','cash.pettycash'], true
from public.profiles where role = 'admin'
on conflict (user_id, branch_id) do nothing;

insert into public.branch_memberships (user_id, branch_id, role, permissions, is_active)
select id, '00000000-0000-0000-0000-0000000000c1'::uuid, 'cashier', array['cash.drop'], true
from public.profiles where role = 'kasir'
on conflict (user_id, branch_id) do nothing;

-- ── 12. updated_at triggers untuk tabel baru ───────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['branches','branch_memberships','org_settings','branch_settings',
                           'branch_products','suppliers','stock_transfers','goods_receipts','wastages']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ── 13. RLS untuk tabel BARU (branch-scoped) ────────────────────────────────
alter table public.branches            enable row level security;
alter table public.branch_memberships  enable row level security;
alter table public.org_settings        enable row level security;
alter table public.branch_settings     enable row level security;
alter table public.branch_products     enable row level security;
alter table public.suppliers           enable row level security;
alter table public.cash_movements      enable row level security;
alter table public.stock_transfers     enable row level security;
alter table public.stock_transfer_items enable row level security;
alter table public.goods_receipts      enable row level security;
alter table public.goods_receipt_items enable row level security;
alter table public.wastages            enable row level security;
alter table public.wastage_items       enable row level security;
alter table public.approvals           enable row level security;
alter table public.daily_closures      enable row level security;

-- branches: lihat cabang milik sendiri / master admin lihat semua; tulis master admin.
drop policy if exists branches_select on public.branches;
create policy branches_select on public.branches for select to authenticated
  using (public.is_master_admin() or id in (select public.user_branch_ids()));
drop policy if exists branches_write on public.branches;
create policy branches_write on public.branches for all to authenticated
  using (public.is_master_admin()) with check (public.is_master_admin());

-- branch_memberships: lihat milik sendiri / master admin; tulis master admin.
drop policy if exists memberships_select on public.branch_memberships;
create policy memberships_select on public.branch_memberships for select to authenticated
  using (public.is_master_admin() or user_id = auth.uid());
drop policy if exists memberships_write on public.branch_memberships;
create policy memberships_write on public.branch_memberships for all to authenticated
  using (public.is_master_admin()) with check (public.is_master_admin());

-- org_settings: baca semua terautentikasi; tulis master admin.
drop policy if exists org_settings_select on public.org_settings;
create policy org_settings_select on public.org_settings for select to authenticated using (true);
drop policy if exists org_settings_write on public.org_settings;
create policy org_settings_write on public.org_settings for all to authenticated
  using (public.is_master_admin()) with check (public.is_master_admin());

-- branch_settings: baca sesuai cabang; tulis master admin / settings.branch_edit.
drop policy if exists branch_settings_select on public.branch_settings;
create policy branch_settings_select on public.branch_settings for select to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
drop policy if exists branch_settings_write on public.branch_settings;
create policy branch_settings_write on public.branch_settings for all to authenticated
  using (public.is_master_admin() or public.has_branch_permission(branch_id,'settings.branch_edit'))
  with check (public.is_master_admin() or public.has_branch_permission(branch_id,'settings.branch_edit'));

-- branch_products: baca sesuai cabang; tulis master admin / product.branch_edit.
drop policy if exists branch_products_select on public.branch_products;
create policy branch_products_select on public.branch_products for select to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
drop policy if exists branch_products_write on public.branch_products;
create policy branch_products_write on public.branch_products for all to authenticated
  using (public.is_master_admin() or public.has_branch_permission(branch_id,'product.branch_edit'))
  with check (public.is_master_admin() or public.has_branch_permission(branch_id,'product.branch_edit'));

-- suppliers: baca semua terautentikasi; tulis master admin.
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers for select to authenticated using (true);
drop policy if exists suppliers_write on public.suppliers;
create policy suppliers_write on public.suppliers for all to authenticated
  using (public.is_master_admin()) with check (public.is_master_admin());

-- Pola branch-scoped umum untuk tabel operasional baru: SELECT + WRITE by branch membership.
drop policy if exists cash_movements_select on public.cash_movements;
create policy cash_movements_select on public.cash_movements for select to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
drop policy if exists cash_movements_write on public.cash_movements;
create policy cash_movements_write on public.cash_movements for all to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()))
  with check (public.is_master_admin() or branch_id in (select public.user_branch_ids()));

drop policy if exists transfers_select on public.stock_transfers;
create policy transfers_select on public.stock_transfers for select to authenticated
  using (public.is_master_admin() or from_branch_id in (select public.user_branch_ids())
         or to_branch_id in (select public.user_branch_ids()));
drop policy if exists transfers_write on public.stock_transfers;
create policy transfers_write on public.stock_transfers for all to authenticated
  using (public.is_master_admin() or from_branch_id in (select public.user_branch_ids())
         or to_branch_id in (select public.user_branch_ids()))
  with check (public.is_master_admin() or from_branch_id in (select public.user_branch_ids())
         or to_branch_id in (select public.user_branch_ids()));
drop policy if exists transfer_items_all on public.stock_transfer_items;
create policy transfer_items_all on public.stock_transfer_items for all to authenticated
  using (exists (select 1 from public.stock_transfers t where t.id = transfer_id
    and (public.is_master_admin() or t.from_branch_id in (select public.user_branch_ids())
         or t.to_branch_id in (select public.user_branch_ids()))))
  with check (exists (select 1 from public.stock_transfers t where t.id = transfer_id
    and (public.is_master_admin() or t.from_branch_id in (select public.user_branch_ids())
         or t.to_branch_id in (select public.user_branch_ids()))));

drop policy if exists receipts_select on public.goods_receipts;
create policy receipts_select on public.goods_receipts for select to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
drop policy if exists receipts_write on public.goods_receipts;
create policy receipts_write on public.goods_receipts for all to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()))
  with check (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
drop policy if exists receipt_items_all on public.goods_receipt_items;
create policy receipt_items_all on public.goods_receipt_items for all to authenticated
  using (exists (select 1 from public.goods_receipts g where g.id = receipt_id
    and (public.is_master_admin() or g.branch_id in (select public.user_branch_ids()))))
  with check (exists (select 1 from public.goods_receipts g where g.id = receipt_id
    and (public.is_master_admin() or g.branch_id in (select public.user_branch_ids()))));

drop policy if exists wastages_select on public.wastages;
create policy wastages_select on public.wastages for select to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
drop policy if exists wastages_write on public.wastages;
create policy wastages_write on public.wastages for all to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()))
  with check (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
drop policy if exists wastage_items_all on public.wastage_items;
create policy wastage_items_all on public.wastage_items for all to authenticated
  using (exists (select 1 from public.wastages w where w.id = wastage_id
    and (public.is_master_admin() or w.branch_id in (select public.user_branch_ids()))))
  with check (exists (select 1 from public.wastages w where w.id = wastage_id
    and (public.is_master_admin() or w.branch_id in (select public.user_branch_ids()))));

drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals for select to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
drop policy if exists approvals_write on public.approvals;
create policy approvals_write on public.approvals for all to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()))
  with check (public.is_master_admin() or branch_id in (select public.user_branch_ids()));

drop policy if exists closures_select on public.daily_closures;
create policy closures_select on public.daily_closures for select to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
drop policy if exists closures_write on public.daily_closures;
create policy closures_write on public.daily_closures for all to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()))
  with check (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
