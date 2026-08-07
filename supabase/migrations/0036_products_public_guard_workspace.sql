-- =============================================================================
-- 0036_products_public_guard_workspace.sql
--
-- MENUTUP LUBANG ISOLASI TENANT pada view `public.products_public`.
--
-- Temuan: view ini dibuat dengan `security_invoker = false`, jadi ia berjalan
--         dengan hak PEMILIK view dan **menembus RLS `public.products`
--         sepenuhnya** — lalu definisinya `select … from products` tanpa
--         syarat apa pun.
--
-- Itu memang DISENGAJA untuk peran kasir: policy `products_select_admin`
-- mensyaratkan `is_admin()`, sehingga kasir tidak bisa membaca `products`
-- langsung. View inilah jalur POS mereka, sekaligus penyaring HPP
-- (`cost_price`/`base_cost_price` tidak ikut dipilih).
--
-- Masalahnya: tanpa filter workspace, begitu tenant KEDUA ada, kasir mana pun
-- bisa membaca SELURUH produk SELURUH workspace. Uji isolasi #1 gagal.
-- Saat ini belum bocor karena baru ada satu workspace — jadi ini waktu yang
-- tepat memperbaikinya, sebelum pelanggan pertama masuk.
--
-- Perbaikan: `security_invoker = false` DIPERTAHANKAN (kalau tidak, kasir
-- kehilangan akses produk dan POS mati), tetapi guard workspace ditanam
-- eksplisit di dalam view — persis pola 0031.
--
-- `branch_products_public` TIDAK diubah: ia `security_invoker = true`,
-- sehingga RLS `branch_products` sudah membatasinya per cabang.
-- =============================================================================

create or replace view public.products_public
with (security_invoker = false) as
  select
    id, sku, barcode, name, description, category_id,
    image_url, image_urls, sell_price, unit, stock, min_stock,
    is_taxable, discount_type, discount_value, supplier,
    is_active, deleted_at, created_at, updated_at
  from public.products
  where workspace_id in (select platform.user_workspace_ids())
     or platform.is_staff();

comment on view public.products_public is
  'Katalog produk tanpa HPP untuk peran kasir. security_invoker=false '
  '(sengaja) agar menembus products_select_admin, sehingga guard workspace '
  'WAJIB ditanam di dalam view ini — lihat 0036.';

grant select on public.products_public to authenticated;


-- ── Verifikasi ─────────────────────────────────────────────────────────────
do $$
begin
  if pg_get_viewdef('public.products_public'::regclass, true) not ilike '%user_workspace_ids%' then
    raise exception '0036 GAGAL: products_public masih tanpa guard workspace';
  end if;

  if pg_get_viewdef('public.products_public'::regclass, true) ilike '%cost_price%' then
    raise exception '0036 GAGAL: products_public membocorkan HPP ke kasir';
  end if;

  raise notice '0036 OK — products_public ber-guard workspace, HPP tetap tersembunyi';
end $$;
