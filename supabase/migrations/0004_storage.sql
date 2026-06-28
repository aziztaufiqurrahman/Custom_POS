-- =============================================================================
-- 0004_storage.sql — Bucket Supabase Storage + policy.
--   product-images : foto produk (baca publik; tulis admin / kasir berizin)
--   qris           : gambar QRIS toko (baca publik; tulis admin)
--   store-logos    : logo toko (baca publik; tulis admin)
-- =============================================================================

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', true),
  ('qris', 'qris', true),
  ('store-logos', 'store-logos', true)
on conflict (id) do nothing;

-- Baca publik untuk ketiga bucket
drop policy if exists "storage_public_read" on storage.objects;
create policy "storage_public_read" on storage.objects for select
  using (bucket_id in ('product-images', 'qris', 'store-logos'));

-- Tulis foto produk: admin atau kasir dengan izin product.upload_image
drop policy if exists "storage_product_images_write" on storage.objects;
create policy "storage_product_images_write" on storage.objects for all to authenticated
  using (
    bucket_id = 'product-images'
    and (public.is_admin() or public.has_permission('product.upload_image'))
  )
  with check (
    bucket_id = 'product-images'
    and (public.is_admin() or public.has_permission('product.upload_image'))
  );

-- Tulis QRIS & logo: admin saja
drop policy if exists "storage_admin_write" on storage.objects;
create policy "storage_admin_write" on storage.objects for all to authenticated
  using (bucket_id in ('qris', 'store-logos') and public.is_admin())
  with check (bucket_id in ('qris', 'store-logos') and public.is_admin());
