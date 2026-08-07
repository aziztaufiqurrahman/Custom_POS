-- =============================================================================
-- 0028_branches_workspace.sql — Jangkar tenant: workspace menjadi induk cabang
--
-- Rujukan: PRD §4C.1/§4C.3 · KEP-005 (kelompok B), KEP-009 · RENCANA-MIGRASI-1B §2
--
-- SIFAT: ADITIF. Menambah 2 kolom pada `branches`, tidak mengubah/menghapus
--        kolom lama. Membuat SATU workspace untuk master admin yang tersisa
--        setelah reset (KEP-012), lalu memberinya entitlement aktif.
--
-- KEP-009: `branches` belum punya penanda cabang pusat. Selama ini id
--          '…c1' di-hardcode di 13 RPC, 7 DEFAULT kolom, dan 44 titik kode TS.
--          Kolom `is_main` menggantikannya dengan penanda per-workspace.
-- =============================================================================

-- ── 1. Kolom baru ──────────────────────────────────────────────────────────
alter table public.branches
  add column if not exists workspace_id uuid references platform.workspaces(id),
  add column if not exists is_main      boolean not null default false;

comment on column public.branches.is_main is
  'Cabang pusat workspace ini. Menggantikan UUID hardcode …c1 (KEP-009). '
  'Tepat satu per workspace, ditegakkan idx_branches_one_main.';


-- ── 2. Workspace pertama untuk data yang tersisa ───────────────────────────
-- Setelah reset (KEP-012) hanya tersisa SATU akun master admin, sehingga
-- pemilihan owner bersifat deterministik — tidak perlu ditebak.
do $$
declare
  v_owner uuid;
  v_email text;
  v_ws    uuid;
  v_main  constant uuid := '00000000-0000-0000-0000-0000000000c1';
  v_prod  uuid;
  v_plan  uuid;
  v_sub   uuid;
  v_baru  boolean;
begin
  -- 2a. Database perawan? Penentunya adalah ADA/TIDAKNYA calon owner — bukan
  --     ada/tidaknya cabang, karena 0015 selalu menyeed Cabang Utama '…c1'
  --     sehingga `branches` tidak pernah benar-benar kosong.
  --     Jalur ini dipakai STAGING, CI, dan pemulihan bencana: skema dibangun
  --     penuh, bootstrap tenant diserahkan ke alur pendaftaran/provisioning.
  v_baru := not exists (select 1 from public.profiles where is_master_admin and is_active);

  if v_baru then
    raise notice '0028: tidak ada master admin — bootstrap workspace DILEWATI. '
                 'Struktur (kolom, indeks, fungsi) tetap dibuat. '
                 'workspace_id dibiarkan NULLABLE sampai tenant pertama dibuat.';
    return;
  end if;

  -- 2b. Owner = master admin aktif tertua
  select p.id, u.email into v_owner, v_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.is_master_admin and p.is_active
  order by p.created_at
  limit 1;

  if v_owner is null then
    raise exception 'DIBATALKAN: tidak ada master admin aktif. '
                    'Workspace tidak bisa dibuat tanpa owner.';
  end if;

  -- 2c. Cabang Utama HARUS ada — seluruh sistem bergantung padanya (KEP-009)
  if not exists (select 1 from public.branches where id = v_main) then
    raise exception 'DIBATALKAN: Cabang Utama % tidak ditemukan. '
                    'Jangan lanjutkan — asumsi dasar sistem sudah salah.', v_main;
  end if;

  -- 2d. Workspace (idempoten lewat slug)
  insert into platform.workspaces (name, slug, owner_id)
  values (coalesce((select org_name from public.org_settings limit 1), 'Workspace Utama'),
          'workspace-utama', v_owner)
  on conflict (slug) do nothing;

  select id into v_ws from platform.workspaces where slug = 'workspace-utama';

  -- 2e. Owner sebagai anggota
  insert into platform.workspace_members (workspace_id, user_id, role, is_active)
  values (v_ws, v_owner, 'owner', true)
  on conflict (workspace_id, user_id) do update set role = 'owner', is_active = true;

  -- 2f. Seluruh cabang yang ada masuk ke workspace ini; '…c1' jadi cabang pusat
  update public.branches set workspace_id = v_ws where workspace_id is null;
  update public.branches set is_main = true where id = v_main;

  -- 2g. Langganan + entitlement.
  -- Plan BISNIS dipilih agar seluruh fitur terbuka selama pengembangan dan
  -- gerbang entitlement (0033) tidak menghalangi pekerjaan sendiri.
  select id into v_prod from platform.products where slug = 'kasir-unggul';
  select id into v_plan from platform.plans
    where product_id = v_prod and tier = 'bisnis' and billing_period = 'monthly';

  insert into platform.subscriptions
    (workspace_id, product_id, plan_id, status, current_period_start, current_period_end)
  values (v_ws, v_prod, v_plan, 'active', now(), now() + interval '100 years')
  on conflict (workspace_id, product_id) do nothing;

  select id into v_sub from platform.subscriptions
    where workspace_id = v_ws and product_id = v_prod;

  insert into platform.entitlements
    (workspace_id, product_id, plan_id, status, limits, valid_until)
  select v_ws, v_prod, v_plan, 'active', pl.limits, now() + interval '100 years'
  from platform.plans pl where pl.id = v_plan
  on conflict (workspace_id, product_id) do nothing;

  raise notice 'Workspace dibuat: % (owner: %)', v_ws, v_email;
