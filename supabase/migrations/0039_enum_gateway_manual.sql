-- =============================================================================
-- 0039_enum_gateway_manual.sql — Metode bayar "transfer manual"
--
-- `platform.gateway` hanya memuat `midtrans | xendit`, sedangkan tahap pertama
-- monetisasi memakai transfer bank yang dikonfirmasi staf. Tanpa nilai ini,
-- `platform.payments` tidak punya tempat untuk mencatat pembayaran manual
-- (kolomnya NOT NULL dengan default 'midtrans' — mencatat transfer bank sebagai
-- "midtrans" akan mengotori data rekonsiliasi sejak hari pertama).
--
-- DIPISAH dari 0040 dengan sengaja: nilai enum baru tidak boleh DIPAKAI di
-- transaksi yang sama dengan penambahannya. Migrasi terpisah = transaksi
-- terpisah, sehingga 0040 bebas memakai 'manual'.
-- =============================================================================

alter type platform.gateway add value if not exists 'manual';
