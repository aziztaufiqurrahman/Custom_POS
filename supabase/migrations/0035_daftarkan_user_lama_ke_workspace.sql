-- =============================================================================
-- 0035_daftarkan_user_lama_ke_workspace.sql
--
-- MEMPERBAIKI REGRESI KRITIS dari 0028 + 0031.
--
-- Gejala: setelah 0031 aktif, HANYA master admin yang bisa melihat data.
--         3 user lain (1 manajer, 2 kasir) mendapat 0 cabang, 0 produk,
--         0 transaksi — aplikasi mati total bagi mereka.
--
-- Sebab: 0028 Bagian 2e hanya memasukkan SATU baris ke
--        `platform.workspace_members` (si owner), karena berpijak pada KEP-012
--        yang menyatakan "setelah reset hanya tersisa satu master admin".
--        **Reset itu tidak pernah dijalankan.** 4 user nyata tetap ada.
--
--        Guard 0031 berbunyi `… and workspace_id = any(user_workspace_ids())`,
--        sedangkan `user_workspace_ids()` membaca `workspace_members`. User
--        tanpa baris di sana → himpunan kosong → seluruh policy menolak.
--
-- Perbaikan: setiap user dengan `branch_memberships` aktif didaftarkan ke
--        workspace pemilik cabangnya. Pemetaan peran:
--          branch_role 'manager' → member_role 'admin'
--          branch_role 'cashier' → member_role 'member'
--        `profiles.is_master_admin` → 'owner' (idempoten, tidak menurunkan
--        owner yang sudah ada).
--
-- Idempoten & aman dijalankan ulang.
-- =============================================================================

do $$
declare v_ditambah int;
begin
  -- 1. Master admin → owner (jaga-jaga bila 0028 dilewati di suatu environment)
  insert into platform.workspace_members (workspace_id, user_id, role, is_active)
  select distinct b.workspace_id, p.id, 'owner'::platform.member_role, true
  from public.profiles p
  join public.branches b on b.workspace_id is not null
  where p.is_master_admin and p.is_active
  on conflict (workspace_id, user_id) do update
    set role = 'owner', is_active = true;

  -- 2. Seluruh anggota cabang → workspace pemilik cabang itu.
  --    `on conflict do nothing` supaya tidak menurunkan peran owner/admin
  --    yang sudah lebih tinggi.
  insert into platform.workspace_members (workspace_id, user_id, role, is_active)
  select distinct on (b.workspace_id, bm.user_id)
         b.workspace_id,
         bm.user_id,
         case bm.role
           when 'manager' then 'admin'::platform.member_role
           else 'member'::platform.member_role
         end,
         true
  from public.branch_memberships bm
  join public.branches b on b.id = bm.branch_id
  join public.profiles p on p.id = bm.user_id
  where bm.is_active
    and p.is_active
    and b.workspace_id is not null
  -- manager menang atas cashier bila user jadi anggota di dua cabang
  order by b.workspace_id, bm.user_id, (bm.role = 'manager') desc
  on conflict (workspace_id, user_id) do nothing;

  get diagnostics v_ditambah = row_count;
  raise notice '0035: % keanggotaan workspace ditambahkan', v_ditambah;
end $$;


-- ── Verifikasi: tidak boleh ada user aktif yang tercecer ────────────────────
do $$
declare v_yatim text;
begin
  select string_agg(u.email, ', ')
    into v_yatim
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.is_active
    and (p.is_master_admin
         or exists (select 1 from public.branch_memberships bm
                    where bm.user_id = p.id and bm.is_active))
    and not exists (select 1 from platform.workspace_members wm
                    where wm.user_id = p.id and wm.is_active);

  if v_yatim is not null then
    raise exception '0035 GAGAL: user aktif tanpa keanggotaan workspace: %', v_yatim;
  end if;

  raise notice '0035 OK — setiap user aktif punya workspace, RLS 0031 tidak mengunci siapa pun';
end $$;
