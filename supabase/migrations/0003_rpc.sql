-- =============================================================================
-- 0003_rpc.sql — Fungsi transaksi ATOMIK (SECURITY DEFINER).
--
-- create_sale: dalam SATU transaksi DB membuat transaction + transaction_items
--   (snapshot nama/SKU/harga) + payment, mengurangi stok, dan menulis
--   stock_movements. Bila ada kegagalan (mis. stok kurang) → seluruhnya rollback.
-- void_sale: mengembalikan stok + mencatat movement 'void' + audit.
--
-- Catatan harga: harga diambil dari DB (otoritatif), bukan dari klien, agar
-- tidak bisa dimanipulasi. grand_total = subtotal - discount_total + tax_total.
-- Pajak (PPN) dihitung hanya bila store_settings.tax_enabled = true.
-- =============================================================================

create or replace function public.create_sale(
  p_cash_session_id uuid,
  p_items jsonb,
  p_payment jsonb,
  p_order_discount numeric default 0,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.cash_sessions%rowtype;
  v_settings public.store_settings%rowtype;
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
  if v_uid is null then
    raise exception 'Tidak terautentikasi';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;

  -- Validasi shift -----------------------------------------------------------
  select * into v_session from public.cash_sessions where id = p_cash_session_id;
  if not found then
    raise exception 'Shift tidak ditemukan';
  end if;
  if v_session.cashier_id <> v_uid and not public.is_admin() then
    raise exception 'Shift bukan milik Anda';
  end if;
  if v_session.status <> 'open' then
    raise exception 'Shift sudah ditutup';
  end if;

  select * into v_settings from public.store_settings limit 1;

  -- Metode pembayaran ----------------------------------------------------------
  v_method := (p_payment->>'method')::payment_method;
  v_bank := nullif(p_payment->>'bank','')::bank_code;
  if v_method = 'transfer' and v_bank is null then
    raise exception 'Bank wajib dipilih untuk transfer';
  end if;

  -- Nomor transaksi (tanggal lokal Asia/Jakarta), serialize via advisory lock --
  v_prefix := coalesce(v_settings.trx_prefix, 'TRX');
  v_datestr := to_char((now() at time zone 'Asia/Jakarta'), 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext(v_prefix || v_datestr));
  select count(*) + 1 into v_seq
    from public.transactions
    where code like v_prefix || '-' || v_datestr || '-%';
  v_code := v_prefix || '-' || v_datestr || '-' || lpad(v_seq::text, 4, '0');

  -- Buat shell transaksi (total diisi setelah loop) ---------------------------
  insert into public.transactions (
    code, cashier_id, cash_session_id, customer_name, customer_phone,
    subtotal, discount_total, tax_total, grand_total, status, note
  ) values (
    v_code, v_uid, p_cash_session_id, p_customer_name, p_customer_phone,
    0, 0, 0, 0, 'completed', p_note
  ) returning id into v_trx_id;

  -- Loop item: kurangi stok, snapshot, catat movement ------------------------
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Qty tidak valid';
    end if;

    select * into v_prod from public.products
      where id = (v_item->>'product_id')::uuid and deleted_at is null
      for update;
    if not found then
      raise exception 'Produk tidak ditemukan / sudah dihapus';
    end if;

    v_line_disc := round(coalesce((v_item->>'discount')::numeric, 0), 2);
    v_line_total := round(v_prod.sell_price * v_qty - v_line_disc, 2);
    if v_line_total < 0 then
      v_line_total := 0;
    end if;

    v_gross := v_gross + round(v_prod.sell_price * v_qty, 2);
    v_line_disc_total := v_line_disc_total + v_line_disc;
    if v_prod.is_taxable then
      v_taxable_net := v_taxable_net + v_line_total;
    end if;

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
      product_id, type, qty_change, stock_after, reference_id, note, created_by
    ) values (
      v_prod.id, 'sale', -v_qty, v_stock_after, v_trx_id, 'Penjualan ' || v_code, v_uid
    );
  end loop;

  -- Pajak ----------------------------------------------------------------------
  if coalesce(v_settings.tax_enabled, false) then
    v_rate := coalesce(v_settings.tax_percent, 0) / 100.0;
    if coalesce(v_settings.tax_inclusive, false) then
      -- harga sudah termasuk pajak → pisahkan komponen pajaknya
      v_tax_total := round(v_taxable_net - (v_taxable_net / (1 + v_rate)), 2);
    else
      v_tax_total := round(v_taxable_net * v_rate, 2);
    end if;
  end if;

  v_discount_total := round(v_line_disc_total + coalesce(p_order_discount, 0), 2);
  if coalesce(v_settings.tax_enabled, false) and coalesce(v_settings.tax_inclusive, false) then
    -- pajak sudah di dalam harga; jangan ditambahkan lagi
    v_grand := round(v_gross - coalesce(p_order_discount, 0), 2);
  else
    v_grand := round(v_gross - v_discount_total + v_tax_total, 2);
  end if;
  if v_grand < 0 then
    v_grand := 0;
  end if;

  -- Pembayaran (MVP: tunggal; amount = grand_total otoritatif) ----------------
  if v_method = 'cash' then
    v_cash_received := round(coalesce((p_payment->>'cash_received')::numeric, 0), 2);
    if v_cash_received < v_grand then
      raise exception 'Uang diterima kurang dari total';
    end if;
    v_change := round(v_cash_received - v_grand, 2);
  end if;

  insert into public.payments (
    transaction_id, method, bank, amount, cash_received, change_given, reference
  ) values (
    v_trx_id, v_method, v_bank, v_grand,
    case when v_method = 'cash' then v_cash_received end,
    case when v_method = 'cash' then v_change end,
    nullif(p_payment->>'reference','')
  );

  -- Finalisasi total transaksi ------------------------------------------------
  update public.transactions set
    subtotal = v_gross,
    discount_total = v_discount_total,
    tax_total = v_tax_total,
    grand_total = v_grand
  where id = v_trx_id;

  -- Akumulasi ringkasan shift -------------------------------------------------
  update public.cash_sessions set
    total_cash     = total_cash     + case when v_method = 'cash'     then v_grand else 0 end,
    total_qris     = total_qris     + case when v_method = 'qris'     then v_grand else 0 end,
    total_transfer = total_transfer + case when v_method = 'transfer' then v_grand else 0 end
  where id = p_cash_session_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (v_uid, 'sale.create', 'transaction', v_trx_id,
          jsonb_build_object('code', v_code, 'grand_total', v_grand, 'method', v_method));

  return jsonb_build_object(
    'transaction_id', v_trx_id,
    'code', v_code,
    'grand_total', v_grand,
    'change_given', v_change
  );
