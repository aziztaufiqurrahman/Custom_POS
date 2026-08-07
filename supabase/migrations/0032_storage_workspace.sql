-- =============================================================================
-- 0032_storage_workspace.sql — Isolasi berkas antar-workspace
--
-- Rujukan: KEP-007 · KEP-010 poin 3 · RENCANA-MIGRASI-1B §2
--
-- MASALAH (terverifikasi di produksi, docs/schema-dump/06-policies.csv):
--   storage_admin_write dan storage_product_images_write keduanya `FOR ALL`
--   (mencakup UPDATE dan DELETE) dan HANYA memeriksa bucket_id + peran v1
--   (is_admin / has_permission). TIDAK ADA batasan path sama sekali.
--
--   Akibatnya begitu ada workspace kedua: admin UMKM A bisa MENIMPA gambar
--   QRIS milik UMKM B. Bucket baca-publik dan gambar itu tampil di struk —
--   sehingga pelanggan UMKM B mentransfer ke rekening UMKM A.
--   Kasir mana pun dengan izin product.upload_image juga bisa menghapus
--   seluruh foto produk semua UMKM.
--
-- SOLUSI: path diberi prefiks workspace_id, policy mengunci folder pertama.
--   <workspace_id>/products/<uuid>.jpg
--   <workspace_id>/store/qris-<uuid>.jpg
--   <workspace_id>/store/logo-<uuid>.jpg
--
-- Satu perubahan menutup dua hal sekaligus: kebocoran tulis DAN atribusi
-- storage_mb per workspace (sum ukuran objek per folder pertama).
--
-- ⚠️ WAJIB dibarengi patch 3 komponen uploader. Tanpa itu, upload baru masuk
--    tanpa prefiks dan akan DITOLAK policy ini.
-- =============================================================================

-- ── 1. Helper: workspace dari path + izin tulis ────────────────────────────
-- Folder pertama harus UUID workspace yang sah. Bila bukan UUID (objek lama
-- tanpa prefiks), kembalikan NULL sehingga policy menolaknya.
create or replace function public.storage_workspace_of(object_name text)
returns uuid language plpgsql immutable as $$
declare v text;
begin
  v := (storage.foldername(object_name))[1];
  if v is null or v !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    return null;
  end if;
  return v::uuid;
exception when others then
  return null;
end $$;

-- Izin tulis berkas: anggota workspace yang punya izin `perm` di SALAH SATU
-- cabang workspace itu, ATAU master admin workspace itu, ATAU staff internal.
-- Storage tidak punya konteks cabang, jadi izin diperiksa pada tingkat workspace.
create or replace function public.can_write_workspace_storage(ws uuid, perm text)
returns boolean language sql stable security definer
set search_path = public, platform as $$
  select ws is not null and (
    platform.is_staff()
    or (
      ws in (select platform.user_workspace_ids())
      and (
        public.is_master_admin()
        or exists (
          select 1
          from public.branch_memberships m
          join public.branches b on b.id = m.branch_id
          where m.user_id = (select auth.uid())
            and m.is_active
            and b.workspace_id = ws
            and (perm is null or perm = any(m.permissions))
        )
      )
    )
  );
$$;

grant execute on function public.storage_workspace_of(text)            to authenticated;
grant execute on function public.can_write_workspace_storage(uuid,text) to authenticated;


-- ── 2. Policy baru ─────────────────────────────────────────────────────────
-- storage_public_read DIPERTAHANKAN apa adanya: struk publik & QRIS memang
-- harus terbaca tanpa login. Nama objek memakai UUID acak sehingga tidak
-- bisa ditebak. Yang ditutup di sini adalah TULIS, bukan baca.

drop policy if exists "storage_product_images_write" on storage.objects;
drop policy if exists "storage_admin_write"          on storage.objects;

-- Foto produk: butuh izin product.upload_image di workspace tersebut.
create policy "storage_products_write_ws" on storage.objects for all to authenticated
using (
  bucket_id = 'product-images'
  and public.can_write_workspace_storage(
        public.storage_workspace_of(name), 'product.upload_image')
)
with check (
  bucket_id = 'product-images'
  and public.can_write_workspace_storage(
        public.storage_workspace_of(name), 'product.upload_image')
);

-- QRIS & logo: identitas pembayaran. Hanya master admin / pengelola workspace.
create policy "storage_brand_write_ws" on storage.objects for all to authenticated
using (
  bucket_id in ('qris','store-logos')
  and public.can_write_workspace_storage(
        public.storage_workspace_of(name), 'settings.branch_edit')
)
with check (
  bucket_id in ('qris','store-logos')
  and public.can_write_workspace_storage(
        public.storage_workspace_of(name), 'settings.branch_edit')
);


-- ── 3. Verifikasi ──────────────────────────────────────────────────────────
do $$
declare v_old int; v_new int;
begin
  select count(*) into v_old from pg_policies
   where schemaname = 'storage'
     and policyname in ('storage_product_images_write','storage_admin_write');
  select count(*) into v_new from pg_policies
   where schemaname = 'storage'
     and policyname in ('storage_products_write_ws','storage_brand_write_ws');

  if v_old > 0 then
    raise exception 'Policy tulis lama masih terpasang (% buah)', v_old;
  end if;
  if v_new <> 2 then
    raise exception 'Policy tulis baru: %, seharusnya 2', v_new;
  end if;

  raise notice '0032 OK — tulis Storage terkunci per workspace';
  raise notice 'WAJIB: patch 3 komponen uploader agar path berprefiks workspace_id';
  raise notice 'Objek lama tanpa prefiks kini TIDAK BISA ditulis/dihapus lewat klien.';
  raise notice 'Setelah reset KEP-012 objek itu yatim — bersihkan manual di Dashboard.';
end $$;
