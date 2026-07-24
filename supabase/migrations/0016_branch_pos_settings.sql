-- =============================================================================
-- 0016_branch_pos_settings.sql — FASE 2: Pengaturan POS per cabang.
--
-- 1) bank_accounts menjadi per cabang (branch_id + unique(branch_id,bank)).
-- 2) create_sale membaca pajak & prefix dari branch_settings (cabang shift),
--    fallback store_settings; menandai branch_id pada transactions/payments/
--    stock_movements. Behavior identik untuk satu cabang (data sudah di-seed).
--    Definisi lain (ongkir, GoFood/ShopeeFood) dipertahankan persis.
-- =============================================================================

-- ── 1. bank_accounts per cabang ─────────────────────────────────────────────
alter table public.bank_accounts
  add column if not exists branch_id uuid references public.branches(id);
update public.bank_accounts
  set branch_id = '00000000-0000-0000-0000-0000000000c1'::uuid
  where branch_id is null;
alter table public.bank_accounts alter column branch_id set not null;
alter table public.bank_accounts
  alter column branch_id set default '00000000-0000-0000-0000-0000000000c1'::uuid;

-- Ganti unik lama (bank) → unik per (cabang, bank).
alter table public.bank_accounts drop constraint if exists bank_accounts_bank_key;
create unique index if not exists uq_bank_branch_bank
  on public.bank_accounts(branch_id, bank);

-- RLS branch-scoped.
drop policy if exists banks_select on public.bank_accounts;
create policy banks_select on public.bank_accounts for select to authenticated
  using (public.is_master_admin() or branch_id in (select public.user_branch_ids()));
drop policy if exists banks_write on public.bank_accounts;
create policy banks_write on public.bank_accounts for all to authenticated
  using (public.is_master_admin() or public.has_branch_permission(branch_id, 'settings.branch_edit'))
  with check (public.is_master_admin() or public.has_branch_permission(branch_id, 'settings.branch_edit'));

-- ── 2. create_sale: pajak & prefix dari branch_settings ─────────────────────
create or replace function public.create_sale(
  p_cash_session_id uuid, p_items jsonb, p_payment jsonb,
  p_order_discount numeric default 0, p_customer_name text default null,
  p_customer_phone text default null, p_note text default null,
  p_shipping_cost numeric default 0)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_session public.cash_sessions%rowtype;
  v_settings public.store_settings%rowtype;
  v_bs public.branch_settings%rowtype;
  v_branch uuid;
  v_tax_enabled boolean;
  v_tax_percent numeric;
  v_tax_inclusive boolean;
  v_item jsonb;
  v_prod public.products%rowtype;
  v_qty numeric(14,3);
  v_line_disc numeric(14,2);
  v_line_total numeric(14,2);
  v_stock_after numeric(14,3);
  v_gross numeric(14,2) := 0;
  v_line_disc_total numeric(14,2) := 0;
  v_taxable_net numeric(14,2) := 0;
  v_tax_total numeric(14,2) := 0;
  v_discount_total numeric(14,2) := 0;
  v_grand numeric(14,2) := 0;
  v_ship numeric(14,2) := round(coalesce(p_shipping_cost, 0), 2);
  v_rate numeric := 0;
  v_trx_id uuid;
  v_code text;
  v_prefix text;
  v_datestr text;
  v_seq int;
  v_method payment_method;
  v_bank bank_code;
  v_cash_received numeric(14,2);
  v_change numeric(14,2) := 0;
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

  -- Pengaturan POS: utamakan branch_settings cabang shift, fallback store_settings.
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
  select count(*) + 1 into v_seq
    from public.transactions
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

    select * into v_prod from public.products
      where id = (v_item->>'product_id')::uuid and deleted_at is null for update;
    if not found then raise exception 'Produk tidak ditemukan / sudah dihapus'; end if;

    v_line_disc := round(coalesce((v_item->>'discount')::numeric, 0), 2);
    v_line_total := round(v_prod.sell_price * v_qty - v_line_disc, 2);
    if v_line_total < 0 then v_line_total := 0; end if;

    v_gross := v_gross + round(v_prod.sell_price * v_qty, 2);
    v_line_disc_total := v_line_disc_total + v_line_disc;
    if v_prod.is_taxable then v_taxable_net := v_taxable_net + v_line_total; end if;

    update public.products set stock = stock - v_qty
      where id = v_prod.id returning stock into v_stock_after;
    if v_stock_after < 0 then
      raise exception 'Stok % tidak cukup (tersisa %)', v_prod.name, v_prod.stock;
    end if;

    insert into public.transaction_items (
      transaction_id, product_id, product_name_snapshot, sku_snapshot,
      unit_price, qty, discount, line_total
    ) values (
      v_trx_id, v_prod.id, v_prod.name, v_prod.sku,
      v_prod.sell_price, v_qty, v_line_disc, v_line_total
    );

    insert into public.stock_movements (
      branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by
    ) values (
      v_branch, v_prod.id, 'sale', -v_qty, v_stock_after, v_trx_id, 'Penjualan ' || v_code, v_uid
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

  -- Ongkos kirim MENAMBAH grand_total → ikut jadi pendapatan & nominal bayar.
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

  return jsonb_build_object(
    'transaction_id', v_trx_id, 'code', v_code,
    'grand_total', v_grand, 'change_given', v_change
  );
end;
$function$;
