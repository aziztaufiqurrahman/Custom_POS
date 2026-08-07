-- =============================================================================
-- 0027_platform_schema.sql — Fondasi platform UMKM Unggul (SaaS)
--
-- Rujukan: PRD-UMKM-Unggul-ClaudeCode §6 + §6.0 · KEP-001, KEP-006, KEP-007,
--          KEP-008, KEP-011 · docs/RENCANA-MIGRASI-1B.md §2
--
-- SIFAT: MURNI ADITIF. Tidak satu pun objek `public` milik Kasir Unggul yang
--        diubah atau dihapus. Satu-satunya sentuhan ke `public` adalah menambah
--        dua kolom pada `profiles` (is_staff, staff_role).
--
-- KEP-001: platform tinggal di skema `platform`, BUKAN `public` — karena
--          `products`, `payments`, dan `audit_logs` sudah dipakai POS dengan
--          arti yang sama sekali berbeda. Menaruhnya di `public` membuat
--          `create table if not exists` lewat tanpa error dan storefront akan
--          membaca barang dagangan pelanggan sebagai katalog tool.
--
-- ⚠️ SESUDAH MIGRASI INI: daftarkan skema `platform` di
--    Dashboard > Settings > API > Exposed schemas.
--    Tanpa itu, klien tidak bisa mengaksesnya sama sekali.
-- =============================================================================

create schema if not exists platform;

grant usage on schema platform to anon, authenticated, service_role;


-- ── 1. Enum ────────────────────────────────────────────────────────────────
-- Semua enum dibuat DI DALAM skema platform agar mustahil bertabrakan dengan
-- enum milik POS di `public`.
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'staff_role') then
    create type platform.staff_role as enum ('super_admin','finance','support','marketing');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'member_role') then
    create type platform.member_role as enum ('owner','admin','member');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'product_status') then
    create type platform.product_status as enum ('available','coming_soon');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'billing_period') then
    create type platform.billing_period as enum ('monthly','annual');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'coupon_type') then
    create type platform.coupon_type as enum ('percent','amount');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'order_status') then
    create type platform.order_status as enum
      ('pending','paid','expired','failed','cancelled','refunded');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'order_item_type') then
    -- 'addon' ditambahkan oleh KEP-006 (tidak ada di PRD §6 asli)
    create type platform.order_item_type as enum ('plan','bundle','addon');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'gateway') then
    create type platform.gateway as enum ('midtrans','xendit');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'payment_status') then
    create type platform.payment_status as enum
      ('pending','paid','expired','failed','refunded');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'subscription_status') then
    -- 'trialing' SENGAJA dibuat meski trial tidak dipakai di MVP (KEP-011),
    -- agar tidak perlu migrasi enum bila kelak diaktifkan.
    create type platform.subscription_status as enum
      ('trialing','active','past_due','suspended','cancelled','expired');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'entitlement_status') then
    create type platform.entitlement_status as enum ('active','inactive','suspended');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'provisioning_status') then
    create type platform.provisioning_status as enum ('pending','running','done','failed');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'addon_type') then
    create type platform.addon_type as enum ('branch','seat','storage');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'addon_status') then
    create type platform.addon_status as enum ('active','cancelled');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                 where n.nspname = 'platform' and t.typname = 'usage_metric') then
    create type platform.usage_metric as enum ('tx_count','storage_mb');
  end if;
end $$;


-- ── 2. public.profiles — SATU-SATUNYA sentuhan ke skema POS ────────────────
-- Aditif murni. Tidak ada kolom lama yang diubah/dihapus.
-- profiles TIDAK diduplikasi ke platform: satu user boleh jadi anggota banyak
-- workspace, jadi keanggotaan hidup di workspace_members (KEP-005 kelompok H).
alter table public.profiles
  add column if not exists is_staff   boolean not null default false,
  add column if not exists staff_role platform.staff_role;

comment on column public.profiles.is_staff is
  'Staff internal UMKM Unggul (super admin global). BUKAN pelanggan. PRD §4C.2';


