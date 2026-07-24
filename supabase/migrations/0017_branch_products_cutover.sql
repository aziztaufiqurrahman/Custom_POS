-- =============================================================================
-- 0017_branch_products_cutover.sql — FASE 3: Stok & harga OPERASIONAL per cabang.
--
-- branch_products menjadi SUMBER KEBENARAN stok & harga per cabang. Semua RPC
-- stok (create_sale, void, refund, adjust, opname, restock) beroperasi pada
-- branch_products untuk cabang terkait. Untuk kompatibilitas single-branch,
-- products.stock DI-MIRROR hanya untuk Cabang Utama (agar halaman lama tetap
-- benar). HPP (base_cost_price/cost_price) tetap global.
-- =============================================================================

-- ── A. Re-sync branch_products Cabang Utama dari products (data kini otoritatif) ─
insert into public.branch_products (branch_id, product_id, price, min_stock, stock, is_active)
select '00000000-0000-0000-0000-0000000000c1'::uuid, id, sell_price, min_stock, stock, is_active
from public.products
where deleted_at is null
  and not exists (
    select 1 from public.branch_products bp
    where bp.branch_id = '00000000-0000-0000-0000-0000000000c1'::uuid and bp.product_id = products.id
  );

update public.branch_products bp
set stock = p.stock, price = p.sell_price, min_stock = p.min_stock, is_active = p.is_active
from public.products p
where p.id = bp.product_id
  and bp.branch_id = '00000000-0000-0000-0000-0000000000c1'::uuid;

-- ── B. View aman katalog per cabang (RLS branch-scoped + tanpa HPP) ──────────
-- security_invoker=true → RLS branch_products berlaku (cabang milik user saja);
-- join ke products_public (view owner, tanpa cost_price) → HPP tak pernah bocor.
drop view if exists public.branch_products_public;
create view public.branch_products_public with (security_invoker = true) as
select
  bp.id, bp.branch_id, bp.product_id, bp.price, bp.min_stock, bp.stock, bp.is_active,
  p.name, p.sku, p.barcode, p.unit, p.image_url, p.category_id, p.is_taxable, p.deleted_at
from public.branch_products bp
join public.products_public p on p.id = bp.product_id;
grant select on public.branch_products_public to authenticated;

