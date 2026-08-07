-- =============================================================================
-- 0029_workspace_id_kolom.sql — Sebarkan workspace_id ke 11 tabel POS
--
-- Rujukan: KEP-005 (peta 30 tabel) · KEP-003 · KEP-004 · PRD §4A.2/§4C.3
--
-- KEP-005: 12 tabel mendapat kolom (11 di sini + `branches` di 0028);
--          18 sisanya di-scope lewat join.
--
-- PENGECUALIAN KEP-004 — `stock_movements` dan `audit_logs` TIDAK disentuh.
--   Keduanya append-only + hash chain, dan hash_chain() mem-hash SELURUH isi
--   baris (`to_jsonb(new) - 'prev_hash' - 'row_hash'`). Menambah kolom saja —
--   tanpa UPDATE sekalipun — sudah mematahkan verifikasi baris historis.
--
-- Ringan karena data sudah direset (KEP-012): tidak ada backfill besar,
-- tidak butuh jendela pemeliharaan.
-- =============================================================================

-- ── 1. Penentu workspace ───────────────────────────────────────────────────
-- Urutan: workspace user yang sedang login → bila tidak ada konteks user,
-- pakai satu-satunya workspace yang ada. Fallback kedua menjaga seed dan
-- skrip service-role tetap jalan, dan otomatis GAGAL (bukan menebak) begitu
-- workspace kedua muncul — persis saat kita memang ingin error.
create or replace function platform.current_workspace_id()
returns uuid language sql stable security definer
set search_path = platform, public as $$
  select coalesce(
    (select workspace_id from platform.workspace_members
      where user_id = (select auth.uid()) and is_active
      order by created_at limit 1),
    -- Tepat SATU workspace → pakai itu. Nol atau >1 → NULL, supaya pemanggil
    -- gagal keras alih-alih menebak workspace yang salah.
    (select w.id from platform.workspaces w
      where (select count(*) from platform.workspaces) = 1)
  );
$$;
grant execute on function platform.current_workspace_id() to authenticated;


-- ── 2. Trigger pengisi otomatis ────────────────────────────────────────────
-- PRD §4C.3: "diisi otomatis oleh RPC/trigger, bukan input manual".

-- 2a. Tabel ber-branch_id → turunkan dari cabang
create or replace function public.set_workspace_from_branch()
returns trigger language plpgsql security definer
set search_path = public, platform as $$
begin
  if new.workspace_id is null and new.branch_id is not null then
    select workspace_id into new.workspace_id
      from public.branches where id = new.branch_id;
  end if;
  if new.workspace_id is null then
    raise exception 'workspace_id tidak dapat ditentukan untuk %.% (branch_id=%)',
      tg_table_schema, tg_table_name, new.branch_id;
  end if;
  return new;
end $$;

-- 2b. transaction_items → turunkan dari transaksi induknya (tanpa branch_id)
create or replace function public.set_workspace_from_transaction()
returns trigger language plpgsql security definer
set search_path = public, platform as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id
      from public.transactions where id = new.transaction_id;
  end if;
  if new.workspace_id is null then
    raise exception 'workspace_id tidak dapat ditentukan untuk transaction_items';
  end if;
  return new;
end $$;

-- 2c. Katalog global (tanpa branch_id) → dari konteks user
create or replace function public.set_workspace_from_context()
returns trigger language plpgsql security definer
set search_path = public, platform as $$
begin
  if new.workspace_id is null then
    new.workspace_id := platform.current_workspace_id();
  end if;
  if new.workspace_id is null then
    raise exception 'workspace_id tidak dapat ditentukan untuk %.% — '
                    'kirim workspace_id secara eksplisit',
      tg_table_schema, tg_table_name;
  end if;
  return new;
end $$;

-- 2d. notifications → dari workspace pemilik notifikasi
create or replace function public.set_workspace_from_user()
returns trigger language plpgsql security definer
set search_path = public, platform as $$
begin
  if new.workspace_id is null then
    select workspace_id into new.workspace_id
      from platform.workspace_members
      where user_id = new.user_id and is_active
      order by created_at limit 1;
  end if;
  if new.workspace_id is null then
    new.workspace_id := platform.current_workspace_id();
  end if;
  if new.workspace_id is null then
    raise exception 'workspace_id tidak dapat ditentukan untuk notifications';
  end if;
  return new;
end $$;


-- ── 3. Tambah kolom + trigger + index ──────────────────────────────────────

