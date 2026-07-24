-- =============================================================================
-- 0021_sync_branch_products.sql — PEMANTAPAN: jaga konsistensi produk ↔ katalog
-- cabang. Memperbaiki bug: produk baru tidak muncul di kasir & perubahan harga
-- master tidak tercermin di POS (yang membaca branch_products).
--
-- Trigger (SECURITY DEFINER, invariant sistem):
--  * INSERT products  → buat branch_products untuk SEMUA cabang (stok awal hanya
--    ke Cabang Utama; cabang lain 0).
--  * UPDATE products  → sinkronkan price/min_stock/is_active ke branch_products
--    CABANG UTAMA (cabang lain mempertahankan override harga per-cabang).
-- =============================================================================

create or replace function public.sync_branch_products_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.branch_products (branch_id, product_id, price, min_stock, stock, is_active)
  select b.id, new.id, coalesce(new.sell_price, 0), coalesce(new.min_stock, 0),
         case when b.id = '00000000-0000-0000-0000-0000000000c1' then coalesce(new.stock, 0) else 0 end,
         coalesce(new.is_active, true)
  from public.branches b
  on conflict (branch_id, product_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_sync_bp_insert on public.products;
create trigger trg_sync_bp_insert after insert on public.products
  for each row execute function public.sync_branch_products_insert();

create or replace function public.sync_branch_products_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.branch_products
    set price = new.sell_price, min_stock = new.min_stock, is_active = new.is_active
  where product_id = new.id and branch_id = '00000000-0000-0000-0000-0000000000c1';
  return new;
end $$;

drop trigger if exists trg_sync_bp_update on public.products;
create trigger trg_sync_bp_update after update on public.products
  for each row
  when (old.sell_price is distinct from new.sell_price
     or old.min_stock is distinct from new.min_stock
     or old.is_active is distinct from new.is_active)
  execute function public.sync_branch_products_update();

-- Backfill: pastikan setiap produk punya baris branch_products di tiap cabang.
insert into public.branch_products (branch_id, product_id, price, min_stock, stock, is_active)
select b.id, p.id, coalesce(p.sell_price, 0), coalesce(p.min_stock, 0),
       case when b.id = '00000000-0000-0000-0000-0000000000c1' then coalesce(p.stock, 0) else 0 end,
       coalesce(p.is_active, true)
from public.products p
cross join public.branches b
where p.deleted_at is null
on conflict (branch_id, product_id) do nothing;

-- Selaraskan harga/min/aktif Cabang Utama dengan master (perbaiki drift lama).
update public.branch_products bp
set price = p.sell_price, min_stock = p.min_stock, is_active = p.is_active
from public.products p
where p.id = bp.product_id
  and bp.branch_id = '00000000-0000-0000-0000-0000000000c1'
  and p.deleted_at is null;
