-- =============================================================================
-- seed.sql — Data awal minimal. Aman dijalankan ulang (idempoten).
-- =============================================================================

-- store_settings: tepat satu baris
insert into public.store_settings (store_name, tax_enabled, tax_percent, tax_inclusive, trx_prefix, receipt_footer)
select 'Toko 8am Business', false, 11, false, 'TRX', 'Terima kasih telah berbelanja!'
where not exists (select 1 from public.store_settings);

-- Rekening bank (nomor/nama diisi nanti via Pengaturan)
insert into public.bank_accounts (bank, account_number, account_name, is_active)
values
  ('BNI', '', '', true),
  ('BCA', '', '', true),
  ('BSI', '', '', true)
on conflict (bank) do nothing;

-- Kategori contoh
insert into public.categories (name)
select 'Umum'
where not exists (select 1 from public.categories where name = 'Umum');

-- Produk contoh (hanya bila tabel produk masih kosong)
insert into public.products (sku, name, category_id, sell_price, cost_price, unit, stock, min_stock, is_taxable)
select * from (
  values
    ('SKU-0001', 'Air Mineral 600ml', (select id from public.categories where name = 'Umum' limit 1), 4000::numeric, 2500::numeric, 'pcs', 100::numeric, 10::numeric, false),
    ('SKU-0002', 'Roti Tawar',        (select id from public.categories where name = 'Umum' limit 1), 15000::numeric, 10000::numeric, 'pcs', 30::numeric, 5::numeric, false),
    ('SKU-0003', 'Kopi Sachet',       (select id from public.categories where name = 'Umum' limit 1), 2000::numeric, 1200::numeric, 'pcs', 200::numeric, 20::numeric, false)
) as v(sku, name, category_id, sell_price, cost_price, unit, stock, min_stock, is_taxable)
where not exists (select 1 from public.products);

-- Catat stok awal (initial) untuk produk seed yang baru dibuat
insert into public.stock_movements (product_id, type, qty_change, stock_after, note)
select p.id, 'initial', p.stock, p.stock, 'Stok awal (seed)'
from public.products p
where not exists (
  select 1 from public.stock_movements m
  where m.product_id = p.id and m.type = 'initial'
);