-- ── C. create_sale → branch_products (harga & stok per cabang) ──────────────
create or replace function public.create_sale(
  p_cash_session_id uuid, p_items jsonb, p_payment jsonb,
  p_order_discount numeric default 0, p_customer_name text default null,
  p_customer_phone text default null, p_note text default null,
  p_shipping_cost numeric default 0)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_session public.cash_sessions%rowtype;
  v_settings public.store_settings%rowtype;
  v_bs public.branch_settings%rowtype;
  v_branch uuid;
  v_tax_enabled boolean; v_tax_percent numeric; v_tax_inclusive boolean;
  v_item jsonb;
  v_pid uuid; v_price numeric(14,2); v_pname text; v_psku text; v_ptax boolean;
  v_qty numeric(14,3);
  v_line_disc numeric(14,2); v_line_total numeric(14,2); v_stock_after numeric(14,3);
  v_gross numeric(14,2) := 0; v_line_disc_total numeric(14,2) := 0;
  v_taxable_net numeric(14,2) := 0; v_tax_total numeric(14,2) := 0;
  v_discount_total numeric(14,2) := 0; v_grand numeric(14,2) := 0;
  v_ship numeric(14,2) := round(coalesce(p_shipping_cost, 0), 2);
  v_rate numeric := 0;
  v_trx_id uuid; v_code text; v_prefix text; v_datestr text; v_seq int;
  v_method payment_method; v_bank bank_code;
  v_cash_received numeric(14,2); v_change numeric(14,2) := 0;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;
  if v_ship < 0 then v_ship := 0; end if;

  select * into v_session from public.cash_sessions where id = p_cash_session_id;
  if not found then raise exception 'Shift tidak ditemukan'; end if;
  if v_session.cashier_id <> v_uid and not public.is_admin() then
    raise exception 'Shift bukan milik Anda';
  end if;
  if v_session.status <> 'open' then raise exception 'Shift sudah ditutup'; end if;

  v_branch := v_session.branch_id;
  select * into v_bs from public.branch_settings where branch_id = v_branch;
  select * into v_settings from public.store_settings limit 1;
  v_tax_enabled   := coalesce(v_bs.tax_enabled, v_settings.tax_enabled, false);
  v_tax_percent   := coalesce(v_bs.tax_percent, v_settings.tax_percent, 0);
  v_tax_inclusive := coalesce(v_bs.tax_inclusive, v_settings.tax_inclusive, false);

  v_method := (p_payment->>'method')::payment_method;
  v_bank := nullif(p_payment->>'bank','')::bank_code;
  if v_method = 'transfer' and v_bank is null then
    raise exception 'Bank wajib dipilih untuk transfer';
  end if;

  v_prefix := coalesce(v_bs.trx_prefix, v_settings.trx_prefix, 'TRX');
  v_datestr := to_char((now() at time zone 'Asia/Jakarta'), 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext(v_branch::text || v_prefix || v_datestr));
  select count(*) + 1 into v_seq from public.transactions
    where branch_id = v_branch and code like v_prefix || '-' || v_datestr || '-%';
  v_code := v_prefix || '-' || v_datestr || '-' || lpad(v_seq::text, 4, '0');

  insert into public.transactions (
    branch_id, code, cashier_id, cash_session_id, customer_name, customer_phone,
    subtotal, discount_total, tax_total, grand_total, shipping_cost, status, note
  ) values (
    v_branch, v_code, v_uid, p_cash_session_id, p_customer_name, p_customer_phone,
    0, 0, 0, 0, v_ship, 'completed', p_note
  ) returning id into v_trx_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Qty tidak valid'; end if;
    v_pid := (v_item->>'product_id')::uuid;

    -- Harga & pajak dari katalog cabang; kunci baris branch_products.
    select bp.price, p.name, p.sku, p.is_taxable
      into v_price, v_pname, v_psku, v_ptax
      from public.branch_products bp
      join public.products p on p.id = bp.product_id
      where bp.branch_id = v_branch and bp.product_id = v_pid
        and bp.is_active and p.deleted_at is null
      for update of bp;
    if not found then raise exception 'Produk tidak tersedia di cabang ini'; end if;

    v_line_disc := round(coalesce((v_item->>'discount')::numeric, 0), 2);
    v_line_total := round(v_price * v_qty - v_line_disc, 2);
    if v_line_total < 0 then v_line_total := 0; end if;
    v_gross := v_gross + round(v_price * v_qty, 2);
    v_line_disc_total := v_line_disc_total + v_line_disc;
    if v_ptax then v_taxable_net := v_taxable_net + v_line_total; end if;

    update public.branch_products set stock = stock - v_qty
      where branch_id = v_branch and product_id = v_pid returning stock into v_stock_after;
    if v_stock_after < 0 then raise exception 'Stok % tidak cukup', v_pname; end if;
    if v_branch = v_main then
      update public.products set stock = v_stock_after where id = v_pid;
    end if;

    insert into public.transaction_items (
      transaction_id, product_id, product_name_snapshot, sku_snapshot,
      unit_price, qty, discount, line_total
    ) values (
      v_trx_id, v_pid, v_pname, v_psku, v_price, v_qty, v_line_disc, v_line_total
    );

    insert into public.stock_movements (
      branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by
    ) values (
      v_branch, v_pid, 'sale', -v_qty, v_stock_after, v_trx_id, 'Penjualan ' || v_code, v_uid
    );
  end loop;

  if v_tax_enabled then
    v_rate := v_tax_percent / 100.0;
    if v_tax_inclusive then
      v_tax_total := round(v_taxable_net - (v_taxable_net / (1 + v_rate)), 2);
    else
      v_tax_total := round(v_taxable_net * v_rate, 2);
    end if;
  end if;

  v_discount_total := round(v_line_disc_total + coalesce(p_order_discount, 0), 2);
  if v_tax_enabled and v_tax_inclusive then
    v_grand := round(v_gross - coalesce(p_order_discount, 0), 2);
  else
    v_grand := round(v_gross - v_discount_total + v_tax_total, 2);
  end if;
  if v_grand < 0 then v_grand := 0; end if;
  v_grand := round(v_grand + v_ship, 2);

  if v_method = 'cash' then
    v_cash_received := round(coalesce((p_payment->>'cash_received')::numeric, 0), 2);
    if v_cash_received < v_grand then raise exception 'Uang diterima kurang dari total'; end if;
    v_change := round(v_cash_received - v_grand, 2);
  end if;

  insert into public.payments (
    branch_id, transaction_id, method, bank, amount, cash_received, change_given, reference
  ) values (
    v_branch, v_trx_id, v_method, v_bank, v_grand,
    case when v_method = 'cash' then v_cash_received end,
    case when v_method = 'cash' then v_change end,
    nullif(p_payment->>'reference','')
  );

  update public.transactions set
    subtotal = v_gross, discount_total = v_discount_total,
    tax_total = v_tax_total, grand_total = v_grand
  where id = v_trx_id;

  update public.cash_sessions set
    total_cash       = total_cash       + case when v_method = 'cash'       then v_grand else 0 end,
    total_qris       = total_qris       + case when v_method = 'qris'       then v_grand else 0 end,
    total_transfer   = total_transfer   + case when v_method = 'transfer'   then v_grand else 0 end,
    total_gofood     = total_gofood     + case when v_method = 'gofood'     then v_grand else 0 end,
    total_shopeefood = total_shopeefood + case when v_method = 'shopeefood' then v_grand else 0 end
  where id = p_cash_session_id;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
  values (v_branch, v_uid, 'sale.create', 'transaction', v_trx_id,
          jsonb_build_object('code', v_code, 'grand_total', v_grand, 'method', v_method,
                             'shipping_cost', v_ship));

  return jsonb_build_object('transaction_id', v_trx_id, 'code', v_code,
                            'grand_total', v_grand, 'change_given', v_change);
