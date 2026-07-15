-- =============================================================================
-- 0005_inventory_rpc.sql — RPC ATOMIK untuk inventory (SECURITY DEFINER).
--   restock_product : barang masuk (admin) + opsi update HPP
--   adjust_stock    : koreksi manual stok (admin)
--   complete_opname : sesuaikan stok dari hasil hitung fisik (admin/izin opname)
-- Semua mengubah products.stock + menulis stock_movements dalam satu transaksi.
-- =============================================================================

create or replace function public.restock_product(
  p_product_id uuid,
  p_qty numeric,
  p_new_cost numeric default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not public.is_admin() then raise exception 'Hanya admin yang boleh menambah stok'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;

  update public.products
    set stock = stock + p_qty,
        cost_price = coalesce(p_new_cost, cost_price)
    where id = p_product_id and deleted_at is null
    returning stock into v_after;
  if not found then raise exception 'Produk tidak ditemukan'; end if;

  insert into public.stock_movements (product_id, type, qty_change, stock_after, note, created_by)
    values (p_product_id, 'restock', p_qty, v_after, coalesce(p_note, 'Barang masuk'), v_uid);

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (v_uid, 'stock.restock', 'product', p_product_id,
            jsonb_build_object('qty', p_qty, 'new_cost', p_new_cost));

  return jsonb_build_object('stock_after', v_after);
end;
$$;

create or replace function public.adjust_stock(
  p_product_id uuid,
  p_new_qty numeric,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_old numeric(14,3);
  v_delta numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not public.is_admin() then raise exception 'Hanya admin yang boleh menyesuaikan stok'; end if;
  if p_new_qty is null or p_new_qty < 0 then raise exception 'Nilai stok tidak valid'; end if;

  select stock into v_old from public.products
    where id = p_product_id and deleted_at is null for update;
  if not found then raise exception 'Produk tidak ditemukan'; end if;

  v_delta := p_new_qty - v_old;
  update public.products set stock = p_new_qty where id = p_product_id;

  insert into public.stock_movements (product_id, type, qty_change, stock_after, note, created_by)
    values (p_product_id, 'adjustment', v_delta, p_new_qty, coalesce(p_note, 'Koreksi stok'), v_uid);

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (v_uid, 'stock.adjust', 'product', p_product_id,
            jsonb_build_object('from', v_old, 'to', p_new_qty));

  return jsonb_build_object('stock_after', p_new_qty, 'delta', v_delta);
end;
$$;

-- p_items: [{ "product_id": uuid, "physical_qty": number, "reason": text }]
create or replace function public.complete_opname(
  p_opname_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_op public.stock_opnames%rowtype;
  v_item jsonb;
  v_prod public.products%rowtype;
  v_sys numeric(14,3);
  v_phys numeric(14,3);
  v_diff numeric(14,3);
  v_reason text;
  v_changed int := 0;
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

  -- Tulis ulang item dari input final.
  delete from public.stock_opname_items where opname_id = p_opname_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_prod from public.products
      where id = (v_item->>'product_id')::uuid and deleted_at is null for update;
    if not found then continue; end if;

    v_sys := v_prod.stock;
    v_phys := (v_item->>'physical_qty')::numeric;
    if v_phys is null or v_phys < 0 then
      raise exception 'Qty fisik tidak valid untuk %', v_prod.name;
    end if;
    v_diff := v_phys - v_sys;
    v_reason := nullif(btrim(coalesce(v_item->>'reason', '')), '');
    if v_diff <> 0 and v_reason is null then
      raise exception 'Alasan wajib untuk selisih pada %', v_prod.name;
    end if;

    insert into public.stock_opname_items
      (opname_id, product_id, system_qty, physical_qty, difference, reason)
      values (p_opname_id, v_prod.id, v_sys, v_phys, v_diff, v_reason);

    if v_diff <> 0 then
      update public.products set stock = v_phys where id = v_prod.id;
      insert into public.stock_movements
        (product_id, type, qty_change, stock_after, reference_id, note, created_by)
        values (v_prod.id, 'opname', v_diff, v_phys, p_opname_id,
                coalesce(v_reason, 'Stock opname'), v_uid);
      v_changed := v_changed + 1;
    end if;
  end loop;

  update public.stock_opnames
    set status = 'completed', completed_at = now()
    where id = p_opname_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (v_uid, 'stock.opname_complete', 'stock_opname', p_opname_id,
            jsonb_build_object('changed', v_changed));

  return jsonb_build_object('changed', v_changed);
end;
$$;

-- Hak eksekusi
revoke all on function public.restock_product(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.restock_product(uuid, numeric, numeric, text) to authenticated;
revoke all on function public.adjust_stock(uuid, numeric, text) from public, anon;
grant execute on function public.adjust_stock(uuid, numeric, text) to authenticated;
revoke all on function public.complete_opname(uuid, jsonb) from public, anon;
grant execute on function public.complete_opname(uuid, jsonb) to authenticated;
