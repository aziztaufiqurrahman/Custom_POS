-- =============================================================================
-- 0022_dashboard_branch_alert.sql
--  * Dashboard sadar-cabang: dashboard_kpis & dashboard_analytics menerima
--    p_branch_id (null = konsolidasi semua cabang).
--  * org_settings.alert_whatsapp: nomor WhatsApp penerima peringatan anti-fraud.
-- =============================================================================

alter table public.org_settings
  add column if not exists alert_whatsapp text;

-- ── dashboard_kpis(p_branch_id) ─────────────────────────────────────────────
drop function if exists public.dashboard_kpis();
create or replace function public.dashboard_kpis(p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  j text := 'Asia/Jakarta';
  today_start timestamptz; week_start timestamptz; month_start timestamptz;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  today_start := (date_trunc('day', now() at time zone j)) at time zone j;
  week_start := (date_trunc('week', now() at time zone j)) at time zone j;
  month_start := (date_trunc('month', now() at time zone j)) at time zone j;

  return jsonb_build_object(
    'today', (select jsonb_build_object('revenue', coalesce(sum(grand_total),0), 'count', count(*))
      from public.transactions where status='completed' and created_at >= today_start
        and (p_branch_id is null or branch_id = p_branch_id)),
    'week', (select jsonb_build_object('revenue', coalesce(sum(grand_total),0), 'count', count(*))
      from public.transactions where status='completed' and created_at >= week_start
        and (p_branch_id is null or branch_id = p_branch_id)),
    'month', (select jsonb_build_object('revenue', coalesce(sum(grand_total),0), 'count', count(*))
      from public.transactions where status='completed' and created_at >= month_start
        and (p_branch_id is null or branch_id = p_branch_id)),
    'avg_month', (select coalesce(avg(grand_total),0)
      from public.transactions where status='completed' and created_at >= month_start
        and (p_branch_id is null or branch_id = p_branch_id)),
    'gross_profit_month', (select coalesce(sum(ti.line_total - ti.qty*coalesce(p.cost_price,0)),0)
      from public.transaction_items ti
      join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at >= month_start
        and (p_branch_id is null or t.branch_id = p_branch_id)
      left join public.products p on p.id=ti.product_id)
  );
end; $function$;
revoke all on function public.dashboard_kpis(uuid) from public, anon;
grant execute on function public.dashboard_kpis(uuid) to authenticated;

-- ── dashboard_analytics(p_from, p_to, p_bucket, p_branch_id) ────────────────
drop function if exists public.dashboard_analytics(timestamptz, timestamptz, text);
create or replace function public.dashboard_analytics(
  p_from timestamptz, p_to timestamptz, p_bucket text default 'day', p_branch_id uuid default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  j text := 'Asia/Jakarta';
  bucket text := case when p_bucket in ('day','week','month') then p_bucket else 'day' end;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  return jsonb_build_object(
    'revenue', (select coalesce(sum(grand_total),0) from public.transactions where status='completed' and created_at between p_from and p_to and (p_branch_id is null or branch_id=p_branch_id)),
    'tx_count', (select count(*) from public.transactions where status='completed' and created_at between p_from and p_to and (p_branch_id is null or branch_id=p_branch_id)),
    'items_sold', (select coalesce(sum(ti.qty),0) from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id)),
    'gross_profit', (select coalesce(sum(ti.line_total - ti.qty*coalesce(p.cost_price,0)),0) from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) left join public.products p on p.id=ti.product_id),
    'shipping_total', (select coalesce(sum(shipping_cost),0) from public.transactions where status='completed' and created_at between p_from and p_to and (p_branch_id is null or branch_id=p_branch_id)),
    'expenses_total', (select coalesce(sum(amount),0) from public.cash_expenses where created_at between p_from and p_to and (p_branch_id is null or branch_id=p_branch_id)),
    'by_method', (select coalesce(jsonb_object_agg(method, amt), '{}'::jsonb) from (select pm.method::text as method, sum(pm.amount) as amt from public.payments pm join public.transactions t on t.id=pm.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) group by pm.method) m),
    'by_bank', (select coalesce(jsonb_object_agg(bank, amt), '{}'::jsonb) from (select pm.bank::text as bank, sum(pm.amount) as amt from public.payments pm join public.transactions t on t.id=pm.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) where pm.method='transfer' and pm.bank is not null group by pm.bank) b),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('bucket', b, 'revenue', rev, 'tx_count', cnt) order by b), '[]'::jsonb) from (select (date_trunc(bucket, (created_at at time zone j)))::date as b, sum(grand_total) as rev, count(*) as cnt from public.transactions where status='completed' and created_at between p_from and p_to and (p_branch_id is null or branch_id=p_branch_id) group by 1) s),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', rev) order by rev desc), '[]'::jsonb) from (select ti.product_name_snapshot as name, sum(ti.qty) as qty, sum(ti.line_total) as rev from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) group by ti.product_name_snapshot order by rev desc limit 10) tp),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', cat, 'qty', qty, 'revenue', rev) order by rev desc), '[]'::jsonb) from (select coalesce(c.name,'Tanpa kategori') as cat, sum(ti.qty) as qty, sum(ti.line_total) as rev from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) left join public.products p on p.id=ti.product_id left join public.categories c on c.id=p.category_id group by 1 order by rev desc) bc),
    'by_cashier', (select coalesce(jsonb_agg(jsonb_build_object('cashier', name, 'revenue', rev, 'tx_count', cnt) order by rev desc), '[]'::jsonb) from (select coalesce(pr.full_name,'-') as name, sum(t.grand_total) as rev, count(*) as cnt from public.transactions t left join public.profiles pr on pr.id=t.cashier_id where t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) group by 1 order by rev desc) bcs)
  );
end; $function$;
revoke all on function public.dashboard_analytics(timestamptz, timestamptz, text, uuid) from public, anon;
grant execute on function public.dashboard_analytics(timestamptz, timestamptz, text, uuid) to authenticated;
