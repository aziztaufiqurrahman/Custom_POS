-- =============================================================================
-- 0020_warehouse_rpc.sql — FASE 5: RPC operasi gudang (atomik, per cabang).
-- Penerimaan barang, barang rusak (wastage), transfer antar cabang (dua sisi).
-- Semua menulis branch_products + stock_movements + audit, mirror products
-- (Cabang Utama) untuk kompatibilitas. HPP (base_cost_price) global.
-- =============================================================================

-- ── Penerimaan Barang (Goods Receipt) ───────────────────────────────────────
create or replace function public.receive_goods(
  p_branch_id uuid, p_supplier_id uuid default null, p_note text default null,
  p_items jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_code text; v_seq int; v_datestr text; v_rid uuid;
  v_item jsonb; v_pid uuid; v_qty numeric(14,3); v_cost numeric(14,2); v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_master_admin() or public.has_branch_permission(p_branch_id, 'stock.receive')) then
    raise exception 'Tidak berwenang menerima barang di cabang ini';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Tidak ada item'; end if;

  v_datestr := to_char((now() at time zone 'Asia/Jakarta'), 'YYYYMMDD');
  select count(*) + 1 into v_seq from public.goods_receipts
    where branch_id = p_branch_id and code like 'GRN-' || v_datestr || '-%';
  v_code := 'GRN-' || v_datestr || '-' || lpad(v_seq::text, 4, '0');

  insert into public.goods_receipts (branch_id, code, supplier_id, status, received_by, received_at, note)
    values (p_branch_id, v_code, p_supplier_id, 'received', v_uid, now(), p_note)
    returning id into v_rid;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    v_cost := nullif(v_item->>'cost_price','')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah tidak valid'; end if;

    insert into public.goods_receipt_items (receipt_id, product_id, qty, cost_price)
      values (v_rid, v_pid, v_qty, v_cost);

    update public.branch_products set stock = stock + v_qty
      where branch_id = p_branch_id and product_id = v_pid returning stock into v_after;
    if not found then raise exception 'Produk tidak tersedia di cabang'; end if;

    if v_cost is not null then
      update public.products set base_cost_price = v_cost, cost_price = v_cost where id = v_pid;
    end if;
    if p_branch_id = v_main then
      update public.products set stock = v_after where id = v_pid;
    end if;

    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
      values (p_branch_id, v_pid, 'restock', v_qty, v_after, v_rid, coalesce(p_note, 'Penerimaan ' || v_code), v_uid);
  end loop;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (p_branch_id, v_uid, 'stock.receive', 'goods_receipt', v_rid, jsonb_build_object('code', v_code));

  return jsonb_build_object('id', v_rid, 'code', v_code);
