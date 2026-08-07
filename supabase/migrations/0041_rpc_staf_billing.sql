-- =============================================================================
-- 0041_rpc_staf_billing.sql — Pembungkus publik untuk operator platform
--
-- Halaman konfirmasi pembayaran dipakai STAF PLATFORM (pemilik SaaS), bukan
-- tenant. Karena skema `platform` tidak diekspos ke API (lihat 0038), staf pun
-- butuh pembungkus di `public`.
--
-- Seluruh otorisasi tetap `platform.is_staff()` di dalam fungsi yang dibungkus —
-- pembungkus ini tidak melonggarkan apa pun.
-- =============================================================================

-- Daftar pesanan menunggu, lintas seluruh workspace. Staf saja.
create or replace function public.staff_pending_orders()
returns table (
  order_id     uuid,
  code         text,
  total        numeric,
  created_at   timestamptz,
  tier         text,
  billing_period text,
  workspace    text,
  pemesan      text
)
language sql stable
security definer
set search_path = public, platform as $$
  select o.id, o.code, o.total, o.created_at,
         pl.tier, pl.billing_period::text,
         w.name, u.email::text
  from platform.orders o
  join platform.order_items oi on oi.order_id = o.id and oi.item_type = 'plan'
  join platform.plans pl       on pl.id = oi.plan_id
  join platform.workspaces w   on w.id = o.workspace_id
  left join auth.users u       on u.id = o.user_id
  where o.status = 'pending'
    and platform.is_staff()          -- filter, bukan sekadar guard: non-staf dapat 0 baris
  order by o.created_at;
$$;

-- Riwayat pembayaran masuk. Staf saja.
create or replace function public.staff_recent_payments()
returns table (
  code text, workspace text, tier text, amount numeric,
  method text, gateway text, paid_at timestamptz
)
language sql stable
security definer
set search_path = public, platform as $$
  select o.code, w.name, pl.tier, pay.amount,
         pay.method, pay.gateway::text, pay.paid_at
  from platform.payments pay
  join platform.orders o       on o.id = pay.order_id
  join platform.workspaces w   on w.id = o.workspace_id
  join platform.order_items oi on oi.order_id = o.id and oi.item_type = 'plan'
  join platform.plans pl       on pl.id = oi.plan_id
  where pay.status = 'paid'
    and platform.is_staff()
  order by pay.paid_at desc
  limit 50;
$$;

-- Konfirmasi pembayaran transfer manual.
create or replace function public.staff_confirm_payment(
  p_order_id    uuid,
  p_gateway_ref text default null
)
returns uuid
language plpgsql
set search_path = public, platform as $$
begin
  -- Otorisasi ada di platform.confirm_order_payment(); sengaja tidak diulang
  -- di sini agar hanya ada SATU tempat yang menentukan siapa boleh apa.
  return platform.confirm_order_payment(p_order_id, 'manual', p_gateway_ref, 'transfer');
end $$;

grant execute on function public.staff_pending_orders()          to authenticated;
grant execute on function public.staff_recent_payments()         to authenticated;
grant execute on function public.staff_confirm_payment(uuid,text) to authenticated;

-- Apakah user saat ini staf platform? Dipakai UI untuk menampilkan menu.
create or replace function public.am_i_staff()
returns boolean
language sql stable
set search_path = public, platform as $$
  select platform.is_staff();
$$;
grant execute on function public.am_i_staff() to authenticated;


-- ── Pemeliharaan billing untuk penjadwal ───────────────────────────────────
-- Dipanggil Vercel Cron dengan service role. TIDAK diberikan ke `authenticated`:
-- fungsi ini bersifat lintas-workspace, jadi tidak ada tenant yang boleh
-- memicunya.
create or replace function public.run_billing_maintenance()
returns jsonb
language sql
security definer
set search_path = public, platform as $$
  select platform.run_billing_maintenance();
$$;

revoke all on function public.run_billing_maintenance() from public, authenticated, anon;
grant execute on function public.run_billing_maintenance() to service_role;


do $$
begin
  if to_regprocedure('public.staff_confirm_payment(uuid,text)') is null
     or to_regprocedure('public.staff_pending_orders()') is null
     or to_regprocedure('public.run_billing_maintenance()') is null then
    raise exception '0041 GAGAL: RPC staf tidak lengkap';
  end if;
  raise notice '0041 OK — operator platform dapat mengonfirmasi pembayaran';
end $$;