-- ── 3. Tenant ──────────────────────────────────────────────────────────────
create table if not exists platform.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  logo_url    text,
  owner_id    uuid not null references public.profiles(id) on delete restrict,
  address     text,
  phone       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists platform.workspace_members (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references platform.workspaces(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  role          platform.member_role not null default 'member',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index if not exists idx_ws_members_user
  on platform.workspace_members(user_id) where is_active;
create index if not exists idx_ws_members_ws
  on platform.workspace_members(workspace_id) where is_active;


-- ── 4. Katalog & harga ─────────────────────────────────────────────────────
create table if not exists platform.products (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  tagline     text,
  description text,
  icon        text,
  category    text,
  status      platform.product_status not null default 'coming_soon',
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists platform.plans (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references platform.products(id) on delete cascade,
  name           text not null,
  tier           text not null,
  billing_period platform.billing_period not null default 'monthly',
  price          numeric(14,2) not null default 0,
  currency       text not null default 'IDR',
  features       jsonb not null default '{}'::jsonb,
  limits         jsonb not null default '{}'::jsonb,
  is_active      boolean not null default true,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (product_id, tier, billing_period)
);
comment on column platform.plans.limits is
  'Handoff §8.4. NULL pada sebuah limit = tak terbatas (Enterprise).';

create table if not exists platform.bundles (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name           text not null,
  description    text,
  billing_period platform.billing_period not null default 'monthly',
  price          numeric(14,2) not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists platform.bundle_items (
  id         uuid primary key default gen_random_uuid(),
  bundle_id  uuid not null references platform.bundles(id) on delete cascade,
  product_id uuid not null references platform.products(id) on delete restrict,
  plan_id    uuid not null references platform.plans(id)    on delete restrict,
  unique (bundle_id, product_id)
);

create table if not exists platform.coupons (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  type        platform.coupon_type not null,
  value       numeric(14,2) not null,
  max_uses    int,
  used_count  int not null default 0,
  valid_from  timestamptz,
  valid_until timestamptz,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);


-- ── 5. Pesanan & pembayaran ────────────────────────────────────────────────
create table if not exists platform.orders (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references platform.workspaces(id) on delete restrict,
  user_id      uuid not null references public.profiles(id)     on delete restrict,
  code         text not null unique,
  status       platform.order_status not null default 'pending',
  subtotal     numeric(14,2) not null default 0,
  discount     numeric(14,2) not null default 0,
  tax          numeric(14,2) not null default 0,
  total        numeric(14,2) not null default 0,
  coupon_id    uuid references platform.coupons(id) on delete set null,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists idx_orders_ws on platform.orders(workspace_id, created_at desc);

create table if not exists platform.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references platform.orders(id) on delete cascade,
  item_type  platform.order_item_type not null,
  product_id uuid references platform.products(id) on delete set null,
  plan_id    uuid references platform.plans(id)    on delete set null,
  bundle_id  uuid references platform.bundles(id)  on delete set null,
  addon_type platform.addon_type,                       -- KEP-006
  qty        int not null default 1,
  unit_price numeric(14,2) not null default 0,
  line_total numeric(14,2) not null default 0
);
create index if not exists idx_order_items_order on platform.order_items(order_id);

create table if not exists platform.payments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references platform.orders(id) on delete restrict,
  gateway     platform.gateway not null default 'midtrans',   -- KEP-011
  gateway_ref text,
  method      text,
  amount      numeric(14,2) not null default 0,
  status      platform.payment_status not null default 'pending',
  raw_payload jsonb,
  paid_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_payments_order on platform.payments(order_id);

-- Idempotency webhook (PRD §5.5). event_id UNIQUE = kunci anti-proses-ganda.
create table if not exists platform.payment_webhook_events (
  id                 uuid primary key default gen_random_uuid(),
  gateway            platform.gateway not null,
  event_id           text not null,
  order_ref          text,
  signature_verified boolean not null default false,
  processed          boolean not null default false,
  payload            jsonb,
  received_at        timestamptz not null default now(),
  unique (gateway, event_id)
);

create table if not exists platform.invoices (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references platform.orders(id) on delete restrict,
  number    text not null unique,
  pdf_url   text,
  issued_at timestamptz not null default now()
);


-- ── 6. Langganan, add-on, entitlement ──────────────────────────────────────
create table if not exists platform.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references platform.workspaces(id) on delete cascade,
  product_id           uuid not null references platform.products(id)   on delete restrict,
  plan_id              uuid not null references platform.plans(id)      on delete restrict,
  order_id             uuid references platform.orders(id) on delete set null,
  status               platform.subscription_status not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end   timestamptz,
  trial_ends_at        timestamptz,          -- tidak dipakai di MVP (KEP-011)
  auto_renew           boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (workspace_id, product_id)
);

-- KEP-006 — SUMBER KEBENARAN add-on. Tanpa tabel ini, upgrade/downgrade plan
-- menimpa entitlements.limits dan seluruh add-on berbayar HILANG tanpa jejak.
create table if not exists platform.subscription_addons (
  id              uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references platform.subscriptions(id) on delete cascade,
  workspace_id    uuid not null references platform.workspaces(id)    on delete cascade,
  addon_type      platform.addon_type not null,
  qty             int not null default 1 check (qty > 0),
  unit_price      numeric(14,2) not null default 0,
  billing_period  platform.billing_period not null default 'monthly',
  status          platform.addon_status not null default 'active',
  valid_until     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_addons_ws
  on platform.subscription_addons(workspace_id) where status = 'active';
comment on table platform.subscription_addons is
  'KEP-006. Satuan storage: 1 GB = 1.000 MB, jadi "+5 GB" = qty 1 -> storage_mb += 5000.';

-- SUMBER KEBENARAN AKSES (PRD §6).
create table if not exists platform.entitlements (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references platform.workspaces(id) on delete cascade,
  product_id   uuid not null references platform.products(id)   on delete restrict,
  plan_id      uuid references platform.plans(id) on delete set null,
  status       platform.entitlement_status not null default 'active',
  limits       jsonb not null default '{}'::jsonb,
  valid_until  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, product_id)
);
comment on column platform.entitlements.limits is
  'HASIL AKHIR = plan.limits + add-on aktif (KEP-006). JANGAN pernah di-UPDATE '
  'langsung dari aplikasi; satu-satunya jalur tulis adalah platform.recalc_entitlement(). '
  'Ditegakkan oleh trigger trg_guard_entitlement_limits.';

create table if not exists platform.provisioning_jobs (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid references platform.orders(id) on delete set null,
  workspace_id uuid not null references platform.workspaces(id) on delete cascade,
  product_id   uuid not null references platform.products(id)   on delete restrict,
  status       platform.provisioning_status not null default 'pending',
  attempts     int not null default 0,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- KEP-007 — metering fair-use. Diisi Edge Function terjadwal.
-- JANGAN pernah menambah counter di dalam create_sale (menyentuh RPC paling kritikal).
create table if not exists platform.usage_counters (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references platform.workspaces(id) on delete cascade,
  product_id   uuid not null references platform.products(id)   on delete cascade,
  metric       platform.usage_metric not null,
  period_start timestamptz not null,
  period_end   timestamptz not null,
  value        numeric(14,2) not null default 0,
  computed_at  timestamptz not null default now(),
  unique (workspace_id, product_id, metric, period_start)
);
comment on table platform.usage_counters is
  'KEP-007. Periode mengikuti subscriptions.current_period_start/end (anniversary, '
  'BUKAN kalender bulanan). Timezone tampilan: Asia/Jakarta.';

create table if not exists platform.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  product_id uuid references platform.products(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Audit aksi staff internal & sistem. BUKAN public.audit_logs milik POS
-- (yang append-only + hash chain). Lihat KEP-001.
create table if not exists platform.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles(id) on delete set null,
  action     text not null,
  entity     text,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_platform_audit_created
  on platform.audit_logs(created_at desc);


-- ── 7. updated_at ──────────────────────────────────────────────────────────
-- Memakai ulang public.set_updated_at() milik POS — sudah ada, teruji, dan
-- tidak diubah sedikit pun.
do $$
declare t text;
begin
  foreach t in array array[
    'workspaces','workspace_members','products','plans','bundles','coupons',
    'subscriptions','subscription_addons','entitlements','provisioning_jobs'
  ] loop
    execute format('drop trigger if exists trg_set_updated_at on platform.%I;', t);
    execute format('create trigger trg_set_updated_at before update on platform.%I
                    for each row execute function public.set_updated_at();', t);
  end loop;
end $$;


-- ── 8. Helper RLS ──────────────────────────────────────────────────────────
-- search_path eksplisit + security definer agar aman dipanggil dari policy
-- di skema `public` (dipakai mulai migrasi 0031).
-- auth.uid() dibungkus subquery agar di-cache planner (PRD §4A.2).

create or replace function platform.is_staff()
returns boolean language sql stable security definer
set search_path = platform, public as $$
  select coalesce((select is_staff from public.profiles
                   where id = (select auth.uid())), false);
$$;

create or replace function platform.user_workspace_ids()
returns setof uuid language sql stable security definer
set search_path = platform, public as $$
  select workspace_id from platform.workspace_members
  where user_id = (select auth.uid()) and is_active;
$$;

create or replace function platform.is_workspace_member(ws uuid)
returns boolean language sql stable security definer
set search_path = platform, public as $$
  select exists (
    select 1 from platform.workspace_members
    where workspace_id = ws and user_id = (select auth.uid()) and is_active
  );
$$;

create or replace function platform.workspace_role(ws uuid)
returns platform.member_role language sql stable security definer
set search_path = platform, public as $$
  select role from platform.workspace_members
  where workspace_id = ws and user_id = (select auth.uid()) and is_active;
$$;

-- Gerbang akses tool (PRD §4C.5). Dipakai POS mulai 0031/0033.
create or replace function platform.has_active_entitlement(ws uuid, product_slug text)
returns boolean language sql stable security definer
set search_path = platform, public as $$
  select exists (
    select 1
    from platform.entitlements e
    join platform.products p on p.id = e.product_id
    where e.workspace_id = ws
      and p.slug = product_slug
      and e.status = 'active'
      and (e.valid_until is null or e.valid_until > now())
  );
$$;

grant execute on function platform.is_staff()                          to authenticated;
grant execute on function platform.user_workspace_ids()                to authenticated;
grant execute on function platform.is_workspace_member(uuid)           to authenticated;
grant execute on function platform.workspace_role(uuid)                to authenticated;
grant execute on function platform.has_active_entitlement(uuid, text)  to authenticated;


-- ── 9. recalc_entitlement + penjaga limits (KEP-006) ───────────────────────
-- limits = plan.limits + SUM(add-on aktif). NULL pada limit = tak terbatas.
create or replace function platform.recalc_entitlement(ws uuid, prod uuid)
returns void language plpgsql security definer
set search_path = platform, public as $$
declare
  v_plan_limits jsonb;
  v_branches int; v_seats int; v_storage int;
  v_result jsonb;
begin
  select p.limits into v_plan_limits
  from platform.subscriptions s
  join platform.plans p on p.id = s.plan_id
  where s.workspace_id = ws and s.product_id = prod;

  if v_plan_limits is null then
    return;   -- belum ada langganan: tidak ada yang dihitung
  end if;

  select
    coalesce(sum(qty) filter (where addon_type = 'branch'), 0),
    coalesce(sum(qty) filter (where addon_type = 'seat'), 0),
    coalesce(sum(qty) filter (where addon_type = 'storage'), 0)
  into v_branches, v_seats, v_storage
  from platform.subscription_addons
  where workspace_id = ws and status = 'active'
    and (valid_until is null or valid_until > now());

  v_result := v_plan_limits;

  -- NULL (Enterprise = tak terbatas) dibiarkan NULL, tidak ditambah apa pun.
  if v_plan_limits->>'max_branches' is not null then
    v_result := jsonb_set(v_result, '{max_branches}',
      to_jsonb((v_plan_limits->>'max_branches')::int + v_branches));
  end if;
  if v_plan_limits->>'max_users' is not null then
    v_result := jsonb_set(v_result, '{max_users}',
      to_jsonb((v_plan_limits->>'max_users')::int + v_seats));
  end if;
  if v_plan_limits->>'storage_mb' is not null then
    -- 1 add-on storage = +5 GB = +5.000 MB (KEP-006)
    v_result := jsonb_set(v_result, '{storage_mb}',
      to_jsonb((v_plan_limits->>'storage_mb')::int + (v_storage * 5000)));
  end if;

  -- Buka kunci penjaga HANYA untuk transaksi ini.
  perform set_config('platform.allow_limits_write', 'on', true);

  update platform.entitlements
  set limits = v_result, updated_at = now()
  where workspace_id = ws and product_id = prod;
end $$;

-- Penjaga: limits hanya boleh berubah lewat recalc_entitlement().
-- Tanpa ini, satu UPDATE langsung dari kode aplikasi cukup untuk membuat
-- angka limit basi dan add-on berbayar hilang senyap.
create or replace function platform.guard_entitlement_limits()
returns trigger language plpgsql as $$
begin
  if new.limits is distinct from old.limits
     and coalesce(current_setting('platform.allow_limits_write', true), 'off') <> 'on' then
    raise exception
      'entitlements.limits hanya boleh diubah lewat platform.recalc_entitlement()';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_entitlement_limits on platform.entitlements;
create trigger trg_guard_entitlement_limits
  before update on platform.entitlements
  for each row execute function platform.guard_entitlement_limits();


-- ── 10. RLS ────────────────────────────────────────────────────────────────
alter table platform.workspaces            enable row level security;
alter table platform.workspace_members     enable row level security;
alter table platform.products              enable row level security;
alter table platform.plans                 enable row level security;
alter table platform.bundles               enable row level security;
alter table platform.bundle_items          enable row level security;
alter table platform.coupons               enable row level security;
alter table platform.orders                enable row level security;
alter table platform.order_items           enable row level security;
alter table platform.payments              enable row level security;
alter table platform.payment_webhook_events enable row level security;
alter table platform.invoices              enable row level security;
alter table platform.subscriptions         enable row level security;
alter table platform.subscription_addons   enable row level security;
alter table platform.entitlements          enable row level security;
alter table platform.provisioning_jobs     enable row level security;
alter table platform.usage_counters        enable row level security;
alter table platform.waitlist              enable row level security;
alter table platform.audit_logs            enable row level security;

-- 10a. Katalog — baca publik (storefront), tulis hanya staff (PRD §7)
do $$
declare t text;
begin
  foreach t in array array['products','plans','bundles','bundle_items'] loop
    execute format('drop policy if exists %I on platform.%I;', t || '_read', t);
    execute format('create policy %I on platform.%I for select
                    to anon, authenticated using (true);', t || '_read', t);
    execute format('drop policy if exists %I on platform.%I;', t || '_staff_write', t);
    execute format('create policy %I on platform.%I for all
                    to authenticated using (platform.is_staff())
                    with check (platform.is_staff());', t || '_staff_write', t);
  end loop;
end $$;

-- 10b. Kupon — tidak boleh terbaca publik (kode bisa ditebak/diborong).
-- Validasi lewat RPC server-side saat checkout (PRD §5.9).
drop policy if exists coupons_staff on platform.coupons;
create policy coupons_staff on platform.coupons for all to authenticated
  using (platform.is_staff()) with check (platform.is_staff());

-- 10c. Workspace & keanggotaan
drop policy if exists workspaces_read on platform.workspaces;
create policy workspaces_read on platform.workspaces for select to authenticated
  using (id in (select platform.user_workspace_ids()) or platform.is_staff());

drop policy if exists workspaces_write on platform.workspaces;
create policy workspaces_write on platform.workspaces for update to authenticated
  using (platform.workspace_role(id) in ('owner','admin') or platform.is_staff())
  with check (platform.workspace_role(id) in ('owner','admin') or platform.is_staff());

drop policy if exists ws_members_read on platform.workspace_members;
create policy ws_members_read on platform.workspace_members for select to authenticated
  using (workspace_id in (select platform.user_workspace_ids())
         or platform.is_staff());

drop policy if exists ws_members_write on platform.workspace_members;
create policy ws_members_write on platform.workspace_members for all to authenticated
  using (platform.workspace_role(workspace_id) in ('owner','admin') or platform.is_staff())
  with check (platform.workspace_role(workspace_id) in ('owner','admin') or platform.is_staff());

-- 10d. Data workspace — baca oleh anggota, tulis HANYA service-role (PRD §7)
do $$
declare t text;
begin
  foreach t in array array[
    'orders','subscriptions','subscription_addons','entitlements',
    'provisioning_jobs','usage_counters'
  ] loop
    execute format('drop policy if exists %I on platform.%I;', t || '_read', t);
    execute format('create policy %I on platform.%I for select to authenticated
                    using (workspace_id in (select platform.user_workspace_ids())
                           or platform.is_staff());', t || '_read', t);
  end loop;
end $$;

drop policy if exists order_items_read on platform.order_items;
create policy order_items_read on platform.order_items for select to authenticated
  using (exists (select 1 from platform.orders o
                 where o.id = order_items.order_id
                   and (o.workspace_id in (select platform.user_workspace_ids())
                        or platform.is_staff())));

drop policy if exists invoices_read on platform.invoices;
create policy invoices_read on platform.invoices for select to authenticated
  using (exists (select 1 from platform.orders o
                 where o.id = invoices.order_id
                   and (o.workspace_id in (select platform.user_workspace_ids())
                        or platform.is_staff())));

-- 10e. payments & payment_webhook_events — TIDAK ADA policy untuk authenticated.
-- Hanya service-role (yang menembus RLS) yang boleh menyentuhnya. PRD §7:
-- "tulis hanya lewat server/service-role (webhook & RPC), bukan dari klien".
drop policy if exists payments_staff_read on platform.payments;
create policy payments_staff_read on platform.payments for select to authenticated
  using (platform.is_staff());

-- 10f. Waitlist — siapa pun boleh mendaftar, hanya staff yang boleh membaca
drop policy if exists waitlist_insert on platform.waitlist;
create policy waitlist_insert on platform.waitlist for insert
  to anon, authenticated with check (true);
drop policy if exists waitlist_staff_read on platform.waitlist;
create policy waitlist_staff_read on platform.waitlist for select
  to authenticated using (platform.is_staff());

-- 10g. Audit platform — staff saja
drop policy if exists platform_audit_staff on platform.audit_logs;
create policy platform_audit_staff on platform.audit_logs for select
  to authenticated using (platform.is_staff());


-- ── 11. Grant ──────────────────────────────────────────────────────────────
-- RLS yang menegakkan batas; grant hanya membuka pintunya.
grant select on platform.products, platform.plans, platform.bundles,
                platform.bundle_items to anon, authenticated;
grant insert on platform.waitlist to anon, authenticated;
grant select on platform.workspaces, platform.workspace_members, platform.orders,
                platform.order_items, platform.invoices, platform.subscriptions,
                platform.subscription_addons, platform.entitlements,
                platform.provisioning_jobs, platform.usage_counters,
                platform.payments, platform.audit_logs, platform.coupons
      to authenticated;
grant update on platform.workspaces to authenticated;
grant insert, update, delete on platform.workspace_members to authenticated;

grant all on all tables    in schema platform to service_role;
grant all on all sequences in schema platform to service_role;
grant all on all functions in schema platform to service_role;


-- ── 12. Seed — produk & 8 baris plan (Handoff §8.2 + §8.4) ─────────────────
insert into platform.products (slug, name, tagline, category, status, sort_order, is_active)
values ('kasir-unggul', 'Kasir Unggul',
        'Aplikasi kasir multi-cabang untuk UMKM', 'pos', 'available', 1, true)
on conflict (slug) do nothing;

-- Gratis 1 · Basic 2 · Pro 2 · Bisnis 2 · Enterprise 1 = 8 baris.
-- Tahunan = 10x bulanan (2 bulan gratis, Handoff §8.1).
insert into platform.plans (product_id, name, tier, billing_period, price, limits, sort_order)
select p.id, v.name, v.tier, v.period::platform.billing_period, v.price, v.limits::jsonb, v.ord
from platform.products p,
(values
  ('Gratis',     'gratis',     'monthly',       0::numeric, 1,
   '{"max_branches":1,"max_users":2,"monthly_tx_cap":300,"storage_mb":200,"features":["core"]}'),
  ('Basic',      'basic',      'monthly',   30000::numeric, 2,
   '{"max_branches":1,"max_users":4,"monthly_tx_cap":3000,"storage_mb":1000,"features":["core"]}'),
  ('Basic',      'basic',      'annual',   300000::numeric, 3,
   '{"max_branches":1,"max_users":4,"monthly_tx_cap":3000,"storage_mb":1000,"features":["core"]}'),
  ('Pro',        'pro',        'monthly',   99000::numeric, 4,
   '{"max_branches":3,"max_users":12,"monthly_tx_cap":20000,"storage_mb":5000,"features":["core","multi_branch","warehouse","approval","consolidated_dashboard","audit_plus"]}'),
  ('Pro',        'pro',        'annual',   990000::numeric, 5,
   '{"max_branches":3,"max_users":12,"monthly_tx_cap":20000,"storage_mb":5000,"features":["core","multi_branch","warehouse","approval","consolidated_dashboard","audit_plus"]}'),
  ('Bisnis',     'bisnis',     'monthly',  299000::numeric, 6,
   '{"max_branches":10,"max_users":40,"monthly_tx_cap":75000,"storage_mb":20000,"features":["core","multi_branch","warehouse","approval","consolidated_dashboard","audit_plus","priority_support","custom_domain","scheduled_export"]}'),
  ('Bisnis',     'bisnis',     'annual',  2990000::numeric, 7,
   '{"max_branches":10,"max_users":40,"monthly_tx_cap":75000,"storage_mb":20000,"features":["core","multi_branch","warehouse","approval","consolidated_dashboard","audit_plus","priority_support","custom_domain","scheduled_export"]}'),
  ('Enterprise', 'enterprise', 'monthly',       0::numeric, 8,
   '{"max_branches":null,"max_users":null,"monthly_tx_cap":null,"storage_mb":null,"features":["all"]}')
) as v(name, tier, period, price, ord, limits)
where p.slug = 'kasir-unggul'
on conflict (product_id, tier, billing_period) do nothing;


-- ── 13. Verifikasi ─────────────────────────────────────────────────────────
do $$
declare v_plans int; v_tables int;
begin
  select count(*) into v_plans from platform.plans;
  select count(*) into v_tables from pg_tables where schemaname = 'platform';

  if v_plans <> 8 then
    raise exception 'Seed plan gagal: % baris, seharusnya 8', v_plans;
  end if;
  if v_tables <> 19 then
    raise exception 'Jumlah tabel platform: %, seharusnya 19', v_tables;
  end if;

  raise notice '0027 OK — % tabel platform, % baris plan', v_tables, v_plans;
  raise notice 'LANGKAH BERIKUTNYA: daftarkan skema "platform" di';
  raise notice '  Dashboard > Settings > API > Exposed schemas';
end $$;