end;
$function$;

-- ── D. void_sale → kembalikan stok ke branch_products ───────────────────────
create or replace function public.void_sale(p_transaction_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_trx public.transactions%rowtype;
  v_item record; v_pay record; v_stock_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_admin() or public.has_permission('transaction.void')) then
    raise exception 'Tidak berwenang melakukan void';
  end if;
  select * into v_trx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_trx.status <> 'completed' then raise exception 'Hanya transaksi selesai yang bisa di-void'; end if;

  for v_item in
    select product_id, qty from public.transaction_items
    where transaction_id = p_transaction_id and product_id is not null
  loop
    update public.branch_products set stock = stock + v_item.qty
      where branch_id = v_trx.branch_id and product_id = v_item.product_id
      returning stock into v_stock_after;
    if found then
      if v_trx.branch_id = v_main then
        update public.products set stock = v_stock_after where id = v_item.product_id;
      end if;
      insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
        values (v_trx.branch_id, v_item.product_id, 'void', v_item.qty, v_stock_after, p_transaction_id, 'Void ' || v_trx.code, v_uid);
    end if;
  end loop;

  if v_trx.cash_session_id is not null then
    for v_pay in select method, amount from public.payments where transaction_id = p_transaction_id
    loop
      update public.cash_sessions set
        total_cash       = total_cash       - case when v_pay.method = 'cash'       then v_pay.amount else 0 end,
        total_qris       = total_qris       - case when v_pay.method = 'qris'       then v_pay.amount else 0 end,
        total_transfer   = total_transfer   - case when v_pay.method = 'transfer'   then v_pay.amount else 0 end,
        total_gofood     = total_gofood     - case when v_pay.method = 'gofood'     then v_pay.amount else 0 end,
        total_shopeefood = total_shopeefood - case when v_pay.method = 'shopeefood' then v_pay.amount else 0 end
      where id = v_trx.cash_session_id;
    end loop;
  end if;

  update public.transactions set
    status = 'void', voided_by = v_uid, voided_at = now(),
    note = coalesce(note, '') || case when p_reason is not null then ' | Void: ' || p_reason else ' | Void' end
  where id = p_transaction_id;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
  values (v_trx.branch_id, v_uid, 'sale.void', 'transaction', p_transaction_id, jsonb_build_object('code', v_trx.code, 'reason', p_reason));
  return jsonb_build_object('transaction_id', p_transaction_id, 'status', 'void');
end; $function$;