end;
$$;

-- =============================================================================
-- void_sale — batalkan transaksi: kembalikan stok + catat movement + audit.
-- =============================================================================
create or replace function public.void_sale(
  p_transaction_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trx public.transactions%rowtype;
  v_item record;
  v_pay record;
  v_stock_after numeric(14,3);
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi';
  end if;
  if not (public.is_admin() or public.has_permission('transaction.void')) then
    raise exception 'Tidak berwenang melakukan void';
  end if;

  select * into v_trx from public.transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'Transaksi tidak ditemukan';
  end if;
  if v_trx.status <> 'completed' then
    raise exception 'Hanya transaksi selesai yang bisa di-void';
  end if;

  -- Kembalikan stok
  for v_item in
    select product_id, qty from public.transaction_items
    where transaction_id = p_transaction_id and product_id is not null
  loop
    update public.products set stock = stock + v_item.qty
      where id = v_item.product_id returning stock into v_stock_after;
    insert into public.stock_movements (
      product_id, type, qty_change, stock_after, reference_id, note, created_by
    ) values (
      v_item.product_id, 'void', v_item.qty, v_stock_after, p_transaction_id,
      'Void ' || v_trx.code, v_uid
    );
  end loop;

  -- Sesuaikan ringkasan shift (kurangi kembali)
  if v_trx.cash_session_id is not null then
    for v_pay in
      select method, amount from public.payments where transaction_id = p_transaction_id
    loop
      update public.cash_sessions set
        total_cash     = total_cash     - case when v_pay.method = 'cash'     then v_pay.amount else 0 end,
        total_qris     = total_qris     - case when v_pay.method = 'qris'     then v_pay.amount else 0 end,
        total_transfer = total_transfer - case when v_pay.method = 'transfer' then v_pay.amount else 0 end
      where id = v_trx.cash_session_id;
    end loop;
  end if;

  update public.transactions set
    status = 'void',
    voided_by = v_uid,
    voided_at = now(),
    note = coalesce(note, '') ||
           case when p_reason is not null then ' | Void: ' || p_reason else ' | Void' end
  where id = p_transaction_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (v_uid, 'sale.void', 'transaction', p_transaction_id,
          jsonb_build_object('code', v_trx.code, 'reason', p_reason));

  return jsonb_build_object('transaction_id', p_transaction_id, 'status', 'void');
end;
$$;

-- Hak eksekusi
revoke all on function public.create_sale(uuid, jsonb, jsonb, numeric, text, text, text) from public, anon;
grant execute on function public.create_sale(uuid, jsonb, jsonb, numeric, text, text, text) to authenticated;
revoke all on function public.void_sale(uuid, text) from public, anon;
grant execute on function public.void_sale(uuid, text) to authenticated;
