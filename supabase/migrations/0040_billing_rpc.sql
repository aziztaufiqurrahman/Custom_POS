-- =============================================================================
-- 0040_billing_rpc.sql — Monetisasi tahap 1: transfer manual + konfirmasi staf
--
-- Skema billing (orders/order_items/payments/invoices) sudah lengkap sejak
-- 0027, tetapi TIDAK ADA satu pun fungsi yang mengisinya — nol baris di
-- ketiganya. Migrasi ini menyediakan alur lengkapnya:
--
--   pelanggan pilih paket → create_plan_order() → transfer ke rekening →
--   staf verifikasi → confirm_order_payment() → langganan + entitlement naik
--
-- Sengaja netral-gateway: `confirm_order_payment()` menerima parameter gateway,
-- sehingga webhook Midtrans/Xendit kelak memanggil fungsi yang SAMA. Tidak ada
-- yang perlu dibongkar saat gateway ditambahkan.
--
-- Tabel `orders`/`order_items` hanya punya policy SELECT untuk tenant (0027) —
-- itu disengaja. Penulisan HARUS lewat fungsi security definer di bawah, supaya
-- harga tidak pernah datang dari klien.
-- =============================================================================

-- ── 1. Rekening tujuan transfer ────────────────────────────────────────────
-- Singleton. Dibaca semua tenant (perlu untuk instruksi transfer), ditulis staf.
create table if not exists platform.billing_settings (
  id             boolean primary key default true constraint hanya_satu_baris check (id),
  bank_name      text not null default '',
  account_number text not null default '',
  account_holder text not null default '',
  instructions   text not null default '',
  whatsapp       text,
  updated_at     timestamptz not null default now()
);

insert into platform.billing_settings (id) values (true) on conflict do nothing;

alter table platform.billing_settings enable row level security;

-- GRANT tabel WAJIB terpisah dari policy RLS. Policy hanya menyaring baris;
-- tanpa hak tabel, `authenticated` tetap ditolak sebelum policy sempat
-- dievaluasi — dan pembungkus SQL biasa (SECURITY INVOKER) seperti
-- `public.billing_info()` akan mengembalikan kosong tanpa pesan error.
-- Mengikuti pola tabel platform lain di 0027: SELECT untuk authenticated.
grant select on platform.billing_settings to authenticated;

drop policy if exists billing_settings_read on platform.billing_settings;
create policy billing_settings_read on platform.billing_settings
  for select to authenticated using (true);

drop policy if exists billing_settings_staff_write on platform.billing_settings;
create policy billing_settings_staff_write on platform.billing_settings
  for all to authenticated using (platform.is_staff()) with check (platform.is_staff());


-- ── 2. Nomor pesanan ───────────────────────────────────────────────────────
create sequence if not exists platform.order_code_seq;

create or replace function platform.next_order_code()
returns text language sql volatile
set search_path = platform as $$
  select 'INV-' || to_char(now() at time zone 'Asia/Jakarta', 'YYYYMMDD')
      || '-' || lpad(nextval('platform.order_code_seq')::text, 5, '0');
$$;


-- ── 3. Buat pesanan untuk sebuah paket ─────────────────────────────────────
create or replace function platform.create_plan_order(
  p_workspace_id uuid,
  p_plan_id      uuid
)
returns table (order_id uuid, code text, total numeric, tier text, billing_period text)
language plpgsql
security definer
set search_path = platform, public
as $$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_plan  record;
  v_order uuid;
  v_code  text;
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi';
  end if;

  -- Hanya pemilik/admin workspace yang boleh memesan; staf boleh atas nama.
  v_role := platform.workspace_role(p_workspace_id);
  if not (platform.is_staff() or v_role in ('owner', 'admin')) then
    raise exception 'Hanya pemilik atau admin workspace yang dapat memesan paket';
  end if;

  select pl.id, pl.tier, pl.billing_period, pl.price, pl.product_id, pl.is_active
    into v_plan
  from platform.plans pl
  where pl.id = p_plan_id;

  if v_plan.id is null then
    raise exception 'Paket tidak ditemukan';
  end if;
  if not v_plan.is_active then
    raise exception 'Paket tidak tersedia';
  end if;
  if v_plan.price <= 0 then
    -- Gratis tidak perlu pesanan; Enterprise dinegosiasikan manual.
    raise exception 'Paket ini tidak dapat dipesan sendiri. Hubungi kami.';
  end if;

  -- Satu pesanan menunggu per workspace. Yang lama dibatalkan agar pelanggan
  -- tidak bingung mentransfer ke nomor pesanan yang sudah usang.
  update platform.orders
     set status = 'cancelled'
   where workspace_id = p_workspace_id and status = 'pending';

  v_code := platform.next_order_code();

  insert into platform.orders
    (workspace_id, user_id, code, status, subtotal, discount, tax, total)
  values
    (p_workspace_id, v_uid, v_code, 'pending', v_plan.price, 0, 0, v_plan.price)
  returning id into v_order;

  insert into platform.order_items
    (order_id, item_type, product_id, plan_id, qty, unit_price, line_total)
  values
    (v_order, 'plan', v_plan.product_id, v_plan.id, 1, v_plan.price, v_plan.price);

  return query
    select v_order, v_code, v_plan.price, v_plan.tier, v_plan.billing_period::text;