-- ── E. refund_sale → kembalikan stok ke branch_products ─────────────────────
create or replace function public.refund_sale(p_transaction_id uuid, p_reason text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_trx public.transactions%rowtype;
  v_item record; v_pay record; v_stock_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_admin() or public.has_permission('transaction.refund')) then
    raise exception 'Tidak berwenang melakukan refund';
  end if;
  select * into v_trx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_trx.status <> 'completed' then raise exception 'Hanya transaksi selesai yang bisa di-refund'; end if;

  for v_item in
    select product_id, qty from public.transaction_items
    where transaction_id = p_transaction_id and product_id is not null
  loop
    update public.branch_products set stock = stock + v_item.qty
      where branch_id = v_trx.branch_id and product_id = v_item.product_id
      returning stock into v_stock_after;
    if found then
      if v_trx.branch_id = v_main then
        update public.products set stock = v_stock_after where id = v_item.product_id;
      end if;
      insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
        values (v_trx.branch_id, v_item.product_id, 'refund', v_item.qty, v_stock_after, p_transaction_id, 'Refund ' || v_trx.code, v_uid);
    end if;
  end loop;

  if v_trx.cash_session_id is not null then
    for v_pay in select method, amount from public.payments where transaction_id = p_transaction_id
    loop
      update public.cash_sessions set
        total_cash       = total_cash       - case when v_pay.method = 'cash'       then v_pay.amount else 0 end,
        total_qris       = total_qris       - case when v_pay.method = 'qris'       then v_pay.amount else 0 end,
        total_transfer   = total_transfer   - case when v_pay.method = 'transfer'   then v_pay.amount else 0 end,
        total_gofood     = total_gofood     - case when v_pay.method = 'gofood'     then v_pay.amount else 0 end,
        total_shopeefood = total_shopeefood - case when v_pay.method = 'shopeefood' then v_pay.amount else 0 end
      where id = v_trx.cash_session_id;
    end loop;
  end if;

  update public.transactions set
    status = 'refunded', voided_by = v_uid, voided_at = now(),
    note = coalesce(note, '') || case when p_reason is not null then ' | Refund: ' || p_reason else ' | Refund' end
  where id = p_transaction_id;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
  values (v_trx.branch_id, v_uid, 'sale.refund', 'transaction', p_transaction_id, jsonb_build_object('code', v_trx.code, 'reason', p_reason));
  return jsonb_build_object('transaction_id', p_transaction_id, 'status', 'refunded');
end; $function$;

-- ── F. adjust_stock (per cabang) ────────────────────────────────────────────
drop function if exists public.adjust_stock(uuid, numeric, text);
create or replace function public.adjust_stock(
  p_product_id uuid, p_new_qty numeric, p_note text default null,
  p_branch_id uuid default '00000000-0000-0000-0000-0000000000c1')
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_branch uuid := coalesce(p_branch_id, v_main);
  v_old numeric(14,3); v_delta numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_admin() or public.has_branch_permission(v_branch, 'stock.adjust')) then
    raise exception 'Tidak berwenang menyesuaikan stok';
  end if;
  if p_new_qty is null or p_new_qty < 0 then raise exception 'Nilai stok tidak valid'; end if;

  select stock into v_old from public.branch_products
    where branch_id = v_branch and product_id = p_product_id for update;
  if not found then raise exception 'Produk tidak tersedia di cabang'; end if;

  v_delta := p_new_qty - v_old;
  update public.branch_products set stock = p_new_qty
    where branch_id = v_branch and product_id = p_product_id;
  if v_branch = v_main then
    update public.products set stock = p_new_qty where id = p_product_id;
  end if;

  insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, note, created_by)
    values (v_branch, p_product_id, 'adjustment', v_delta, p_new_qty, coalesce(p_note, 'Koreksi stok'), v_uid);
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_branch, v_uid, 'stock.adjust', 'product', p_product_id, jsonb_build_object('from', v_old, 'to', p_new_qty));

  return jsonb_build_object('stock_after', p_new_qty, 'delta', v_delta);
end; $function$;
revoke all on function public.adjust_stock(uuid, numeric, text, uuid) from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, text, uuid) to authenticated;

