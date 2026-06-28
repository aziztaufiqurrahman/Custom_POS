-- =============================================================================
-- 0001_init.sql — Skema inti POS/Kasir
-- Extensions, enums, tabel, index, trigger updated_at, handle_new_user,
-- dan fungsi helper RLS (is_admin, has_permission).
-- Konvensi uang: numeric(14,2). Qty/stok: numeric(14,3). Persen: numeric(5,2).
-- =============================================================================

-- Extensions ------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;     -- pencarian ILIKE cepat

-- Enums -----------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin','kasir');
exception when duplicate_object then null; end $$;

do $$ begin
  create type discount_type as enum ('none','amount','percent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_type as enum ('initial','sale','void','refund','opname','adjustment','restock');
exception when duplicate_object then null; end $$;

do $$ begin
  create type opname_status as enum ('draft','completed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type session_status as enum ('open','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bank_code as enum ('BNI','BCA','BSI');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash','qris','transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_status as enum ('completed','void','refunded');
exception when duplicate_object then null; end $$;

-- Helper: updated_at ----------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- TABEL
-- =============================================================================

-- profiles --------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  avatar_url text,
  role user_role not null default 'kasir',
  permissions text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- categories ------------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.categories(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_parent on public.categories(parent_id);

-- products --------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null,
  barcode text,
  name text not null,
  description text,
  category_id uuid references public.categories(id) on delete set null,
  image_url text,
  image_urls text[] not null default '{}',
  sell_price numeric(14,2) not null default 0,
  cost_price numeric(14,2),               -- HPP, hanya admin (lihat RLS + view)
  unit text not null default 'pcs',
  stock numeric(14,3) not null default 0,
  min_stock numeric(14,3) not null default 0,
  is_taxable boolean not null default false,
  discount_type discount_type not null default 'none',
  discount_value numeric(14,2) not null default 0,
  supplier text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- SKU & barcode unik hanya untuk produk yang belum dihapus
create unique index if not exists uq_products_sku_active
  on public.products(sku) where deleted_at is null;
create unique index if not exists uq_products_barcode_active
  on public.products(barcode) where deleted_at is null and barcode is not null;
create index if not exists idx_products_category on public.products(category_id);
create index if not exists idx_products_name_trgm on public.products using gin (name gin_trgm_ops);
create index if not exists idx_products_sku_trgm on public.products using gin (sku gin_trgm_ops);

-- stock_movements -------------------------------------------------------------
create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  type movement_type not null,
  qty_change numeric(14,3) not null,      -- + masuk / - keluar
  stock_after numeric(14,3) not null,
  reference_id uuid,                      -- transaction_id / opname_id
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_movements_product on public.stock_movements(product_id, created_at desc);
create index if not exists idx_movements_type on public.stock_movements(type);
create index if not exists idx_movements_reference on public.stock_movements(reference_id);

-- stock_opnames ---------------------------------------------------------------
create table if not exists public.stock_opnames (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  status opname_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  opname_id uuid not null references public.stock_opnames(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  system_qty numeric(14,3) not null default 0,
  physical_qty numeric(14,3) not null default 0,
  difference numeric(14,3) not null default 0,
  reason text
);
create index if not exists idx_opname_items_opname on public.stock_opname_items(opname_id);

-- cash_sessions (shift) -------------------------------------------------------
create table if not exists public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid not null references public.profiles(id),
  opening_balance numeric(14,2) not null default 0,
  status session_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  expected_cash numeric(14,2),
  counted_cash numeric(14,2),
  variance numeric(14,2),
  total_cash numeric(14,2) not null default 0,
  total_qris numeric(14,2) not null default 0,
  total_transfer numeric(14,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Satu kasir hanya boleh punya SATU shift 'open'
create unique index if not exists uq_one_open_session_per_cashier
  on public.cash_sessions(cashier_id) where status = 'open';
create index if not exists idx_sessions_cashier on public.cash_sessions(cashier_id, opened_at desc);

-- bank_accounts ---------------------------------------------------------------
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank bank_code not null unique,
  account_number text not null default '',
  account_name text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- transactions ----------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  cashier_id uuid not null references public.profiles(id),
  cash_session_id uuid references public.cash_sessions(id),
  customer_name text,
  customer_phone text,
  subtotal numeric(14,2) not null default 0,
  discount_total numeric(14,2) not null default 0,
  tax_total numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  status transaction_status not null default 'completed',
  note text,
  voided_by uuid references public.profiles(id),
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_transactions_cashier on public.transactions(cashier_id, created_at desc);
create index if not exists idx_transactions_session on public.transactions(cash_session_id);
create index if not exists idx_transactions_created on public.transactions(created_at desc);
create index if not exists idx_transactions_status on public.transactions(status);

-- transaction_items -----------------------------------------------------------
create table if not exists public.transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  sku_snapshot text,
  unit_price numeric(14,2) not null,
  qty numeric(14,3) not null,
  discount numeric(14,2) not null default 0,
  line_total numeric(14,2) not null
);
create index if not exists idx_trx_items_trx on public.transaction_items(transaction_id);
create index if not exists idx_trx_items_product on public.transaction_items(product_id);

-- payments --------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  method payment_method not null,
  bank bank_code,
  amount numeric(14,2) not null,
  cash_received numeric(14,2),
  change_given numeric(14,2),
  reference text,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_trx on public.payments(transaction_id);
create index if not exists idx_payments_method on public.payments(method);

-- store_settings (single row) -------------------------------------------------
create table if not exists public.store_settings (
  id uuid primary key default gen_random_uuid(),
  store_name text not null default 'Toko Saya',
  logo_url text,
  address text,
  phone text,
  receipt_footer text,
  qris_image_url text,
  tax_enabled boolean not null default false,
  tax_percent numeric(5,2) not null default 11,
  tax_inclusive boolean not null default false,
  trx_prefix text not null default 'TRX',
  updated_at timestamptz not null default now()
);

-- audit_logs ------------------------------------------------------------------
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_actor on public.audit_logs(actor_id, created_at desc);
create index if not exists idx_audit_entity on public.audit_logs(entity, entity_id);

-- Trigger updated_at ----------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','products','cash_sessions','bank_accounts','store_settings']
  loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', t);
    execute format('create trigger trg_set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- =============================================================================
-- HELPER RLS (SECURITY DEFINER agar tidak rekursif terhadap RLS profiles)
-- =============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$$;

create or replace function public.has_permission(perm text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active
      and (role = 'admin' or perm = any(permissions))
  );
$$;

-- =============================================================================
-- handle_new_user: buat profil otomatis saat user auth dibuat.
-- Role default 'kasir'; admin pertama di-set manual (lihat README).
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Lindungi kolom hak akses: end-user terautentikasi yang BUKAN admin tidak boleh
-- mengubah role/permissions/is_active. Konteks tepercaya (auth.uid() null —
-- yaitu SQL Editor untuk set admin pertama, atau admin-client service_role)
-- tetap diizinkan.
create or replace function public.guard_profile_privilege()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.permissions is distinct from old.permissions
       or new.is_active is distinct from old.is_active then
      raise exception 'Tidak berwenang mengubah role/permissions/status akun';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privilege on public.profiles;
create trigger trg_guard_profile_privilege
  before update on public.profiles
  for each row execute function public.guard_profile_privilege();
