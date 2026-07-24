-- =============================================================================
-- 0019_warehouse_enums.sql — FASE 5: nilai movement_type baru untuk gudang.
-- Dijalankan TERPISAH dari RPC (ALTER TYPE ADD VALUE tak boleh dipakai pada
-- transaksi yang sama saat nilainya digunakan).
-- =============================================================================
alter type movement_type add value if not exists 'transfer_out';
alter type movement_type add value if not exists 'transfer_in';
alter type movement_type add value if not exists 'wastage';
