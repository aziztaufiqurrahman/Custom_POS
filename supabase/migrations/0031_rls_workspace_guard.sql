-- =============================================================================
-- 0031_rls_workspace_guard.sql — Isolasi antar-workspace
--
-- Rujukan: PRD §4C.5 · KEP-005 · RENCANA-MIGRASI-1B §2
--
-- INTI: policy cabang yang sudah ada TIDAK diubah isinya — hanya DIBUNGKUS
--       guard induk. Perilaku di dalam satu workspace tetap identik; isolasi
--       antar-workspace ditegakkan di lapisan data.
--
--   ((policy_lama) AND guard_workspace) OR platform.is_staff()
--
-- Karena AND mengikat lebih kuat dari OR, `is_master_admin()` TIDAK PERLU
-- diubah sama sekali: ia tetap "global" menurut fungsinya, tapi klausa AND
-- mengurungnya di workspace sendiri. Kontradiksi Aturan Emas ternyata semu.
--
-- ⚠️ TIGA KEBOCORAN YANG DITUTUP MIGRASI INI (temuan audit, di luar rencana awal):
--
--   1. has_branch_role() / has_branch_permission() diawali `is_master_admin() or …`.
--      Karena fungsi itu global, ia MEMOTONG seluruh pemeriksaan cabang di SETIAP
--      RPC SECURITY DEFINER. Master Admin workspace A lolos untuk cabang mana pun,
--      termasuk milik workspace B. Diperbaiki di §1 — satu perbaikan menutup
--      semua RPC sekaligus.
--
--   2. dashboard_kpis() & dashboard_analytics() adalah SECURITY DEFINER dengan
--      penjaga is_admin() saja. Saat p_branch_id NULL (dashboard konsolidasi),
--      keduanya MENJUMLAHKAN SELURUH transaksi LINTAS WORKSPACE. Diperbaiki di §2.
--
--   3. branch_seq_gaps() mengagregasi celah nomor urut seluruh cabang lintas
--      workspace. Diperbaiki di §2.
--
-- BONUS — bug yang sudah ada dan ikut diperbaiki:
--   dashboard_analytics.expenses_total memfilter cash_expenses.branch_id, padahal
--   kolom itu TIDAK PERNAH diisi kode (selalu '…c1', lihat KEP-009). Akibatnya
--   manajer cabang selain pusat melihat expenses_total = 0 padahal ada
--   pengeluaran. Kini di-join lewat cash_sessions — sekaligus menutup kebocoran
--   dan memperbaiki angkanya.
-- =============================================================================


-- ── 1. Helper cabang: tutup jalan pintas is_master_admin() ─────────────────
-- Master Admin tetap berkuasa penuh — tapi HANYA di dalam workspace-nya.
-- Ini satu-satunya perubahan perilaku pada helper, dan tidak berdampak apa pun
-- selama masih satu workspace.

create or replace function public.has_branch_role(b uuid, r branch_role)
returns boolean language sql stable security definer
set search_path = public, platform as $function$
  select (
    public.is_master_admin()
    and exists (select 1 from public.branches br
                where br.id = b
                  and br.workspace_id in (select platform.user_workspace_ids()))
  ) or exists (
    select 1 from public.branch_memberships
    where user_id = (select auth.uid()) and branch_id = b
      and role = r and is_active = true
  ) or platform.is_staff();
$function$;

create or replace function public.has_branch_permission(b uuid, perm text)
returns boolean language sql stable security definer
set search_path = public, platform as $function$
  select (
    public.is_master_admin()
    and exists (select 1 from public.branches br
                where br.id = b
                  and br.workspace_id in (select platform.user_workspace_ids()))
  ) or exists (
    select 1 from public.branch_memberships
    where user_id = (select auth.uid()) and branch_id = b
      and is_active = true and perm = any(permissions)
  ) or platform.is_staff();
$function$;

-- user_branch_ids() sudah aman: bersumber dari branch_memberships milik user.


-- ── 2. Fungsi agregat SECURITY DEFINER ─────────────────────────────────────
-- Diambil dari dump produksi, hanya ditambahi filter workspace.