end $$;
revoke all on function public.receive_goods(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.receive_goods(uuid, uuid, text, jsonb) to authenticated;

-- ── Barang Rusak (Wastage) ──────────────────────────────────────────────────
create or replace function public.record_wastage(
  p_branch_id uuid, p_reason text, p_photo_url text default null,
  p_items jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_code text; v_seq int; v_datestr text; v_wid uuid;
  v_item jsonb; v_pid uuid; v_qty numeric(14,3); v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_master_admin() or public.has_branch_permission(p_branch_id, 'stock.wastage')) then
    raise exception 'Tidak berwenang mencatat barang rusak di cabang ini';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Tidak ada item'; end if;

  v_datestr := to_char((now() at time zone 'Asia/Jakarta'), 'YYYYMMDD');
  select count(*) + 1 into v_seq from public.wastages
    where branch_id = p_branch_id and code like 'WST-' || v_datestr || '-%';
  v_code := 'WST-' || v_datestr || '-' || lpad(v_seq::text, 4, '0');

  insert into public.wastages (branch_id, code, status, reason, photo_url, created_by, approved_by)
    values (p_branch_id, v_code, 'approved', p_reason, p_photo_url, v_uid, v_uid)
    returning id into v_wid;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah tidak valid'; end if;

    insert into public.wastage_items (wastage_id, product_id, qty) values (v_wid, v_pid, v_qty);

    update public.branch_products set stock = stock - v_qty
      where branch_id = p_branch_id and product_id = v_pid returning stock into v_after;
    if not found then raise exception 'Produk tidak tersedia di cabang'; end if;
    if v_after < 0 then raise exception 'Stok tidak cukup untuk dibuang'; end if;
    if p_branch_id = v_main then
      update public.products set stock = v_after where id = v_pid;
    end if;

    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
      values (p_branch_id, v_pid, 'wastage', -v_qty, v_after, v_wid, coalesce(p_reason, 'Barang rusak ' || v_code), v_uid);
  end loop;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (p_branch_id, v_uid, 'stock.wastage', 'wastage', v_wid, jsonb_build_object('code', v_code, 'reason', p_reason));

  return jsonb_build_object('id', v_wid, 'code', v_code);
end $$;
revoke all on function public.record_wastage(uuid, text, text, jsonb) from public, anon;
grant execute on function public.record_wastage(uuid, text, text, jsonb) to authenticated;

-- ── Transfer antar cabang: buat draft ───────────────────────────────────────
create or replace function public.create_transfer(
  p_from_branch uuid, p_to_branch uuid, p_note text default null,
  p_items jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text; v_seq int; v_datestr text; v_tid uuid;
  v_item jsonb;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if p_from_branch = p_to_branch then raise exception 'Cabang asal & tujuan tidak boleh sama'; end if;
  if not (public.is_master_admin() or public.has_branch_permission(p_from_branch, 'stock.transfer_request')) then
    raise exception 'Tidak berwenang membuat transfer dari cabang ini';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Tidak ada item'; end if;

  v_datestr := to_char((now() at time zone 'Asia/Jakarta'), 'YYYYMMDD');
  select count(*) + 1 into v_seq from public.stock_transfers where code like 'TRF-' || v_datestr || '-%';
  v_code := 'TRF-' || v_datestr || '-' || lpad(v_seq::text, 4, '0');

  insert into public.stock_transfers (code, from_branch_id, to_branch_id, status, created_by, note)
    values (v_code, p_from_branch, p_to_branch, 'draft', v_uid, p_note) returning id into v_tid;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into public.stock_transfer_items (transfer_id, product_id, qty)
      values (v_tid, (v_item->>'product_id')::uuid, (v_item->>'qty')::numeric);
  end loop;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (p_from_branch, v_uid, 'transfer.create', 'stock_transfer', v_tid, jsonb_build_object('code', v_code));
  return jsonb_build_object('id', v_tid, 'code', v_code);
end $$;
revoke all on function public.create_transfer(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.create_transfer(uuid, uuid, text, jsonb) to authenticated;

-- ── Transfer: kirim (stok keluar dari cabang asal) ──────────────────────────
create or replace function public.dispatch_transfer(p_transfer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_t public.stock_transfers%rowtype;
  v_it record; v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_t from public.stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.status <> 'draft' then raise exception 'Transfer sudah diproses'; end if;
  if not (public.is_master_admin() or public.has_branch_permission(v_t.from_branch_id, 'stock.transfer_request')) then
    raise exception 'Tidak berwenang mengirim transfer ini';
  end if;

  for v_it in select product_id, qty from public.stock_transfer_items where transfer_id = p_transfer_id
  loop
    update public.branch_products set stock = stock - v_it.qty
      where branch_id = v_t.from_branch_id and product_id = v_it.product_id returning stock into v_after;
    if not found then raise exception 'Produk tidak ada di cabang asal'; end if;
    if v_after < 0 then raise exception 'Stok cabang asal tidak cukup'; end if;
    if v_t.from_branch_id = v_main then update public.products set stock = v_after where id = v_it.product_id; end if;
    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
      values (v_t.from_branch_id, v_it.product_id, 'transfer_out', -v_it.qty, v_after, p_transfer_id, 'Transfer keluar ' || v_t.code, v_uid);
  end loop;

  update public.stock_transfers set status = 'dispatched', dispatched_by = v_uid, dispatched_at = now() where id = p_transfer_id;
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_t.from_branch_id, v_uid, 'transfer.dispatch', 'stock_transfer', p_transfer_id, jsonb_build_object('code', v_t.code));
  return jsonb_build_object('status', 'dispatched');
end $$;
revoke all on function public.dispatch_transfer(uuid) from public, anon;
grant execute on function public.dispatch_transfer(uuid) to authenticated;

-- ── Transfer: terima (stok masuk ke cabang tujuan) ──────────────────────────
create or replace function public.receive_transfer(p_transfer_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_t public.stock_transfers%rowtype;
  v_it record; v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_t from public.stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.status <> 'dispatched' then raise exception 'Transfer belum dikirim / sudah diterima'; end if;
  if not (public.is_master_admin() or public.has_branch_permission(v_t.to_branch_id, 'stock.transfer_receive')) then
    raise exception 'Tidak berwenang menerima transfer ini';
  end if;

  for v_it in select product_id, qty from public.stock_transfer_items where transfer_id = p_transfer_id
  loop
    -- Pastikan baris katalog cabang tujuan ada.
    insert into public.branch_products (branch_id, product_id, price, min_stock, stock, is_active)
      select v_t.to_branch_id, v_it.product_id, coalesce(p.sell_price, 0), 0, 0, true
      from public.products p where p.id = v_it.product_id
      on conflict (branch_id, product_id) do nothing;

    update public.branch_products set stock = stock + v_it.qty
      where branch_id = v_t.to_branch_id and product_id = v_it.product_id returning stock into v_after;
    if v_t.to_branch_id = v_main then update public.products set stock = v_after where id = v_it.product_id; end if;
    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
      values (v_t.to_branch_id, v_it.product_id, 'transfer_in', v_it.qty, v_after, p_transfer_id, 'Transfer masuk ' || v_t.code, v_uid);
  end loop;

  update public.stock_transfers set status = 'received', received_by = v_uid, received_at = now() where id = p_transfer_id;
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_t.to_branch_id, v_uid, 'transfer.receive', 'stock_transfer', p_transfer_id, jsonb_build_object('code', v_t.code));
  return jsonb_build_object('status', 'received');
end $$;
revoke all on function public.receive_transfer(uuid) from public, anon;
grant execute on function public.receive_transfer(uuid) to authenticated;
