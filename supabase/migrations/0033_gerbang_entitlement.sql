-- =============================================================================
-- 0033_gerbang_entitlement.sql — Batas paket ditegakkan di lapisan data
--
-- Rujukan: PRD §4C.4 · Handoff §8.5 · KEP-006 · KEP-008 · RENCANA-MIGRASI-1B §2
--
-- PEMBAGIAN TEGAS (Handoff §8.5):
--   BATAS KERAS  max_branches, max_users  -> dicek SAAT MENAMBAH, menolak
--   FAIR-USE     monthly_tx_cap, storage_mb -> soft cap, HANYA alert
--
-- ⚠️ ATURAN YANG TIDAK BOLEH DILANGGAR:
--    JANGAN PERNAH menghentikan transaksi kasir karena monthly_tx_cap.
--    Handoff §8.5 eksplisit: "jangan hentikan transaksi mendadak; tawarkan
--    upgrade". Toko pelanggan tidak boleh berhenti karena kuota.
--    Karena itu migrasi ini TIDAK menyentuh create_sale sama sekali.
--
-- NULL pada sebuah limit = tak terbatas (Enterprise, Handoff §8.4).
-- =============================================================================

-- ── 1. Pembacaan limit efektif ─────────────────────────────────────────────
-- Selalu dibaca dari entitlements (Handoff §8.5), yang isinya sudah
-- plan + add-on hasil platform.recalc_entitlement() (KEP-006).
create or replace function platform.limit_of(ws uuid, product_slug text, key text)
returns int language sql stable security definer
set search_path = platform, public as $$
  select nullif(e.limits ->> key, 'null')::int
  from platform.entitlements e
  join platform.products p on p.id = e.product_id
  where e.workspace_id = ws and p.slug = product_slug and e.status = 'active';
$$;
grant execute on function platform.limit_of(uuid, text, text) to authenticated;


-- ── 2. Batas keras: max_branches ───────────────────────────────────────────
create or replace function public.guard_max_branches()
returns trigger language plpgsql security definer
set search_path = public, platform as $$
declare v_limit int; v_now int;
begin
  v_limit := platform.limit_of(new.workspace_id, 'kasir-unggul', 'max_branches');
  if v_limit is null then
    return new;                                   -- Enterprise / tak terbatas
  end if;

  select count(*) into v_now from public.branches
   where workspace_id = new.workspace_id;

  if v_now >= v_limit then
    -- Kode 'BATAS_CABANG' ditangkap UI untuk menampilkan tawaran upgrade /
    -- beli add-on, bukan error mentah (Handoff §8.5).
    raise exception 'BATAS_CABANG: paket Anda memuat % cabang. '
                    'Tingkatkan paket atau beli add-on cabang untuk menambah.', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_max_branches on public.branches;
create trigger trg_guard_max_branches
  before insert on public.branches
  for each row execute function public.guard_max_branches();


-- ── 3. Batas keras: max_users ──────────────────────────────────────────────
-- Dihitung dari platform.workspace_members (satu baris per orang per
-- workspace), BUKAN dari branch_memberships — satu orang bisa ditugaskan ke
-- beberapa cabang tapi tetap satu seat.
create or replace function public.guard_max_users()
returns trigger language plpgsql security definer
set search_path = public, platform as $$
declare v_limit int; v_now int;
begin
  if not new.is_active then
    return new;                                   -- anggota nonaktif tidak dihitung
  end if;

  v_limit := platform.limit_of(new.workspace_id, 'kasir-unggul', 'max_users');
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_now from platform.workspace_members
   where workspace_id = new.workspace_id and is_active
     and user_id <> new.user_id;                  -- abaikan diri sendiri saat UPDATE

  if v_now >= v_limit then
    raise exception 'BATAS_PENGGUNA: paket Anda memuat % pengguna. '
                    'Tingkatkan paket atau beli add-on seat untuk menambah.', v_limit
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_max_users on platform.workspace_members;
create trigger trg_guard_max_users
  before insert or update on platform.workspace_members
  for each row execute function public.guard_max_users();


