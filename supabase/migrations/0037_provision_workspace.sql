-- =============================================================================
-- 0037_provision_workspace.sql — Alur provisioning tenant (KEP-002)
--
-- Mengisi lubang terakhir Fase 1B: sampai sekarang TIDAK ADA cara membuat
-- tenant baru. `0028` hanya membungkus data yang sudah ada menjadi satu
-- workspace, dan tidak ada jalur untuk pelanggan kedua — bahkan manual.
--
-- Dua hal dikerjakan di sini:
--   A. `branches.code` unik GLOBAL → dijadikan unik PER-WORKSPACE.
--      Tanpa ini, tenant kedua tidak bisa memakai kode 'UTAMA' dan
--      provisioning-nya pasti gagal. Sekaligus menutup kebocoran informasi:
--      tabrakan kode memberi tahu penyerang kode apa yang sudah dipakai
--      tenant lain.
--   B. `platform.provision_workspace()` — membuat tenant lengkap secara ATOMIK:
--      workspace, keanggotaan owner, langganan + entitlement, cabang pusat,
--      pengaturan cabang, keanggotaan cabang, dan baris singleton
--      store_settings/org_settings.
--
-- Urutan di dalam fungsi PENTING: entitlement dibuat SEBELUM cabang, karena
-- `guard_max_branches` (0033) membaca `limit_of()`. Bila entitlement belum ada,
-- limit terbaca NULL = tak terbatas, dan batas paket jadi tidak ditegakkan
-- pada cabang pertama.
-- =============================================================================

-- ── A. Kode cabang unik per-workspace ──────────────────────────────────────
alter table public.branches drop constraint if exists branches_code_key;

create unique index if not exists idx_branches_workspace_code
  on public.branches (workspace_id, code);

comment on index public.idx_branches_workspace_code is
  'Menggantikan branches_code_key yang unik global (0037). Kode cabang hanya '
  'perlu unik di dalam satu workspace — tenant lain boleh memakai kode sama.';


-- ── B. Escape hatch untuk penjaga privilese profil ─────────────────────────
-- `guard_profile_privilege` melarang perubahan role/permissions/is_active oleh
-- pemanggil non-admin. Saat pendaftaran mandiri, calon owner memang BELUM admin,
-- sehingga ia tidak bisa mengangkat dirinya sendiri — padahal itu justru inti
-- provisioning. Ditambahkan pintu darurat bertransaksi, mengikuti pola yang
-- sudah dipakai `platform.recalc_entitlement` (`platform.allow_limits_write`).
create or replace function public.guard_profile_privilege()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  -- Hanya berlaku di dalam satu transaksi provisioning (set_config ... , true).
  if coalesce(current_setting('platform.provisioning', true), 'off') = 'on' then
    return new;
  end if;

  if auth.uid() is not null and not public.is_admin() then
    if new.role is distinct from old.role
       or new.permissions is distinct from old.permissions
       or new.is_active is distinct from old.is_active then
      raise exception 'Tidak berwenang mengubah role/permissions/status akun';
    end if;
  end if;
  return new;
end $$;


-- ── C. Provisioning tenant ─────────────────────────────────────────────────
create or replace function platform.provision_workspace(
  p_owner_id       uuid,
  p_workspace_name text,
  p_branch_name    text default null,
  p_slug           text default null,
  p_branch_code    text default 'UTAMA',
  p_tier           text default 'gratis',
  p_billing_period text default 'monthly'
)
returns uuid
language plpgsql
security definer
set search_path = platform, public
as $$
declare
  v_caller uuid := auth.uid();
  v_ws     uuid;
  v_slug   text;
  v_branch uuid;
  v_prod   uuid;
  v_plan   uuid;
  v_limits jsonb;