CREATE OR REPLACE FUNCTION public.dashboard_kpis(p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        and (p_branch_id is null or branch_id = p_branch_id) and workspace_id in (select platform.user_workspace_ids())),
    'week', (select jsonb_build_object('revenue', coalesce(sum(grand_total),0), 'count', count(*))
      from public.transactions where status='completed' and created_at >= week_start
        and (p_branch_id is null or branch_id = p_branch_id) and workspace_id in (select platform.user_workspace_ids())),
    'month', (select jsonb_build_object('revenue', coalesce(sum(grand_total),0), 'count', count(*))
      from public.transactions where status='completed' and created_at >= month_start
        and (p_branch_id is null or branch_id = p_branch_id) and workspace_id in (select platform.user_workspace_ids())),
    'avg_month', (select coalesce(avg(grand_total),0)
      from public.transactions where status='completed' and created_at >= month_start
        and (p_branch_id is null or branch_id = p_branch_id) and workspace_id in (select platform.user_workspace_ids())),
    'gross_profit_month', (select coalesce(sum(ti.line_total - ti.qty*coalesce(p.cost_price,0)),0)
      from public.transaction_items ti
      join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at >= month_start
        and (p_branch_id is null or t.branch_id = p_branch_id) and t.workspace_id in (select platform.user_workspace_ids())
      left join public.products p on p.id=ti.product_id)
  );
end; $function$;


CREATE OR REPLACE FUNCTION public.dashboard_analytics(p_from timestamp with time zone, p_to timestamp with time zone, p_bucket text DEFAULT 'day'::text, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  j text := 'Asia/Jakarta';
  bucket text := case when p_bucket in ('day','week','month') then p_bucket else 'day' end;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  return jsonb_build_object(
    'revenue', (select coalesce(sum(grand_total),0) from public.transactions where status='completed' and created_at between p_from and p_to and (p_branch_id is null or branch_id=p_branch_id) and workspace_id in (select platform.user_workspace_ids())),
    'tx_count', (select count(*) from public.transactions where status='completed' and created_at between p_from and p_to and (p_branch_id is null or branch_id=p_branch_id) and workspace_id in (select platform.user_workspace_ids())),
    'items_sold', (select coalesce(sum(ti.qty),0) from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) and t.workspace_id in (select platform.user_workspace_ids())),
    'gross_profit', (select coalesce(sum(ti.line_total - ti.qty*coalesce(p.cost_price,0)),0) from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) and t.workspace_id in (select platform.user_workspace_ids()) left join public.products p on p.id=ti.product_id),
    'shipping_total', (select coalesce(sum(shipping_cost),0) from public.transactions where status='completed' and created_at between p_from and p_to and (p_branch_id is null or branch_id=p_branch_id) and workspace_id in (select platform.user_workspace_ids())),
    'expenses_total', (select coalesce(sum(ce.amount),0) from public.cash_expenses ce join public.cash_sessions cs on cs.id = ce.cash_session_id where ce.created_at between p_from and p_to and (p_branch_id is null or cs.branch_id=p_branch_id) and cs.workspace_id in (select platform.user_workspace_ids())),
    'by_method', (select coalesce(jsonb_object_agg(method, amt), '{}'::jsonb) from (select pm.method::text as method, sum(pm.amount) as amt from public.payments pm join public.transactions t on t.id=pm.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) and t.workspace_id in (select platform.user_workspace_ids()) group by pm.method) m),
    'by_bank', (select coalesce(jsonb_object_agg(bank, amt), '{}'::jsonb) from (select pm.bank::text as bank, sum(pm.amount) as amt from public.payments pm join public.transactions t on t.id=pm.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) and t.workspace_id in (select platform.user_workspace_ids()) where pm.method='transfer' and pm.bank is not null group by pm.bank) b),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('bucket', b, 'revenue', rev, 'tx_count', cnt) order by b), '[]'::jsonb) from (select (date_trunc(bucket, (created_at at time zone j)))::date as b, sum(grand_total) as rev, count(*) as cnt from public.transactions where status='completed' and created_at between p_from and p_to and (p_branch_id is null or branch_id=p_branch_id) and workspace_id in (select platform.user_workspace_ids()) group by 1) s),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', rev) order by rev desc), '[]'::jsonb) from (select ti.product_name_snapshot as name, sum(ti.qty) as qty, sum(ti.line_total) as rev from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) and t.workspace_id in (select platform.user_workspace_ids()) group by ti.product_name_snapshot order by rev desc limit 10) tp),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', cat, 'qty', qty, 'revenue', rev) order by rev desc), '[]'::jsonb) from (select coalesce(c.name,'Tanpa kategori') as cat, sum(ti.qty) as qty, sum(ti.line_total) as rev from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) and t.workspace_id in (select platform.user_workspace_ids()) left join public.products p on p.id=ti.product_id left join public.categories c on c.id=p.category_id group by 1 order by rev desc) bc),
    'by_cashier', (select coalesce(jsonb_agg(jsonb_build_object('cashier', name, 'revenue', rev, 'tx_count', cnt) order by rev desc), '[]'::jsonb) from (select coalesce(pr.full_name,'-') as name, sum(t.grand_total) as rev, count(*) as cnt from public.transactions t left join public.profiles pr on pr.id=t.cashier_id where t.status='completed' and t.created_at between p_from and p_to and (p_branch_id is null or t.branch_id=p_branch_id) and t.workspace_id in (select platform.user_workspace_ids()) group by 1 order by rev desc) bcs)
  );
