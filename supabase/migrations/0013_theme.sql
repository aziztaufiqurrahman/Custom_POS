-- =============================================================================
-- 0013_theme.sql
-- Kustomisasi tampilan POS oleh admin: template warna, warna utama kustom,
-- dan kelengkungan sudut. Disimpan di store_settings (single store).
-- RLS store_settings sudah ada (select untuk terautentikasi, update admin),
-- jadi tidak perlu policy baru.
-- =============================================================================

alter table public.store_settings
  add column if not exists theme_preset text not null default 'classic',
  add column if not exists theme_primary text,
  add column if not exists theme_radius text not null default 'md';

-- Batasi nilai kelengkungan sudut agar konsisten dengan UI.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'store_settings_theme_radius_chk'
  ) then
    alter table public.store_settings
      add constraint store_settings_theme_radius_chk
      check (theme_radius in ('sharp', 'md', 'round'));
  end if;
end $$;

-- theme_primary boleh null (pakai warna bawaan template) atau hex #rrggbb.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'store_settings_theme_primary_chk'
  ) then
    alter table public.store_settings
      add constraint store_settings_theme_primary_chk
      check (theme_primary is null or theme_primary ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;
