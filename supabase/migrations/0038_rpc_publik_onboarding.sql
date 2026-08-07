-- =============================================================================
-- 0038_rpc_publik_onboarding.sql — Jembatan `platform` → API
--
-- MASALAH: skema `platform` TIDAK terdaftar di PostgREST "Exposed schemas"
--          (db_schema = 'public,graphql_public' di PROD maupun STAGING).
--          Akibatnya `platform.provision_workspace()` dari 0037 **tidak bisa
--          dipanggil sama sekali dari aplikasi** — RPC hanya dapat menjangkau
--          fungsi di skema yang diekspos.
--
-- PILIHAN YANG DIAMBIL: membungkus di `public` (yang sudah diekspos), BUKAN
--          mengekspos seluruh skema `platform`. Alasannya: mengekspos
--          `platform` akan memunculkan 19 tabel ke permukaan API sekaligus —
--          termasuk `invoices`, `payments`, `coupons`, `payment_webhook_events`.
--          Seluruhnya memang ber-RLS, tetapi memperluas permukaan serang
--          sebanyak itu hanya demi dua panggilan bukan pertukaran yang sepadan.
--          Saat aplikasi platform/billing benar-benar dibangun, keputusan ini
--          bisa ditinjau ulang.
--
-- Kedua fungsi di bawah sengaja TIDAK security definer: keduanya memanggil
-- fungsi `platform` yang sudah security definer dan sudah menegakkan otorisasi
-- sendiri. Menambah definer di sini hanya akan mengaburkan siapa aktornya.
-- =============================================================================

-- ── 1. Workspace milik user saat ini ───────────────────────────────────────
-- Dipakai aplikasi untuk membedakan "user belum onboarding" dari "user sudah
-- punya tenant". Mengembalikan NULL bila user belum jadi anggota mana pun.
create or replace function public.my_workspace_id()
returns uuid
language sql
stable
set search_path = public, platform
as $$
  select platform.current_workspace_id();
$$;

grant execute on function public.my_workspace_id() to authenticated;

comment on function public.my_workspace_id() is
  'Workspace aktif user saat ini, atau NULL bila belum punya. Pembungkus '
  'platform.current_workspace_id() karena skema platform tidak diekspos (0038).';


-- ── 2. Provisioning tenant oleh pemiliknya sendiri ─────────────────────────
-- Owner SELALU auth.uid(): pemanggil tidak bisa membuatkan workspace untuk
-- orang lain lewat jalur publik ini. Provisioning atas nama orang lain tetap
-- mungkin, tetapi hanya lewat platform.provision_workspace() langsung oleh
-- staf/service-role — bukan dari browser.
create or replace function public.provision_my_workspace(
  p_workspace_name text,
  p_branch_name    text default null,
  p_branch_code    text default 'UTAMA'
)
returns uuid
language plpgsql
set search_path = public, platform
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Tidak terautentikasi';
  end if;

  return platform.provision_workspace(
    p_owner_id       => v_uid,
    p_workspace_name => p_workspace_name,
    p_branch_name    => p_branch_name,
    p_slug           => null,
    p_branch_code    => p_branch_code,
    p_tier           => 'gratis',
    p_billing_period => 'monthly'
  );
end $$;

revoke all on function public.provision_my_workspace(text,text,text) from public;
grant execute on function public.provision_my_workspace(text,text,text) to authenticated;

comment on function public.provision_my_workspace(text,text,text) is
  'Membuat workspace untuk user yang sedang login (paket Gratis). Owner '
  'dipaksa = auth.uid(); tidak bisa dipakai membuat tenant atas nama orang lain.';


-- ── Verifikasi ─────────────────────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.my_workspace_id()') is null then
    raise exception '0038 GAGAL: my_workspace_id() tidak terbentuk';
  end if;
  if to_regprocedure('public.provision_my_workspace(text,text,text)') is null then
    raise exception '0038 GAGAL: provision_my_workspace() tidak terbentuk';
  end if;
  raise notice '0038 OK — onboarding dapat dipanggil dari aplikasi';
end $$;
