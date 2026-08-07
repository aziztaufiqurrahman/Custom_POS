-- =============================================================================
-- introspeksi-skema.sql — CADANGAN bila Supabase CLI tidak bisa dipakai.
--
-- CARA PAKAI: buka Supabase Dashboard -> SQL Editor. Jalankan SATU BLOK
-- sekaligus (jangan semua), lalu unduh hasilnya lewat tombol "Download CSV".
-- Simpan 9 berkas hasilnya di folder docs/schema-dump/.
--
-- Seluruh query di bawah bersifat BACA SAJA — tidak ada satu pun yang
-- mengubah data atau skema.
--
-- Jalur utama tetap `supabase db dump` (lebih akurat, satu berkas .sql).
-- Skrip ini hanya jaring pengaman.
-- =============================================================================


-- ── BLOK 1 — Enum ────────────────────────────────────────────────────────────
select t.typname as enum_name,
       string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as nilai
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
group by t.typname
order by t.typname;


-- ── BLOK 2 — Tabel & kolom ───────────────────────────────────────────────────
select c.table_name, c.ordinal_position, c.column_name, c.data_type,
       c.numeric_precision, c.numeric_scale, c.is_nullable, c.column_default
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema and t.table_name = c.table_name
where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
order by c.table_name, c.ordinal_position;


-- ── BLOK 3 — Constraint (PK / FK / UNIQUE / CHECK) ───────────────────────────
select rel.relname as tabel, con.conname as nama_constraint,
       case con.contype when 'p' then 'PRIMARY KEY' when 'f' then 'FOREIGN KEY'
                        when 'u' then 'UNIQUE'      when 'c' then 'CHECK'
                        else con.contype::text end as jenis,
       pg_get_constraintdef(con.oid) as definisi
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace n on n.oid = rel.relnamespace
where n.nspname = 'public'
order by rel.relname, con.contype, con.conname;


-- ── BLOK 4 — Index ───────────────────────────────────────────────────────────
-- Baseline sebelum menambah index komposit (workspace_id, ...) sesuai KEP-005.
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;


-- ── BLOK 5 — Status RLS per tabel ────────────────────────────────────────────
-- rls_aktif = false pada tabel mana pun adalah TEMUAN SERIUS.
select c.relname as tabel, c.relrowsecurity as rls_aktif, c.relforcerowsecurity as rls_dipaksa
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relrowsecurity, c.relname;


-- ── BLOK 6 — RLS policies (public + storage) ─────────────────────────────────
-- storage WAJIB ikut: policy foto produk & QRIS ada di sana (KEP-007).
select schemaname, tablename, policyname, permissive, roles, cmd,
       qual as using_expr, with_check as with_check_expr
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;


-- ── BLOK 7 — Functions / RPC (definisi lengkap) ──────────────────────────────
-- PALING PENTING. create_sale sudah ditulis ulang 6x di folder migrasi;
-- hanya versi di DB nyata yang sah.
select p.proname as nama,
       pg_get_function_identity_arguments(p.oid) as argumen,
       l.lanname as bahasa,
       p.prosecdef as security_definer,
       p.provolatile as volatilitas,
       pg_get_functiondef(p.oid) as definisi_lengkap
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public' and p.prokind = 'f'
order by p.proname;


-- ── BLOK 8 — Trigger (definisi lengkap, termasuk auth.users) ─────────────────
-- auth WAJIB ikut: on_auth_user_created ada di auth.users, bukan public (KEP-002).
select n.nspname as skema, c.relname as tabel, t.tgname as trigger_name,
       pg_get_triggerdef(t.oid) as definisi
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname in ('public', 'auth', 'storage')
order by n.nspname, c.relname, t.tgname;


-- ── BLOK 9 — Volume tabel & ukuran Storage ───────────────────────────────────
-- Verifikasi kelompok C di KEP-005 (mana yang benar-benar high-volume)
-- dan baseline storage_mb (KEP-007).
select relname as tabel, n_live_tup as perkiraan_baris,
       pg_size_pretty(pg_total_relation_size(relid)) as ukuran
from pg_stat_user_tables
order by n_live_tup desc;

select bucket_id,
       count(*) as jumlah_objek,
       pg_size_pretty(sum((metadata->>'size')::bigint)) as total_ukuran
from storage.objects
group by bucket_id
order by bucket_id;

-- Contoh path objek — memastikan konvensi `products/<uuid>.jpg` (KEP-007)
select bucket_id, name from storage.objects order by created_at desc limit 20;