-- 3a. KELOMPOK C — volume tinggi, punya branch_id
do $$
declare t text;
begin
  foreach t in array array[
    'transactions','payments','cash_sessions','branch_products'
  ] loop
    execute format(
      'alter table public.%I add column if not exists workspace_id uuid
         references platform.workspaces(id);', t);
    execute format('drop trigger if exists trg_set_workspace on public.%I;', t);
    execute format(
      'create trigger trg_set_workspace before insert on public.%I
         for each row execute function public.set_workspace_from_branch();', t);
  end loop;
end $$;

-- 3b. transaction_items — lewat induk
alter table public.transaction_items
  add column if not exists workspace_id uuid references platform.workspaces(id);
drop trigger if exists trg_set_workspace on public.transaction_items;
create trigger trg_set_workspace before insert on public.transaction_items
  for each row execute function public.set_workspace_from_transaction();

-- 3c. KELOMPOK A — katalog global & pengaturan, TANPA jalur cabang.
-- Tanpa workspace_id di sini, katalog produk SEMUA UMKM bercampur.
do $$
declare t text;
begin
  foreach t in array array[
    'products','categories','suppliers','store_settings','org_settings'
  ] loop
    execute format(
      'alter table public.%I add column if not exists workspace_id uuid
         references platform.workspaces(id);', t);
    execute format('drop trigger if exists trg_set_workspace on public.%I;', t);
    execute format(
      'create trigger trg_set_workspace before insert on public.%I
         for each row execute function public.set_workspace_from_context();', t);
  end loop;
end $$;

-- 3d. notifications — terikat user, bukan cabang
alter table public.notifications
  add column if not exists workspace_id uuid references platform.workspaces(id);
drop trigger if exists trg_set_workspace on public.notifications;
create trigger trg_set_workspace before insert on public.notifications
  for each row execute function public.set_workspace_from_user();


-- ── 4. Backfill ────────────────────────────────────────────────────────────
-- Setelah reset (KEP-012) hanya `store_settings` dan `org_settings` yang berisi
-- data (masing-masing satu baris, sengaja dipertahankan). Sisanya kosong.
do $$
declare v_ws uuid; t text;
begin
  select id into v_ws from platform.workspaces order by created_at limit 1;

  -- Database tanpa tenant (STAGING/CI/pemulihan — lihat 0028 Bagian 2a): tidak
  -- ada apa pun untuk di-backfill. Seluruh tabel di bawah masih kosong, jadi
  -- Bagian 5 tetap bisa memasang NOT NULL tanpa masalah.
  if v_ws is null then
    raise notice '0029: belum ada workspace — backfill DILEWATI (tabel kosong).';
    return;
  end if;

  foreach t in array array[
    'products','categories','suppliers','notifications','store_settings',
    'org_settings','transactions','transaction_items','payments',
    'cash_sessions','branch_products'
  ] loop
    execute format('update public.%I set workspace_id = $1 where workspace_id is null;', t)
      using v_ws;
  end loop;
end $$;


-- ── 5. Kunci NOT NULL ──────────────────────────────────────────────────────
-- Dilakukan SETELAH backfill. Mulai sekarang setiap baris wajib bertenant.
do $$
declare t text;
begin
  foreach t in array array[
    'products','categories','suppliers','notifications','store_settings',
    'org_settings','transactions','transaction_items','payments',
    'cash_sessions','branch_products'
  ] loop
    execute format('alter table public.%I alter column workspace_id set not null;', t);
  end loop;
end $$;

-- Satu baris pengaturan per workspace (KEP-003).
create unique index if not exists idx_store_settings_ws
  on public.store_settings(workspace_id);
create unique index if not exists idx_org_settings_ws
  on public.org_settings(workspace_id);


-- ── 6. Index komposit diawali workspace_id (PRD §4A.2) ─────────────────────
create index if not exists idx_transactions_ws
  on public.transactions(workspace_id, branch_id, created_at desc);
create index if not exists idx_transaction_items_ws
  on public.transaction_items(workspace_id, transaction_id);
create index if not exists idx_payments_ws
  on public.payments(workspace_id, branch_id, created_at desc);
create index if not exists idx_cash_sessions_ws
  on public.cash_sessions(workspace_id, branch_id, status);
create index if not exists idx_branch_products_ws
  on public.branch_products(workspace_id, branch_id, product_id);
create index if not exists idx_products_ws
  on public.products(workspace_id) where deleted_at is null;
create index if not exists idx_categories_ws  on public.categories(workspace_id);
create index if not exists idx_suppliers_ws   on public.suppliers(workspace_id);
create index if not exists idx_notifications_ws
  on public.notifications(workspace_id, user_id, created_at desc);


-- ── 7. Verifikasi ──────────────────────────────────────────────────────────
do $$
declare v_missing text;
begin
  select string_agg(t, ', ') into v_missing
  from unnest(array[
    'products','categories','suppliers','notifications','store_settings',
    'org_settings','transactions','transaction_items','payments',
    'cash_sessions','branch_products'
  ]) as t
  where not exists (
    select 1 from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = t
      and c.column_name = 'workspace_id' and c.is_nullable = 'NO'
  );

  if v_missing is not null then
    raise exception 'workspace_id belum NOT NULL di: %', v_missing;
  end if;

  -- KEP-004: kedua tabel ini WAJIB tetap tanpa workspace_id
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name in ('stock_movements','audit_logs')
               and column_name='workspace_id') then
    raise exception 'KEP-004 dilanggar: stock_movements/audit_logs tidak boleh '
                    'punya workspace_id (merusak verifikasi hash chain)';
  end if;

  raise notice '0029 OK — 11 tabel bertenant, ledger tidak disentuh';
end $$;