-- ── G. restock_product (per cabang; HPP global) ─────────────────────────────
drop function if exists public.restock_product(uuid, numeric, numeric, text);
create or replace function public.restock_product(
  p_product_id uuid, p_qty numeric, p_new_cost numeric default null, p_note text default null,
  p_branch_id uuid default '00000000-0000-0000-0000-0000000000c1')
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_branch uuid := coalesce(p_branch_id, v_main);
  v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_admin() or public.has_branch_permission(v_branch, 'stock.receive')) then
    raise exception 'Tidak berwenang menambah stok';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;

  update public.branch_products set stock = stock + p_qty
    where branch_id = v_branch and product_id = p_product_id
    returning stock into v_after;
  if not found then raise exception 'Produk tidak tersedia di cabang'; end if;

  -- HPP global (base_cost_price + cost_price legacy).
  if p_new_cost is not null then
    update public.products set base_cost_price = p_new_cost, cost_price = p_new_cost
      where id = p_product_id;
  end if;
  if v_branch = v_main then
    update public.products set stock = v_after where id = p_product_id;
  end if;

  insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, note, created_by)
    values (v_branch, p_product_id, 'restock', p_qty, v_after, coalesce(p_note, 'Barang masuk'), v_uid);
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_branch, v_uid, 'stock.restock', 'product', p_product_id, jsonb_build_object('qty', p_qty, 'new_cost', p_new_cost));

  return jsonb_build_object('stock_after', v_after);
end; $function$;
revoke all on function public.restock_product(uuid, numeric, numeric, text, uuid) from public, anon;
grant execute on function public.restock_product(uuid, numeric, numeric, text, uuid) to authenticated;

-- ── H. complete_opname (per cabang, dari branch opname) ─────────────────────
create or replace function public.complete_opname(p_opname_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_op public.stock_opnames%rowtype;
  v_branch uuid;
  v_item jsonb; v_prod public.products%rowtype;
  v_sys numeric(14,3); v_phys numeric(14,3); v_diff numeric(14,3);
  v_reason text; v_changed int := 0;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_admin() or public.has_permission('stock.opname')) then
    raise exception 'Tidak berwenang melakukan stock opname';
  end if;

  select * into v_op from public.stock_opnames where id = p_opname_id for update;
  if not found then raise exception 'Sesi opname tidak ditemukan'; end if;
  if v_op.status <> 'draft' then raise exception 'Sesi opname sudah selesai'; end if;
  if not (public.is_admin() or v_op.created_by = v_uid) then
    raise exception 'Sesi opname bukan milik Anda';
  end if;
  v_branch := coalesce(v_op.branch_id, v_main);

  delete from public.stock_opname_items where opname_id = p_opname_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_prod from public.products
      where id = (v_item->>'product_id')::uuid and deleted_at is null;
    if not found then continue; end if;

    select stock into v_sys from public.branch_products
      where branch_id = v_branch and product_id = v_prod.id for update;
    if not found then continue; end if;

    v_phys := (v_item->>'physical_qty')::numeric;
    if v_phys is null or v_phys < 0 then raise exception 'Qty fisik tidak valid untuk %', v_prod.name; end if;
    v_diff := v_phys - v_sys;
    v_reason := nullif(btrim(coalesce(v_item->>'reason', '')), '');
    if v_diff <> 0 and v_reason is null then
      raise exception 'Alasan wajib untuk selisih pada %', v_prod.name;
    end if;

    insert into public.stock_opname_items (opname_id, product_id, system_qty, physical_qty, difference, reason)
      values (p_opname_id, v_prod.id, v_sys, v_phys, v_diff, v_reason);

    if v_diff <> 0 then
      update public.branch_products set stock = v_phys
        where branch_id = v_branch and product_id = v_prod.id;
      if v_branch = v_main then
        update public.products set stock = v_phys where id = v_prod.id;
      end if;
      insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
        values (v_branch, v_prod.id, 'opname', v_diff, v_phys, p_opname_id, coalesce(v_reason, 'Stock opname'), v_uid);
      v_changed := v_changed + 1;
    end if;
  end loop;

  update public.stock_opnames set status = 'completed', completed_at = now() where id = p_opname_id;
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_branch, v_uid, 'stock.opname_complete', 'stock_opname', p_opname_id, jsonb_build_object('changed', v_changed));

  return jsonb_build_object('changed', v_changed);
end; $function$;
