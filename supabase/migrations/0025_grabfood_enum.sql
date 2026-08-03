-- =============================================================================
-- 0025_grabfood_enum.sql — Tambah metode bayar GrabFood.
-- Dijalankan TERPISAH dari fungsi yang memakainya (batasan ALTER TYPE ADD VALUE),
-- sama seperti pola 0008. Jalankan 0025 dulu, baru 0026.
-- =============================================================================

alter type payment_method add value if not exists 'grabfood';