end; $function$;


CREATE OR REPLACE FUNCTION public.branch_seq_gaps()
 RETURNS TABLE(branch_id uuid, branch_name text, max_seq bigint, trx_count bigint, missing bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_master_admin() then
    raise exception 'Hanya Master Admin';
  end if;
  return query
    select t.branch_id, b.name, max(t.seq_no), count(*)::bigint,
           (max(t.seq_no) - count(*))::bigint
    from public.transactions t
    join public.branches b on b.id = t.branch_id
    where b.workspace_id in (select platform.user_workspace_ids())
    group by t.branch_id, b.name
    having max(t.seq_no) <> count(*);
end $function$;


-- ── 3. Enam puluh policy dibungkus guard workspace ─────────────────────────
-- Dihasilkan secara mekanis dari docs/schema-dump/06-policies.csv agar isi
-- policy lama terbawa PERSIS, tanpa risiko salah ketik.
--
-- Bentuk guard per kelompok (KEP-005):
--   A/B/C  kolom workspace_id langsung        -> workspace_id in (...)
--   D      punya branch_id                    -> join ke branches
--   D'     cash_expenses                      -> join lewat cash_session_id
--   E      tabel anak                         -> join dua tingkat lewat induk
--   F      stock_transfers                    -> lewat from_branch_id
--   G      stock_movements / audit_logs       -> join (KEP-004, tanpa kolom)
--   H      profiles                           -> diri sendiri / sesama anggota

drop policy if exists "approvals_select" on public.approvals;
create policy "approvals_select" on public.approvals for SELECT to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.approvals.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "approvals_write" on public.approvals;
create policy "approvals_write" on public.approvals for ALL to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.approvals.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.approvals.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "audit_insert" on public.audit_logs;
create policy "audit_insert" on public.audit_logs for INSERT to authenticated
  with check ((((((actor_id = auth.uid()) OR is_admin())) and (((public.audit_logs.branch_id is not null and exists (select 1 from public.branches b where b.id = public.audit_logs.branch_id and b.workspace_id in (select platform.user_workspace_ids()))) or (public.audit_logs.branch_id is null and public.audit_logs.actor_id in (select user_id from platform.workspace_members where workspace_id in (select platform.user_workspace_ids())))))) or platform.is_staff()));

drop policy if exists "audit_select" on public.audit_logs;
create policy "audit_select" on public.audit_logs for SELECT to authenticated
  using ((((is_admin()) and (((public.audit_logs.branch_id is not null and exists (select 1 from public.branches b where b.id = public.audit_logs.branch_id and b.workspace_id in (select platform.user_workspace_ids()))) or (public.audit_logs.branch_id is null and public.audit_logs.actor_id in (select user_id from platform.workspace_members where workspace_id in (select platform.user_workspace_ids())))))) or platform.is_staff()));

drop policy if exists "banks_select" on public.bank_accounts;
create policy "banks_select" on public.bank_accounts for SELECT to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.bank_accounts.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "banks_write" on public.bank_accounts;
create policy "banks_write" on public.bank_accounts for ALL to authenticated
  using (((((is_master_admin() OR has_branch_permission(branch_id, 'settings.branch_edit'::text))) and (exists (select 1 from public.branches b where b.id = public.bank_accounts.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((is_master_admin() OR has_branch_permission(branch_id, 'settings.branch_edit'::text))) and (exists (select 1 from public.branches b where b.id = public.bank_accounts.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "memberships_select" on public.branch_memberships;
create policy "memberships_select" on public.branch_memberships for SELECT to authenticated
  using (((((is_master_admin() OR (user_id = auth.uid()))) and (exists (select 1 from public.branches b where b.id = public.branch_memberships.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "memberships_write" on public.branch_memberships;
create policy "memberships_write" on public.branch_memberships for ALL to authenticated
  using ((((is_master_admin()) and (exists (select 1 from public.branches b where b.id = public.branch_memberships.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check ((((is_master_admin()) and (exists (select 1 from public.branches b where b.id = public.branch_memberships.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "branch_products_select" on public.branch_products;
create policy "branch_products_select" on public.branch_products for SELECT to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (public.branch_products.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "branch_products_write" on public.branch_products;
create policy "branch_products_write" on public.branch_products for ALL to authenticated
  using (((((is_master_admin() OR has_branch_permission(branch_id, 'product.branch_edit'::text))) and (public.branch_products.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()))
  with check (((((is_master_admin() OR has_branch_permission(branch_id, 'product.branch_edit'::text))) and (public.branch_products.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "branch_settings_select" on public.branch_settings;
create policy "branch_settings_select" on public.branch_settings for SELECT to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.branch_settings.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "branch_settings_write" on public.branch_settings;
create policy "branch_settings_write" on public.branch_settings for ALL to authenticated
  using (((((is_master_admin() OR has_branch_permission(branch_id, 'settings.branch_edit'::text))) and (exists (select 1 from public.branches b where b.id = public.branch_settings.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((is_master_admin() OR has_branch_permission(branch_id, 'settings.branch_edit'::text))) and (exists (select 1 from public.branches b where b.id = public.branch_settings.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "branches_select" on public.branches;
create policy "branches_select" on public.branches for SELECT to authenticated
  using (((((is_master_admin() OR (id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (public.branches.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "branches_write" on public.branches;
create policy "branches_write" on public.branches for ALL to authenticated
  using ((((is_master_admin()) and (public.branches.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()))
  with check ((((is_master_admin()) and (public.branches.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "cash_expenses_delete" on public.cash_expenses;
create policy "cash_expenses_delete" on public.cash_expenses for DELETE to public
  using (((((is_admin() OR (EXISTS ( SELECT 1
   FROM cash_sessions s
  WHERE ((s.id = cash_expenses.cash_session_id) AND (s.cashier_id = auth.uid()) AND (s.status = 'open'::session_status)))))) and (exists (select 1 from public.cash_sessions s join public.branches b on b.id = s.branch_id where s.id = public.cash_expenses.cash_session_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "cash_expenses_insert" on public.cash_expenses;
create policy "cash_expenses_insert" on public.cash_expenses for INSERT to public
  with check ((((((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM cash_sessions s
  WHERE ((s.id = cash_expenses.cash_session_id) AND (s.status = 'open'::session_status) AND ((s.cashier_id = auth.uid()) OR is_admin())))))) and (exists (select 1 from public.cash_sessions s join public.branches b on b.id = s.branch_id where s.id = public.cash_expenses.cash_session_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "cash_expenses_select" on public.cash_expenses;
create policy "cash_expenses_select" on public.cash_expenses for SELECT to authenticated
  using (((((EXISTS ( SELECT 1
   FROM cash_sessions s
  WHERE ((s.id = cash_expenses.cash_session_id) AND (has_branch_role(s.branch_id, 'manager'::branch_role) OR (s.cashier_id = auth.uid())))))) and (exists (select 1 from public.cash_sessions s join public.branches b on b.id = s.branch_id where s.id = public.cash_expenses.cash_session_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "cash_movements_select" on public.cash_movements;
create policy "cash_movements_select" on public.cash_movements for SELECT to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.cash_movements.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "cash_movements_write" on public.cash_movements;
create policy "cash_movements_write" on public.cash_movements for ALL to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.cash_movements.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.cash_movements.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "sessions_insert" on public.cash_sessions;
create policy "sessions_insert" on public.cash_sessions for INSERT to authenticated
  with check ((((((cashier_id = auth.uid()) AND (is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids))))) and (public.cash_sessions.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "sessions_select" on public.cash_sessions;
create policy "sessions_select" on public.cash_sessions for SELECT to authenticated
  using (((((has_branch_role(branch_id, 'manager'::branch_role) OR (cashier_id = auth.uid()))) and (public.cash_sessions.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "sessions_update" on public.cash_sessions;
create policy "sessions_update" on public.cash_sessions for UPDATE to authenticated
  using (((((has_branch_role(branch_id, 'manager'::branch_role) OR (cashier_id = auth.uid()))) and (public.cash_sessions.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()))
  with check (((((has_branch_role(branch_id, 'manager'::branch_role) OR (cashier_id = auth.uid()))) and (public.cash_sessions.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "categories_select" on public.categories;
create policy "categories_select" on public.categories for SELECT to authenticated
  using ((((true) and (public.categories.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "categories_write" on public.categories;
create policy "categories_write" on public.categories for ALL to authenticated
  using ((((is_admin()) and (public.categories.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()))
  with check ((((is_admin()) and (public.categories.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "closures_select" on public.daily_closures;
create policy "closures_select" on public.daily_closures for SELECT to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.daily_closures.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "closures_write" on public.daily_closures;
create policy "closures_write" on public.daily_closures for ALL to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.daily_closures.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.daily_closures.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "receipt_items_all" on public.goods_receipt_items;
create policy "receipt_items_all" on public.goods_receipt_items for ALL to authenticated
  using (((((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_items.receipt_id) AND (is_master_admin() OR (g.branch_id IN ( SELECT user_branch_ids() AS user_branch_ids))))))) and (exists (select 1 from public.goods_receipts p join public.branches b on b.id = p.branch_id where p.id = public.goods_receipt_items.receipt_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((EXISTS ( SELECT 1
   FROM goods_receipts g
  WHERE ((g.id = goods_receipt_items.receipt_id) AND (is_master_admin() OR (g.branch_id IN ( SELECT user_branch_ids() AS user_branch_ids))))))) and (exists (select 1 from public.goods_receipts p join public.branches b on b.id = p.branch_id where p.id = public.goods_receipt_items.receipt_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "receipts_select" on public.goods_receipts;
create policy "receipts_select" on public.goods_receipts for SELECT to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.goods_receipts.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "receipts_write" on public.goods_receipts;
create policy "receipts_write" on public.goods_receipts for ALL to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.goods_receipts.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.goods_receipts.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "notifications_insert" on public.notifications;
create policy "notifications_insert" on public.notifications for INSERT to public
  with check (((((user_id = auth.uid())) and (public.notifications.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications for SELECT to public
  using (((((user_id = auth.uid())) and (public.notifications.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications for UPDATE to public
  using (((((user_id = auth.uid())) and (public.notifications.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()))
  with check (((((user_id = auth.uid())) and (public.notifications.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "org_settings_select" on public.org_settings;
create policy "org_settings_select" on public.org_settings for SELECT to authenticated
  using ((((true) and (public.org_settings.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "org_settings_write" on public.org_settings;
create policy "org_settings_write" on public.org_settings for ALL to authenticated
  using ((((is_master_admin()) and (public.org_settings.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()))
  with check ((((is_master_admin()) and (public.org_settings.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "payments_select" on public.payments;
create policy "payments_select" on public.payments for SELECT to authenticated
  using (((((EXISTS ( SELECT 1
   FROM transactions t
  WHERE ((t.id = payments.transaction_id) AND (has_branch_role(t.branch_id, 'manager'::branch_role) OR (t.cashier_id = auth.uid())))))) and (public.payments.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "products_delete" on public.products;
create policy "products_delete" on public.products for DELETE to authenticated
  using (((((is_admin() OR has_permission('product.delete'::text))) and (public.products.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "products_insert" on public.products;
create policy "products_insert" on public.products for INSERT to authenticated
  with check (((((is_admin() OR has_permission('product.create'::text))) and (public.products.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "products_select_admin" on public.products;
create policy "products_select_admin" on public.products for SELECT to authenticated
  using ((((is_admin()) and (public.products.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "products_update" on public.products;
create policy "products_update" on public.products for UPDATE to authenticated
  using (((((is_admin() OR has_permission('product.edit'::text))) and (public.products.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()))
  with check (((((is_admin() OR has_permission('product.edit'::text))) and (public.products.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "profiles_insert" on public.profiles;
create policy "profiles_insert" on public.profiles for INSERT to authenticated
  with check ((((is_admin()) and ((public.profiles.id = (select auth.uid()) or public.profiles.id in (select user_id from platform.workspace_members where workspace_id in (select platform.user_workspace_ids()))))) or platform.is_staff()));

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for SELECT to authenticated
  using ((((((id = auth.uid()) OR is_admin())) and ((public.profiles.id = (select auth.uid()) or public.profiles.id in (select user_id from platform.workspace_members where workspace_id in (select platform.user_workspace_ids()))))) or platform.is_staff()));

drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles for UPDATE to authenticated
  using ((((((id = auth.uid()) OR is_admin())) and ((public.profiles.id = (select auth.uid()) or public.profiles.id in (select user_id from platform.workspace_members where workspace_id in (select platform.user_workspace_ids()))))) or platform.is_staff()))
  with check ((((((id = auth.uid()) OR is_admin())) and ((public.profiles.id = (select auth.uid()) or public.profiles.id in (select user_id from platform.workspace_members where workspace_id in (select platform.user_workspace_ids()))))) or platform.is_staff()));

drop policy if exists "movements_select" on public.stock_movements;
create policy "movements_select" on public.stock_movements for SELECT to authenticated
  using ((((true) and (exists (select 1 from public.branches b where b.id = public.stock_movements.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "movements_write" on public.stock_movements;
create policy "movements_write" on public.stock_movements for ALL to authenticated
  using ((((is_admin()) and (exists (select 1 from public.branches b where b.id = public.stock_movements.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check ((((is_admin()) and (exists (select 1 from public.branches b where b.id = public.stock_movements.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "opname_items_select" on public.stock_opname_items;
create policy "opname_items_select" on public.stock_opname_items for SELECT to authenticated
  using (((((EXISTS ( SELECT 1
   FROM stock_opnames o
  WHERE ((o.id = stock_opname_items.opname_id) AND (is_admin() OR (o.created_by = auth.uid())))))) and (exists (select 1 from public.stock_opnames p join public.branches b on b.id = p.branch_id where p.id = public.stock_opname_items.opname_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "opname_items_write" on public.stock_opname_items;
create policy "opname_items_write" on public.stock_opname_items for ALL to authenticated
  using (((((is_admin() OR has_permission('stock.opname'::text))) and (exists (select 1 from public.stock_opnames p join public.branches b on b.id = p.branch_id where p.id = public.stock_opname_items.opname_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((is_admin() OR has_permission('stock.opname'::text))) and (exists (select 1 from public.stock_opnames p join public.branches b on b.id = p.branch_id where p.id = public.stock_opname_items.opname_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "opnames_select" on public.stock_opnames;
create policy "opnames_select" on public.stock_opnames for SELECT to authenticated
  using (((((is_admin() OR (created_by = auth.uid()))) and (exists (select 1 from public.branches b where b.id = public.stock_opnames.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "opnames_write" on public.stock_opnames;
create policy "opnames_write" on public.stock_opnames for ALL to authenticated
  using (((((is_admin() OR has_permission('stock.opname'::text))) and (exists (select 1 from public.branches b where b.id = public.stock_opnames.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((is_admin() OR has_permission('stock.opname'::text))) and (exists (select 1 from public.branches b where b.id = public.stock_opnames.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "transfer_items_all" on public.stock_transfer_items;
create policy "transfer_items_all" on public.stock_transfer_items for ALL to authenticated
  using (((((EXISTS ( SELECT 1
   FROM stock_transfers t
  WHERE ((t.id = stock_transfer_items.transfer_id) AND (is_master_admin() OR (t.from_branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)) OR (t.to_branch_id IN ( SELECT user_branch_ids() AS user_branch_ids))))))) and (exists (select 1 from public.stock_transfers p join public.branches b on b.id = p.from_branch_id where p.id = public.stock_transfer_items.transfer_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((EXISTS ( SELECT 1
   FROM stock_transfers t
  WHERE ((t.id = stock_transfer_items.transfer_id) AND (is_master_admin() OR (t.from_branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)) OR (t.to_branch_id IN ( SELECT user_branch_ids() AS user_branch_ids))))))) and (exists (select 1 from public.stock_transfers p join public.branches b on b.id = p.from_branch_id where p.id = public.stock_transfer_items.transfer_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "transfers_select" on public.stock_transfers;
create policy "transfers_select" on public.stock_transfers for SELECT to authenticated
  using (((((is_master_admin() OR (from_branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)) OR (to_branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.stock_transfers.from_branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "transfers_write" on public.stock_transfers;
create policy "transfers_write" on public.stock_transfers for ALL to authenticated
  using (((((is_master_admin() OR (from_branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)) OR (to_branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.stock_transfers.from_branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((is_master_admin() OR (from_branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)) OR (to_branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.stock_transfers.from_branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "settings_select" on public.store_settings;
create policy "settings_select" on public.store_settings for SELECT to authenticated
  using ((((true) and (public.store_settings.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "settings_write" on public.store_settings;
create policy "settings_write" on public.store_settings for ALL to authenticated
  using ((((is_admin()) and (public.store_settings.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()))
  with check ((((is_admin()) and (public.store_settings.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "suppliers_select" on public.suppliers;
create policy "suppliers_select" on public.suppliers for SELECT to authenticated
  using ((((true) and (public.suppliers.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "suppliers_write" on public.suppliers;
create policy "suppliers_write" on public.suppliers for ALL to authenticated
  using ((((is_master_admin()) and (public.suppliers.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()))
  with check ((((is_master_admin()) and (public.suppliers.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "trx_items_select" on public.transaction_items;
create policy "trx_items_select" on public.transaction_items for SELECT to authenticated
  using (((((EXISTS ( SELECT 1
   FROM transactions t
  WHERE ((t.id = transaction_items.transaction_id) AND (is_admin() OR (t.cashier_id = auth.uid())))))) and (public.transaction_items.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "transactions_select" on public.transactions;
create policy "transactions_select" on public.transactions for SELECT to authenticated
  using (((((has_branch_role(branch_id, 'manager'::branch_role) OR (cashier_id = auth.uid()))) and (public.transactions.workspace_id in (select platform.user_workspace_ids()))) or platform.is_staff()));

drop policy if exists "wastage_items_all" on public.wastage_items;
create policy "wastage_items_all" on public.wastage_items for ALL to authenticated
  using (((((EXISTS ( SELECT 1
   FROM wastages w
  WHERE ((w.id = wastage_items.wastage_id) AND (is_master_admin() OR (w.branch_id IN ( SELECT user_branch_ids() AS user_branch_ids))))))) and (exists (select 1 from public.wastages p join public.branches b on b.id = p.branch_id where p.id = public.wastage_items.wastage_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((EXISTS ( SELECT 1
   FROM wastages w
  WHERE ((w.id = wastage_items.wastage_id) AND (is_master_admin() OR (w.branch_id IN ( SELECT user_branch_ids() AS user_branch_ids))))))) and (exists (select 1 from public.wastages p join public.branches b on b.id = p.branch_id where p.id = public.wastage_items.wastage_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "wastages_select" on public.wastages;
create policy "wastages_select" on public.wastages for SELECT to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.wastages.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));

drop policy if exists "wastages_write" on public.wastages;
create policy "wastages_write" on public.wastages for ALL to authenticated
  using (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.wastages.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()))
  with check (((((is_master_admin() OR (branch_id IN ( SELECT user_branch_ids() AS user_branch_ids)))) and (exists (select 1 from public.branches b where b.id = public.wastages.branch_id and b.workspace_id in (select platform.user_workspace_ids())))) or platform.is_staff()));


-- ── 4. Verifikasi ──────────────────────────────────────────────────────────
do $$
declare v_total int; v_guarded int; v_leak text;
begin
  select count(*) into v_total from pg_policies where schemaname = 'public';
  select count(*) into v_guarded from pg_policies
   where schemaname = 'public'
     and (coalesce(qual,'') || coalesce(with_check,'')) like '%user_workspace_ids%';

  if v_total <> v_guarded then
    select string_agg(tablename || '.' || policyname, ', ') into v_leak
    from pg_policies where schemaname='public'
      and (coalesce(qual,'') || coalesce(with_check,'')) not like '%user_workspace_ids%';
    raise exception 'Policy tanpa guard workspace (% dari %): %',
      v_total - v_guarded, v_total, v_leak;
  end if;

  raise notice '0031 OK — % policy bergguard workspace, helper cabang diperbaiki', v_total;
end $$;