end $$;


-- ── 3. Kunci: workspace_id wajib, satu cabang pusat per workspace ──────────
-- NOT NULL hanya bisa dipasang bila setiap cabang sudah punya workspace. Di
-- database tanpa owner (STAGING/CI) cabang seed '…c1' masih menggantung, jadi
-- constraint ditunda — bukan dipaksa — agar migrasi tetap replayable.
-- Alur provisioning tenant WAJIB memasang ini setelah workspace pertama ada.
do $$
begin
  if exists (select 1 from public.branches where workspace_id is null) then
    raise notice '0028: masih ada cabang tanpa workspace — NOT NULL pada '
                 'branches.workspace_id DITUNDA (lihat Bagian 2a).';
  else
    alter table public.branches alter column workspace_id set not null;
  end if;
end $$;

create unique index if not exists idx_branches_one_main
  on public.branches(workspace_id) where is_main;

-- Penopang jalur join KEP-004 (stock_movements & audit_logs di-scope lewat sini).
-- `branches` mungil dan selalu tercache, sehingga join ini praktis gratis.
create index if not exists idx_branches_id_workspace
  on public.branches(id, workspace_id);
create index if not exists idx_branches_workspace
  on public.branches(workspace_id) where is_active;


-- ── 4. Helper cabang pusat (menggantikan v_main hardcode) ──────────────────
-- Dipakai 13 RPC di migrasi 0030. STABLE + SECURITY DEFINER agar bisa dipanggil
-- dari fungsi lain tanpa terhalang RLS.
create or replace function public.is_main_branch(b uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select coalesce((select is_main from public.branches where id = b), false);
$$;

-- Cabang pusat dari workspace yang sama dengan cabang yang diberikan.
create or replace function public.main_branch_of(b uuid)
returns uuid language sql stable security definer
set search_path = public as $$
  select m.id
  from public.branches src
  join public.branches m on m.workspace_id = src.workspace_id and m.is_main
  where src.id = b;
$$;

grant execute on function public.is_main_branch(uuid) to authenticated;
grant execute on function public.main_branch_of(uuid) to authenticated;


-- ── 5. Verifikasi ──────────────────────────────────────────────────────────
do $$
declare v_ws int; v_main int; v_null int; v_ent int; v_cabang int;
begin
  select count(*) into v_ws     from platform.workspaces;
  select count(*) into v_main   from public.branches where is_main;
  select count(*) into v_null   from public.branches where workspace_id is null;
  select count(*) into v_ent    from platform.entitlements where status = 'active';
  select count(*) into v_cabang from public.branches;

  -- Database perawan (bootstrap dilewati di Bagian 2): hanya struktur yang diuji.
  if v_ws = 0 then
    if not exists (select 1 from pg_indexes
                   where schemaname = 'public' and indexname = 'idx_branches_one_main') then
      raise exception '0028: idx_branches_one_main tidak terbentuk';
    end if;
    if to_regprocedure('public.main_branch_of(uuid)') is null then
      raise exception '0028: fungsi main_branch_of() tidak terbentuk';
    end if;
    raise notice '0028 OK (database perawan) — struktur lengkap, tanpa bootstrap workspace';
    return;
  end if;

  -- Database berisi data: invarian penuh, sama ketatnya seperti sebelumnya.
  if v_null <> 0 then raise exception 'Cabang tanpa workspace: %', v_null; end if;
  if v_ws <> 1   then raise exception 'Workspace: %, seharusnya 1', v_ws; end if;
  if v_main <> 1 then raise exception 'Cabang pusat: %, seharusnya 1', v_main; end if;
  if v_ent <> 1  then raise exception 'Entitlement aktif: %, seharusnya 1', v_ent; end if;

  raise notice '0028 OK — 1 workspace, 1 cabang pusat, entitlement aktif (Bisnis)';
end $$;
