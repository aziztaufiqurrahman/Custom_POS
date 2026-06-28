-- =============================================================================
-- 0002_rls.sql — Row Level Security untuk SEMUA tabel + view kasir.
--
-- Pendekatan menyembunyikan cost_price dari kasir (PRD §5):
--   * Tabel `products` (berisi cost_price) hanya bisa di-SELECT oleh admin.
--   * View `products_public` = semua kolom KECUALI cost_price, berjalan sebagai
--     owner (security_invoker = false) sehingga melewati RLS tabel dasar.
--     Klien kasir/POS HANYA membaca produk lewat view ini → cost_price tidak
--     pernah bisa diakses kasir di level database (bukan sekadar disembunyikan UI).
--   * Operasi penjualan/void/opname menulis via fungsi SECURITY DEFINER (RPC),
--     sehingga tabel transaksi/stok tidak butuh policy INSERT/UPDATE langsung.
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.products            enable row level security;
alter table public.stock_movements     enable row level security;
alter table public.stock_opnames       enable row level security;
alter table public.stock_opname_items  enable row level security;
alter table public.cash_sessions       enable row level security;
alter table public.bank_accounts       enable row level security;
alter table public.transactions        enable row level security;
alter table public.transaction_items   enable row level security;
alter table public.payments            enable row level security;
alter table public.store_settings      enable row level security;
alter table public.audit_logs          enable row level security;

-- profiles --------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (public.is_admin());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
-- (perubahan kolom role/permissions/is_active oleh non-admin dicegah trigger guard_profile_privilege)

-- categories ------------------------------------------------------------------
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to authenticated using (true);

drop policy if exists categories_write on public.categories;
create policy categories_write on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- products (tabel dasar — termasuk cost_price) --------------------------------
drop policy if exists products_select_admin on public.products;
create policy products_select_admin on public.products for select to authenticated
  using (public.is_admin());

drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
  with check (public.is_admin() or public.has_permission('product.create'));

drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
  using (public.is_admin() or public.has_permission('product.edit'))
  with check (public.is_admin() or public.has_permission('product.edit'));

drop policy if exists products_delete on public.products;
create policy products_delete on public.products for delete to authenticated
  using (public.is_admin() or public.has_permission('product.delete'));

-- View aman untuk kasir/POS (tanpa cost_price)
create or replace view public.products_public
with (security_invoker = false) as
select
  id, sku, barcode, name, description, category_id, image_url, image_urls,
  sell_price, unit, stock, min_stock, is_taxable, discount_type, discount_value,
  supplier, is_active, deleted_at, created_at, updated_at
from public.products;

revoke all on public.products_public from anon;
grant select on public.products_public to authenticated;

-- stock_movements -------------------------------------------------------------
drop policy if exists movements_select on public.stock_movements;
create policy movements_select on public.stock_movements for select to authenticated using (true);

drop policy if exists movements_write on public.stock_movements;
create policy movements_write on public.stock_movements for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- stock_opnames ---------------------------------------------------------------
drop policy if exists opnames_select on public.stock_opnames;
create policy opnames_select on public.stock_opnames for select to authenticated
  using (public.is_admin() or created_by = auth.uid());

drop policy if exists opnames_write on public.stock_opnames;
create policy opnames_write on public.stock_opnames for all to authenticated
  using (public.is_admin() or public.has_permission('stock.opname'))
  with check (public.is_admin() or public.has_permission('stock.opname'));

drop policy if exists opname_items_select on public.stock_opname_items;
create policy opname_items_select on public.stock_opname_items for select to authenticated
  using (exists (
    select 1 from public.stock_opnames o
    where o.id = opname_id and (public.is_admin() or o.created_by = auth.uid())
  ));

drop policy if exists opname_items_write on public.stock_opname_items;
create policy opname_items_write on public.stock_opname_items for all to authenticated
  using (public.is_admin() or public.has_permission('stock.opname'))
  with check (public.is_admin() or public.has_permission('stock.opname'));

-- cash_sessions ---------------------------------------------------------------
drop policy if exists sessions_select on public.cash_sessions;
create policy sessions_select on public.cash_sessions for select to authenticated
  using (public.is_admin() or cashier_id = auth.uid());

drop policy if exists sessions_insert on public.cash_sessions;
create policy sessions_insert on public.cash_sessions for insert to authenticated
  with check (cashier_id = auth.uid());

drop policy if exists sessions_update on public.cash_sessions;
create policy sessions_update on public.cash_sessions for update to authenticated
  using (public.is_admin() or cashier_id = auth.uid())
  with check (public.is_admin() or cashier_id = auth.uid());

-- bank_accounts ---------------------------------------------------------------
drop policy if exists banks_select on public.bank_accounts;
create policy banks_select on public.bank_accounts for select to authenticated using (true);

drop policy if exists banks_write on public.bank_accounts;
create policy banks_write on public.bank_accounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- transactions (tulis via RPC SECURITY DEFINER) -------------------------------
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions for select to authenticated
  using (public.is_admin() or cashier_id = auth.uid());

-- transaction_items -----------------------------------------------------------
drop policy if exists trx_items_select on public.transaction_items;
create policy trx_items_select on public.transaction_items for select to authenticated
  using (exists (
    select 1 from public.transactions t
    where t.id = transaction_id and (public.is_admin() or t.cashier_id = auth.uid())
  ));

-- payments --------------------------------------------------------------------
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (exists (
    select 1 from public.transactions t
    where t.id = transaction_id and (public.is_admin() or t.cashier_id = auth.uid())
  ));

-- store_settings --------------------------------------------------------------
drop policy if exists settings_select on public.store_settings;
create policy settings_select on public.store_settings for select to authenticated using (true);

drop policy if exists settings_write on public.store_settings;
create policy settings_write on public.store_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- audit_logs ------------------------------------------------------------------
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_admin());

drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (actor_id = auth.uid() or public.is_admin());