begin
  -- 1. Otorisasi. Tiga pemanggil yang sah:
  --    a) staf internal, b) user mendaftarkan dirinya sendiri,
  --    c) service-role / SQL Editor (auth.uid() null) untuk provisioning admin.
  if not (platform.is_staff()
          or v_caller is null
          or v_caller = p_owner_id) then
    raise exception 'Tidak berwenang membuat workspace untuk user lain';
  end if;

  if p_owner_id is null then
    raise exception 'p_owner_id wajib diisi';
  end if;
  if not exists (select 1 from auth.users where id = p_owner_id) then
    raise exception 'User % tidak ada', p_owner_id;
  end if;
  if coalesce(btrim(p_workspace_name), '') = '' then
    raise exception 'Nama workspace wajib diisi';
  end if;

  -- Pendaftaran mandiri dibatasi satu workspace per orang; staf tidak dibatasi.
  if v_caller = p_owner_id and not platform.is_staff()
     and exists (select 1 from platform.workspaces where owner_id = p_owner_id) then
    raise exception 'Anda sudah memiliki workspace';
  end if;

  -- 2. Profil owner. `handle_new_user` biasanya sudah membuatnya dengan peran
  --    bawaan, jadi jalur UPDATE-lah yang menentukan.
  --
  --    Owner harus `is_master_admin` DAN `role='admin'`:
  --      • `is_admin()` hanya melihat `role='admin'` — dipakai policy katalog.
  --      • `is_master_admin()` dipakai `has_branch_permission()` dan guard
  --        storage.
  --    Keduanya kini TERKURUNG di workspace sendiri oleh guard 0031, jadi ini
  --    bukan privilese global — persis maksud PRD §4C.5.
  perform set_config('platform.provisioning', 'on', true);

  insert into public.profiles (id, full_name, role, is_master_admin, is_active)
  values (p_owner_id,
          coalesce((select raw_user_meta_data->>'full_name' from auth.users where id = p_owner_id),
                   split_part((select email from auth.users where id = p_owner_id), '@', 1)),
          'admin', true, true)
  on conflict (id) do update
    set role = 'admin', is_master_admin = true, is_active = true;

  -- 3. Slug unik.
  v_slug := coalesce(nullif(btrim(p_slug), ''),
                     regexp_replace(lower(btrim(p_workspace_name)), '[^a-z0-9]+', '-', 'g'));
  v_slug := btrim(v_slug, '-');
  if v_slug = '' then v_slug := 'workspace'; end if;
  if exists (select 1 from platform.workspaces where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;

  -- 4. Workspace + owner.
  insert into platform.workspaces (name, slug, owner_id)
  values (btrim(p_workspace_name), v_slug, p_owner_id)
  returning id into v_ws;

  insert into platform.workspace_members (workspace_id, user_id, role, is_active)
  values (v_ws, p_owner_id, 'owner', true);

  -- 5. Langganan + entitlement — WAJIB sebelum cabang (lihat catatan di kepala).
  select id into v_prod from platform.products where slug = 'kasir-unggul';
  if v_prod is null then
    raise exception 'Produk kasir-unggul tidak ada — jalankan 0027 lebih dulu';
  end if;

  -- `tier` bertipe text, tetapi `billing_period` adalah enum platform.billing_period
  -- sehingga perbandingannya wajib di-cast.
  select id, limits into v_plan, v_limits
  from platform.plans
  where product_id = v_prod
    and tier = p_tier
    and billing_period = p_billing_period::platform.billing_period;
  if v_plan is null then
    raise exception 'Paket %/% tidak ditemukan', p_tier, p_billing_period;
  end if;

  insert into platform.subscriptions
    (workspace_id, product_id, plan_id, status, current_period_start, current_period_end)
  values (v_ws, v_prod, v_plan, 'active', now(), now() + interval '1 month');

  insert into platform.entitlements
    (workspace_id, product_id, plan_id, status, limits, valid_until)
  values (v_ws, v_prod, v_plan, 'active', v_limits, now() + interval '1 month');

  perform platform.recalc_entitlement(v_ws, v_prod);

  -- 6. Cabang pusat + turunannya.
  insert into public.branches (workspace_id, code, name, is_main, is_active)
  values (v_ws, upper(p_branch_code),
          coalesce(nullif(btrim(p_branch_name), ''), btrim(p_workspace_name) || ' - Pusat'),
          true, true)
  returning id into v_branch;

  insert into public.branch_settings (branch_id) values (v_branch)
  on conflict do nothing;

  -- Owner juga manajer cabang pusat: RLS operasional memakai branch_memberships,
  -- bukan workspace_members. Tanpa ini owner tidak bisa membuka kasir.
  -- Set permission disamakan dengan manajer di PROD supaya tenant baru tidak
  -- lahir dengan hak yang lebih sempit dari tenant yang sudah ada.
  insert into public.branch_memberships (user_id, branch_id, role, is_active, permissions)
  values (p_owner_id, v_branch, 'manager', true, array[
    'stock.opname','stock.adjust','stock.receive','stock.wastage',
    'stock.transfer_request','stock.transfer_receive',
    'report.view','report.export','sales.view_branch','settings.branch_edit',
    'audit.view','approval.grant','discount.override','price.override',
    'cash.drop','cash.pettycash'
  ])
  on conflict do nothing;

  -- 7. Baris singleton pengaturan (KEP-003: satu per workspace).
  insert into public.store_settings (workspace_id) values (v_ws) on conflict do nothing;
  insert into public.org_settings   (workspace_id) values (v_ws) on conflict do nothing;

  raise notice 'Workspace % (%) siap — cabang pusat %', v_ws, v_slug, v_branch;
  return v_ws;
end $$;

revoke all on function platform.provision_workspace(uuid,text,text,text,text,text,text) from public;
grant execute on function platform.provision_workspace(uuid,text,text,text,text,text,text) to authenticated;

comment on function platform.provision_workspace(uuid,text,text,text,text,text,text) is
  'Membuat tenant lengkap secara atomik (KEP-002). Dipakai alur pendaftaran '
  'storefront dan provisioning manual oleh staf.';


-- ── Verifikasi ─────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.branches'::regclass and conname = 'branches_code_key') then
    raise exception '0037 GAGAL: branches_code_key unik global masih ada';
  end if;
  if to_regprocedure('platform.provision_workspace(uuid,text,text,text,text,text,text)') is null then
    raise exception '0037 GAGAL: provision_workspace() tidak terbentuk';
  end if;
  raise notice '0037 OK — kode cabang unik per-workspace, provisioning tenant tersedia';
end $$;
