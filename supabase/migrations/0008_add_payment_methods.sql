-- =============================================================================
-- 0008_add_payment_methods.sql — Tambah metode bayar online (Gofood, ShopeeFood).
-- Dijalankan TERPISAH dari fungsi yang memakainya (batasan ALTER TYPE ADD VALUE).
-- =============================================================================

alter type payment_method add value if not exists 'gofood';
alter type payment_method add value if not exists 'shopeefood';