end $$;


-- ── 4. Konfirmasi pembayaran → aktifkan langganan ──────────────────────────
-- Netral-gateway: dipanggil staf untuk transfer manual, dan kelak oleh webhook
-- Midtrans/Xendit dengan p_gateway yang sesuai.
create or replace function platform.confirm_order_payment(
  p_order_id    uuid,
  p_gateway     text default 'manual',
  p_gateway_ref text default null,
  p_method      text default 'transfer'
)
returns uuid
language plpgsql
security definer
set search_path = platform, public
as $$
declare
  v_order  record;
  v_item   record;
  v_plan   record;
  v_start  timestamptz;
  v_end    timestamptz;
  v_pay    uuid;
begin
  if not platform.is_staff() then
    raise exception 'Hanya staf platform yang dapat mengonfirmasi pembayaran';
  end if;

  select * into v_order from platform.orders where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Pesanan tidak ditemukan';
  end if;
  if v_order.status = 'paid' then
    raise exception 'Pesanan % sudah lunas', v_order.code;
  end if;
  if v_order.status <> 'pending' then
    raise exception 'Pesanan % berstatus % — tidak bisa dikonfirmasi', v_order.code, v_order.status;
  end if;

  select * into v_item from platform.order_items
   where order_id = p_order_id and item_type = 'plan' limit 1;
  if v_item.plan_id is null then
    raise exception 'Pesanan % tidak memuat paket', v_order.code;
  end if;

  select * into v_plan from platform.plans where id = v_item.plan_id;

  -- Perpanjang dari akhir periode berjalan bila masih aktif, supaya pelanggan
  -- yang membayar lebih awal tidak kehilangan sisa masa berlangganan.
  select greatest(coalesce(s.current_period_end, now()), now())
    into v_start
  from platform.subscriptions s
  where s.workspace_id = v_order.workspace_id and s.product_id = v_plan.product_id;
  v_start := coalesce(v_start, now());

  v_end := case v_plan.billing_period
             when 'annual' then v_start + interval '1 year'
             else v_start + interval '1 month'
           end;

  insert into platform.payments
    (order_id, gateway, gateway_ref, method, amount, status, paid_at)
  values
    (p_order_id, p_gateway::platform.gateway, p_gateway_ref, p_method,
     v_order.total, 'paid', now())
  returning id into v_pay;

  update platform.orders
     set status = 'paid', paid_at = now()
   where id = p_order_id;

  insert into platform.subscriptions
    (workspace_id, product_id, plan_id, order_id, status,
     current_period_start, current_period_end)
  values
    (v_order.workspace_id, v_plan.product_id, v_plan.id, p_order_id, 'active',
     v_start, v_end)
  on conflict (workspace_id, product_id) do update
    set plan_id              = excluded.plan_id,
        order_id             = excluded.order_id,
        status               = 'active',
        current_period_start = excluded.current_period_start,
        current_period_end   = excluded.current_period_end,
        updated_at           = now();

  insert into platform.entitlements
    (workspace_id, product_id, plan_id, status, limits, valid_until)
  values
    (v_order.workspace_id, v_plan.product_id, v_plan.id, 'active', v_plan.limits, v_end)
  on conflict (workspace_id, product_id) do update
    set plan_id     = excluded.plan_id,
        status      = 'active',
        valid_until = excluded.valid_until,
        updated_at  = now();

  -- limits hanya boleh ditulis lewat penjaga resmi (0027).
  perform platform.recalc_entitlement(v_order.workspace_id, v_plan.product_id);

  insert into platform.invoices (order_id, number, issued_at)
  values (p_order_id, v_order.code, now())
  on conflict do nothing;

  return v_pay;
end $$;