-- ── 4. Gerbang akses tool ──────────────────────────────────────────────────
-- Dipakai aplikasi sebelum memberi akses ke Kasir Unggul (PRD §4C.4).
-- Mengembalikan status lengkap agar UI bisa menampilkan pesan yang tepat,
-- bukan sekadar boleh/tidak.
create or replace function platform.kasir_access(ws uuid)
returns jsonb language sql stable security definer
set search_path = platform, public as $$
  select jsonb_build_object(
    'allowed',   e.status = 'active',
    'status',    coalesce(e.status::text, 'none'),
    'sub_status',coalesce(s.status::text, 'none'),
    'limits',    coalesce(e.limits, '{}'::jsonb),
    'plan',      pl.tier,
    'valid_until', e.valid_until,
    -- KEP-008: kedaluwarsa TIDAK mengunci; workspace turun ke limit Gratis.
    'downgraded', s.status in ('expired','cancelled')
  )
  from platform.entitlements e
  join platform.products p  on p.id = e.product_id and p.slug = 'kasir-unggul'
  left join platform.plans pl on pl.id = e.plan_id
  left join platform.subscriptions s
         on s.workspace_id = e.workspace_id and s.product_id = e.product_id
  where e.workspace_id = ws;
$$;
grant execute on function platform.kasir_access(uuid) to authenticated;


-- ── 5. Kedaluwarsa: turun ke tier Gratis, BUKAN terkunci (KEP-008) ─────────
-- Dijalankan job harian. Grace 7 hari dengan fungsi penuh, lalu limits
-- diturunkan ke tier Gratis. Kasir TETAP BISA BERTRANSAKSI.
create or replace function platform.expire_overdue_subscriptions()
returns int language plpgsql security definer
set search_path = platform, public as $$
declare v_row record; v_free jsonb; v_n int := 0;
begin
  select limits into v_free
  from platform.plans pl
  join platform.products p on p.id = pl.product_id
  where p.slug = 'kasir-unggul' and pl.tier = 'gratis'
  limit 1;

  for v_row in
    select s.workspace_id, s.product_id
    from platform.subscriptions s
    where s.status = 'past_due'
      and s.current_period_end is not null
      and s.current_period_end < now() - interval '7 days'   -- grace 7 hari
  loop
    update platform.subscriptions set status = 'expired'
     where workspace_id = v_row.workspace_id and product_id = v_row.product_id;

    -- Turunkan limits ke tier Gratis lewat penjaga resmi (KEP-006).
    perform set_config('platform.allow_limits_write', 'on', true);
    update platform.entitlements
       set limits = v_free, updated_at = now()
     where workspace_id = v_row.workspace_id and product_id = v_row.product_id;

    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

comment on function platform.expire_overdue_subscriptions() is
  'KEP-008. Status entitlement TETAP active — yang turun hanyalah limits. '
  'Kasir tetap bisa bertransaksi (maks 300 tx/bln). Cabang & seat berlebih '
  'digerbangi, TIDAK dihapus, sehingga pulih utuh saat pelanggan membayar lagi.';


-- ── 6. Verifikasi ──────────────────────────────────────────────────────────
do $$
declare v_lim int;
begin
  if not exists (select 1 from pg_trigger
                 where tgname = 'trg_guard_max_branches' and not tgisinternal) then
    raise exception 'Trigger batas cabang tidak terpasang';
  end if;
  if not exists (select 1 from pg_trigger
                 where tgname = 'trg_guard_max_users' and not tgisinternal) then
    raise exception 'Trigger batas pengguna tidak terpasang';
  end if;

  -- Uji limit hanya bermakna bila ada workspace. Di database tanpa tenant
  -- (STAGING/CI/pemulihan — lihat 0028 Bagian 2a) trigger sudah terbukti
  -- terpasang di atas, dan itulah yang bisa diverifikasi di sana.
  if exists (select 1 from platform.workspaces) then
    select platform.limit_of(
      (select id from platform.workspaces order by created_at limit 1),
      'kasir-unggul', 'max_branches') into v_lim;
    if v_lim is null or v_lim <> 10 then
      raise exception 'Limit cabang workspace pengembangan: %, seharusnya 10 (Bisnis)', v_lim;
    end if;
  else
    raise notice '0033: belum ada workspace — uji limit dilewati (trigger terpasang).';
  end if;

  raise notice '0033 OK — batas keras aktif, fair-use hanya alert';
  raise notice 'create_sale TIDAK disentuh: kasir tidak boleh berhenti karena kuota';
end $$;
