-- =============================================================================
-- 0014_theme_font.sql
-- Pilihan font aplikasi (bagian dari kustomisasi tampilan admin).
-- 'default' = Inter (body) + Manrope (heading), sesuai bawaan.
-- =============================================================================

alter table public.store_settings
  add column if not exists theme_font text not null default 'default';
