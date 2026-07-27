-- =============================================================================
-- 0023_branch_autonomy.sql — PEROMBAKAN: cabang benar-benar OTONOM.
--
-- Prinsip baru (konfirmasi pemilik):
--  * Katalog `products` = global, HANYA master admin (pusat) yang boleh
--    membuat/mengedit/menghapus.
--  * Harga & stok per cabang berdiri sendiri di `branch_products`; harga master
--    (`products.sell_price`) TIDAK lagi disinkronkan ke cabang mana pun.
--  * Produk baru diarahkan ke cabang terpilih oleh kode (lihat createProduct);
--    trigger INSERT lama tetap ada demi kompatibilitas kode ter-deploy, namun
--    kode baru memangkas cabang yang tidak dipilih.
--  * Penonaktifan/penghapusan katalog dipropagasi ke SEMUA cabang (produk hilang
--    di mana pun) — satu-satunya sinkronisasi master → cabang yang tersisa.
--
-- ADITIF & NON-BREAKING: aman diulang (idempoten); tidak menghapus kolom/tabel.
-- Cabang Utama id tetap: 00000000-0000-0000-0000-0000000000c1
-- =============================================================================

-- ── 1. approvals.payload — simpan usulan (mis. harga baru per cabang) ────────
alter table public.approvals add column if not exists payload jsonb;

-- ── 2. Trigger UPDATE products: hentikan sinkron harga; hanya propagasi
--       penonaktifan/penghapusan katalog ke seluruh cabang. ──────────────────
create or replace function public.sync_branch_products_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Harga & stok per cabang TIDAK lagi ditarik dari master (cabang otonom).
  -- Bila produk katalog dinonaktifkan atau dihapus, matikan di SEMUA cabang.
  if (new.is_active = false) or (new.deleted_at is not null) then
    update public.branch_products set is_active = false
      where product_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_bp_update on public.products;
create trigger trg_sync_bp_update after update on public.products
  for each row
  when (old.is_active is distinct from new.is_active
     or old.deleted_at is distinct from new.deleted_at)
  execute function public.sync_branch_products_update();

-- ── 3. set_branch_price_stock — PUSAT set harga + stok awal per cabang ───────
-- Master admin only. Menetapkan harga & stok awal untuk satu produk pada satu
-- cabang. Perubahan stok dicatat ke ledger (stock_movements) agar tetap atomik
-- & auditable; stok Cabang Utama di-mirror ke products.stock (kompat lama).
create or replace function public.set_branch_price_stock(
  p_branch_id uuid,
  p_product_id uuid,
  p_price numeric,
  p_stock numeric,
  p_min_stock numeric default null,
  p_is_active boolean default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_old_stock numeric(14,3);
  v_delta numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not public.is_master_admin() then
    raise exception 'Hanya admin pusat yang dapat mengatur harga & stok cabang';
  end if;
  if p_price is null or p_price < 0 then raise exception 'Harga tidak valid'; end if;
  if p_stock is null or p_stock < 0 then raise exception 'Stok tidak valid'; end if;

  -- Pastikan produk ada & belum dihapus.
  if not exists (select 1 from public.products where id = p_product_id and deleted_at is null) then
    raise exception 'Produk tidak ditemukan';
  end if;

  select stock into v_old_stock from public.branch_products
    where branch_id = p_branch_id and product_id = p_product_id
    for update;

  if not found then
    -- Katalog cabang belum punya baris produk ini (mis. produk khusus cabang lain
    -- yang kini disediakan pusat) — buat barisnya.
    insert into public.branch_products (branch_id, product_id, price, min_stock, stock, is_active)
      values (p_branch_id, p_product_id, p_price, coalesce(p_min_stock, 0), 0, coalesce(p_is_active, true));
    v_old_stock := 0;
  end if;

  update public.branch_products set
    price = p_price,
    min_stock = coalesce(p_min_stock, min_stock),
    is_active = coalesce(p_is_active, is_active)
  where branch_id = p_branch_id and product_id = p_product_id;

  v_delta := p_stock - v_old_stock;
  if v_delta <> 0 then
    update public.branch_products set stock = p_stock
      where branch_id = p_branch_id and product_id = p_product_id;
    if p_branch_id = v_main then
      update public.products set stock = p_stock where id = p_product_id;
    end if;
    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, note, created_by)
      values (p_branch_id, p_product_id, 'adjustment', v_delta, p_stock, 'Set stok awal (pusat)', v_uid);
  end if;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (p_branch_id, v_uid, 'branch_product.set', 'product', p_product_id,
            jsonb_build_object('price', p_price, 'stock', p_stock, 'delta', v_delta));

  return jsonb_build_object('ok', true, 'stock', p_stock, 'delta', v_delta, 'price', p_price);
end;
$function$;

revoke all on function public.set_branch_price_stock(uuid, uuid, numeric, numeric, numeric, boolean) from public, anon;
grant execute on function public.set_branch_price_stock(uuid, uuid, numeric, numeric, numeric, boolean) to authenticated;

-- ── 4. apply_price_override — terapkan usulan harga cabang yang DISETUJUI ─────
-- Dipanggil oleh alur persetujuan. Mengunci ke payload approval (product_id,
-- new_price) dan cabang approval. Master admin ATAU approver cabang boleh; tetapi
-- pemohon tidak boleh = penyetuju divalidasi di layer server (decideApproval).
create or replace function public.apply_price_override(p_approval_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_appr public.approvals%rowtype;
  v_pid uuid;
  v_new_price numeric(14,2);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;

  select * into v_appr from public.approvals where id = p_approval_id for update;
  if not found then raise exception 'Permintaan tidak ditemukan'; end if;
  if v_appr.request_type <> 'price_override' then raise exception 'Jenis permintaan bukan perubahan harga'; end if;

  -- Otoritas: master admin atau manajer/approval.grant di cabang tsb.
  if not public.has_branch_role(v_appr.branch_id, 'manager')
     and not public.has_branch_permission(v_appr.branch_id, 'approval.grant') then
    raise exception 'Tidak berwenang menyetujui perubahan harga';
  end if;

  v_pid := (v_appr.payload->>'product_id')::uuid;
  v_new_price := (v_appr.payload->>'new_price')::numeric;
  if v_pid is null or v_new_price is null or v_new_price < 0 then
    raise exception 'Data usulan harga tidak valid';
  end if;

  update public.branch_products set price = v_new_price
    where branch_id = v_appr.branch_id and product_id = v_pid;
  if not found then raise exception 'Produk tidak tersedia di cabang'; end if;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_appr.branch_id, v_uid, 'branch_product.price_override', 'product', v_pid,
            jsonb_build_object('new_price', v_new_price, 'approval_id', p_approval_id));

  return jsonb_build_object('ok', true, 'price', v_new_price);
end;
$function$;

revoke all on function public.apply_price_override(uuid) from public, anon;
grant execute on function public.apply_price_override(uuid) to authenticated;