-- ── 5. Rantai kedaluwarsa yang hilang ──────────────────────────────────────
-- `expire_overdue_subscriptions()` (0027) HANYA memproses langganan yang sudah
-- berstatus `past_due` — padahal tidak ada apa pun yang pernah menetapkan status
-- itu. Akibatnya langganan `active` yang lewat masa berlaku tetap `active`
-- selamanya, dan pelanggan yang berhenti membayar tidak pernah turun paket.
-- Fungsi ini melengkapi mata rantai pertamanya.
create or replace function platform.mark_due_subscriptions()
returns integer
language plpgsql
security definer
set search_path = platform, public
as $$
declare v_n int;
begin
  update platform.subscriptions
     set status = 'past_due', updated_at = now()
   where status = 'active'
     and current_period_end is not null
     and current_period_end < now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Satu pintu untuk penjadwal (cron/Edge Function): tandai jatuh tempo lalu
-- turunkan yang sudah lewat masa tenggang 7 hari.
create or replace function platform.run_billing_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = platform, public
as $$
declare v_due int; v_exp int;
begin
  v_due := platform.mark_due_subscriptions();
  v_exp := platform.expire_overdue_subscriptions();
  return jsonb_build_object('jatuh_tempo', v_due, 'kedaluwarsa', v_exp, 'waktu', now());
end $$;


-- ── 6. Pembungkus publik (skema platform tidak diekspos — lihat 0038) ──────
create or replace function public.my_subscription()
returns table (
  tier text, billing_period text, status text,
  current_period_end timestamptz, limits jsonb, price numeric
)
language sql stable
set search_path = public, platform as $$
  select pl.tier, pl.billing_period::text, s.status::text,
         s.current_period_end, e.limits, pl.price
  from platform.subscriptions s
  join platform.plans pl on pl.id = s.plan_id
  left join platform.entitlements e
         on e.workspace_id = s.workspace_id and e.product_id = s.product_id
  where s.workspace_id = platform.current_workspace_id();
$$;

create or replace function public.available_plans()
returns table (
  plan_id uuid, tier text, billing_period text, price numeric, limits jsonb
)
language sql stable
set search_path = public, platform as $$
  select pl.id, pl.tier, pl.billing_period::text, pl.price, pl.limits
  from platform.plans pl
  join platform.products p on p.id = pl.product_id
  where p.slug = 'kasir-unggul' and pl.is_active
  order by pl.price, pl.tier;
$$;

create or replace function public.order_plan(p_plan_id uuid)
returns table (order_id uuid, code text, total numeric, tier text, billing_period text)
language plpgsql
set search_path = public, platform as $$
declare v_ws uuid := platform.current_workspace_id();
begin
  if v_ws is null then
    raise exception 'Anda belum memiliki workspace';
  end if;
  return query select * from platform.create_plan_order(v_ws, p_plan_id);
end $$;

create or replace function public.my_pending_order()
returns table (order_id uuid, code text, total numeric, created_at timestamptz, tier text)
language sql stable
set search_path = public, platform as $$
  select o.id, o.code, o.total, o.created_at, pl.tier
  from platform.orders o
  join platform.order_items oi on oi.order_id = o.id and oi.item_type = 'plan'
  join platform.plans pl on pl.id = oi.plan_id
  where o.workspace_id = platform.current_workspace_id()
    and o.status = 'pending'
  order by o.created_at desc
  limit 1;
$$;

create or replace function public.billing_info()
returns table (bank_name text, account_number text, account_holder text,
               instructions text, whatsapp text)
language sql stable
set search_path = public, platform as $$
  select bank_name, account_number, account_holder, instructions, whatsapp
  from platform.billing_settings limit 1;
$$;

grant execute on function public.my_subscription()   to authenticated;
grant execute on function public.available_plans()   to authenticated;
grant execute on function public.order_plan(uuid)    to authenticated;
grant execute on function public.my_pending_order()  to authenticated;
grant execute on function public.billing_info()      to authenticated;


-- ── 7. Verifikasi ──────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('platform.create_plan_order(uuid,uuid)') is null
     or to_regprocedure('platform.confirm_order_payment(uuid,text,text,text)') is null
     or to_regprocedure('platform.run_billing_maintenance()') is null then
    raise exception '0040 GAGAL: fungsi billing tidak lengkap';
  end if;
  if not exists (select 1 from platform.billing_settings) then
    raise exception '0040 GAGAL: billing_settings kosong';
  end if;
  raise notice '0040 OK — alur pesanan, konfirmasi, dan rantai kedaluwarsa siap';
end $$;
