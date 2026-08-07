-- =============================================================================
-- kuesioner-keputusan.sql
-- Query untuk MENJAWAB keputusan yang masih kosong, langsung dari data produksi.
--
-- CARA PAKAI: Supabase Dashboard -> SQL Editor. Jalankan SATU BLOK setiap kali,
-- lalu Download CSV. Simpan ke docs/schema-dump/.
--
-- SEMUA QUERY DI BAWAH BACA-SAJA. Tidak ada satu pun yang mengubah data.
-- Aman dijalankan di PROD.
-- =============================================================================


-- ── BLOK A — VOLUME TABEL (yang terlewat dari introspeksi kemarin) ───────────
-- Gunanya: memverifikasi KEP-005 kelompok C. Kalau ternyata `transactions` masih
-- kecil, denormalisasi workspace_id bisa disederhanakan. Kalau sudah besar,
-- backfill perlu dijadwalkan di jendela pemeliharaan.
-- Simpan sebagai: 11-volume-tabel.csv
select relname as tabel,
       n_live_tup as perkiraan_baris,
       pg_size_pretty(pg_total_relation_size(relid)) as ukuran_total
from pg_stat_user_tables
order by n_live_tup desc;


-- ── BLOK B — SIAPA CALON OWNER WORKSPACE ────────────────────────────────────
-- Menjawab: Handoff §7.2 "akun mana yang jadi Master Admin workspace untuk data lama".
-- Pilih akun dengan is_master_admin = true yang paling masuk akal sebagai PEMILIK
-- usaha (bukan akun teknis/percobaan).
-- Simpan sebagai: 12-kandidat-owner.csv
select u.email,
       p.full_name,
       p.is_master_admin,
       p.role            as peran_v1,
       p.is_active,
       p.created_at,
       u.last_sign_in_at,
       (select count(*) from public.branch_memberships m
         where m.user_id = p.id and m.is_active) as jumlah_cabang,
       (select count(*) from public.transactions t
         where t.cashier_id = p.id)              as transaksi_dibuat
from public.profiles p
join auth.users u on u.id = p.id
order by p.is_master_admin desc, p.created_at;


-- ── BLOK C — BERAPA UMKM SEBENARNYA ADA DI PROD ─────────────────────────────
-- Menjawab: PRD §4C.6 langkah 3 berasumsi "buat SATU workspace".
--
-- CARA MEMBACA HASILNYA:
--   Kalau nama cabang terlihat sebagai CABANG DARI SATU USAHA
--     (mis. "Pusat", "Cabang Depok", "Cabang Bekasi")  -> SATU workspace. Asumsi benar.
--   Kalau nama cabang terlihat sebagai USAHA BERBEDA
--     (mis. "Toko Budi", "Warung Sari")                -> BEBERAPA workspace.
--                                                          Data HARUS dipecah.
-- Simpan sebagai: 13-inventaris-cabang.csv
select b.id,
       b.code,
       b.name,
       b.is_active,
       b.created_at,
       (select count(*) from public.branch_memberships m
         where m.branch_id = b.id and m.is_active)   as anggota_aktif,
       (select count(*) from public.transactions t
         where t.branch_id = b.id)                   as jumlah_transaksi,
       (select count(*) from public.branch_products bp
         where bp.branch_id = b.id and bp.is_active) as produk_aktif
from public.branches b
order by b.created_at;


-- ── BLOK D — RENTANG & UKURAN DATA (untuk merencanakan jendela migrasi) ─────
-- Gunanya: memperkirakan berapa lama backfill workspace_id akan berjalan,
-- dan apakah butuh jendela pemeliharaan.
-- Simpan sebagai: 14-rentang-data.csv
select 'transactions'    as tabel, count(*) as baris,
       min(created_at)::date as terlama, max(created_at)::date as terbaru
  from public.transactions
union all
select 'stock_movements', count(*), min(created_at)::date, max(created_at)::date
  from public.stock_movements
union all
select 'audit_logs',      count(*), min(created_at)::date, max(created_at)::date
  from public.audit_logs
union all
select 'payments',        count(*), min(created_at)::date, max(created_at)::date
  from public.payments
union all
select 'cash_sessions',   count(*), min(opened_at)::date,  max(opened_at)::date
  from public.cash_sessions;


-- ── BLOK E — VERIFIKASI TEMUAN cash_expenses (KEP-009) ──────────────────────
-- Membuktikan temuan audit: branch_id SELALU jatuh ke default '…c1' karena
-- kode tidak pernah mengisinya. Kalau hasilnya hanya SATU baris berisi '…c1',
-- temuan itu terkonfirmasi di data nyata.
-- Simpan sebagai: 15-cek-cash-expenses.csv
select branch_id, count(*) as jumlah
from public.cash_expenses
group by branch_id;

-- Pembanding: dari cash_session-nya, cabang mana yang SEHARUSNYA tercatat?
select cs.branch_id as cabang_seharusnya, count(*) as jumlah
from public.cash_expenses ce
join public.cash_sessions cs on cs.id = ce.cash_session_id
group by cs.branch_id;


-- ── BLOK F — STATUS PITR & BACKUP (Handoff §5 poin 3) ───────────────────────
-- PITR TIDAK bisa dicek lewat SQL. Periksa manual di:
--   Dashboard -> Settings -> Add-ons -> Point in Time Recovery
--   Dashboard -> Database -> Backups
-- PITR hanya tersedia di paket Pro ke atas.
-- Catat hasilnya: PITR aktif? Retensi berapa hari? Backup terakhir kapan?
