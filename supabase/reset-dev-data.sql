-- =============================================================================
-- reset-dev-data.sql — Kosongkan data operasional, sistem tetap bisa jalan.
--
-- Diminta oleh PRD-POS-Multi-Cabang-v2 §15, tapi belum pernah dibuat. Dibuat
-- 2026-08-06 setelah pemilik mengonfirmasi seluruh isi database adalah data uji.
--
-- ⚠️ TARGET: qeoeqspinyydcmoysbrb = PRODUKSI. Skrip ini MENGHAPUS data.
--
-- YANG SELALU DIPERTAHANKAN (kalau hilang, sistem RUSAK):
--   1. branches '00000000-0000-0000-0000-0000000000c1'  (Cabang Utama)
--        -> 7 kolom punya DEFAULT ke id ini + FK; 13 RPC memakainya;
--           lib/constants.ts MAIN_BRANCH_ID menunjuk ke sini.
--   2. TEPAT SATU auth.users + profiles dengan is_master_admin = true
--        -> seluruh akun lain DIHAPUS (Bagian 2e).
--        -> kalau sampai nol, TIDAK ADA yang bisa login dan pemulihannya
--           hanya lewat SQL manual.
--   3. Satu baris store_settings + satu baris org_settings
--        -> dibaca .limit(1).maybeSingle() di 17 titik; kalau kosong -> null.
--
-- =============================================================================
-- CARA PAKAI
--
--   LANGKAH 0 (WAJIB) — Ambil backup dulu:
--     Dashboard > Database > Backups.
--     Bukan karena datanya berharga, tapi karena skrip reset yang salah tulis
--     bisa merusak SKEMA, bukan cuma data.
--
--   LANGKAH 1 — Jalankan BAGIAN 0 saja (pra-terbang). Baca hasilnya.
--
--   LANGKAH 2 — UJI KERING: jalankan BAGIAN 1-2 dengan baris terakhir
--     diubah menjadi `ROLLBACK;`. Lihat apakah ada error. Tidak ada yang
--     tersimpan.
--
--   LANGKAH 3 — Ubah kembali ke `COMMIT;` lalu jalankan sungguhan.
--
--   LANGKAH 4 — Jalankan BAGIAN 3 (verifikasi).
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════
-- BAGIAN 0 — PRA-TERBANG (baca-saja). Jalankan SENDIRI dulu.
-- ═══════════════════════════════════════════════════════════════════════════
select 'transactions' as tabel, count(*) as baris from public.transactions
union all select 'stock_movements', count(*) from public.stock_movements
union all select 'audit_logs',      count(*) from public.audit_logs
union all select 'cash_sessions',   count(*) from public.cash_sessions
union all select 'products',        count(*) from public.products
union all select 'branches',        count(*) from public.branches
union all select 'profiles',        count(*) from public.profiles
order by baris desc;

-- Pastikan Cabang Utama ADA. Kalau baris ini kosong, JANGAN LANJUT —
-- lapor dulu, karena berarti asumsi dasar sistem sudah salah.
select id, code, name, is_active
from public.branches
where id = '00000000-0000-0000-0000-0000000000c1';

-- Pastikan ada minimal SATU master admin yang aktif.
-- Kalau kosong, JANGAN LANJUT — Anda akan terkunci dari sistem.
select u.email, p.full_name, p.is_master_admin, p.is_active
from public.profiles p
join auth.users u on u.id = p.id
where p.is_master_admin and p.is_active;

-- ⚠️ PALING PENTING — SIAPA YANG AKAN DISIMPAN, SIAPA YANG DIHAPUS.
-- Baca hasilnya baik-baik SEBELUM menjalankan Bagian 1-2.
-- Bila akun yang ingin Anda simpan TIDAK bertanda 'DISIMPAN',
-- isi v_keep_email di Bagian 2e dengan email yang benar.
with keeper as (
  select p.id
  from public.profiles p
  where p.is_master_admin and p.is_active
  order by p.created_at
  limit 1
)
select u.email,
       p.full_name,
       p.is_master_admin,
       p.is_active,
       p.created_at,
       case when p.id = (select id from keeper)
            then '>>> DISIMPAN <<<' else 'dihapus' end as nasib
from public.profiles p
join auth.users u on u.id = p.id
order by (p.id = (select id from keeper)) desc, p.created_at;


-- ═══════════════════════════════════════════════════════════════════════════
-- BAGIAN 1 — HAPUS DATA OPERASIONAL
-- Urutan mengikuti foreign key: anak dulu, induk belakangan.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ── 1a. Lepas guard append-only ────────────────────────────────────────────
-- guard_append_only() menolak DELETE tanpa syarat, termasuk untuk service role.
-- Tanpa langkah ini, penghapusan stock_movements & audit_logs PASTI gagal.
-- Dipasang ulang persis di 1e (definisi disalin dari dump produksi).
drop trigger if exists trg_append_only_stock_movements on public.stock_movements;
drop trigger if exists trg_append_only_audit_logs      on public.audit_logs;

-- ── 1b. Penjualan & kas ────────────────────────────────────────────────────
delete from public.payments;
delete from public.transaction_items;
delete from public.transactions;

delete from public.cash_expenses;
delete from public.cash_movements;
delete from public.cash_sessions;
delete from public.daily_closures;

-- ── 1c. Inventori & gudang ─────────────────────────────────────────────────
delete from public.stock_opname_items;
delete from public.stock_opnames;
delete from public.stock_transfer_items;
delete from public.stock_transfers;
delete from public.goods_receipt_items;
delete from public.goods_receipts;
delete from public.wastage_items;
delete from public.wastages;

-- ── 1d. Ledger, persetujuan, notifikasi ────────────────────────────────────
delete from public.approvals;
delete from public.stock_movements;   -- rantai hash dimulai ulang dari nol
delete from public.audit_logs;        -- idem
delete from public.notifications;

-- ── 1e. PASANG ULANG guard append-only ─────────────────────────────────────
-- Definisi disalin PERSIS dari dump produksi (docs/schema-dump/08-triggers.csv).
create trigger trg_append_only_stock_movements
  before delete or update on public.stock_movements
  for each row execute function public.guard_append_only();

create trigger trg_append_only_audit_logs
  before delete or update on public.audit_logs
  for each row execute function public.guard_append_only();


-- ═══════════════════════════════════════════════════════════════════════════
-- BAGIAN 2 — KATALOG & CABANG (opsional — beri komentar bila ingin disimpan)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 2a. Katalog produk ─────────────────────────────────────────────────────
delete from public.branch_products;
delete from public.products;          -- soft delete tidak dipakai di sini: benar-benar dihapus
delete from public.categories;
delete from public.suppliers;

-- ── 2b. Cabang selain Cabang Utama ─────────────────────────────────────────
-- Cabang Utama '…c1' TIDAK PERNAH dihapus (lihat kepala berkas).
delete from public.branch_memberships
  where branch_id <> '00000000-0000-0000-0000-0000000000c1';
delete from public.branch_settings
  where branch_id <> '00000000-0000-0000-0000-0000000000c1';
delete from public.bank_accounts
  where branch_id <> '00000000-0000-0000-0000-0000000000c1';
delete from public.branches
  where id <> '00000000-0000-0000-0000-0000000000c1';

-- ── 2c. Rekening bank Cabang Utama ─────────────────────────────────────────
delete from public.bank_accounts
  where branch_id = '00000000-0000-0000-0000-0000000000c1';

-- ── 2d. Pastikan singleton settings TETAP ADA ──────────────────────────────
-- Tidak dihapus — hanya dibuat bila belum ada. Kode membaca keduanya dengan
-- .limit(1).maybeSingle(); kalau kosong, UI berpotensi rusak.
insert into public.store_settings (store_name, tax_enabled, tax_percent, tax_inclusive, trx_prefix, receipt_footer)
select 'Toko 8am Business', false, 11, false, 'TRX', 'Terima kasih telah berbelanja!'
where not exists (select 1 from public.store_settings);

insert into public.org_settings (org_name)
select 'Organisasi'
where not exists (select 1 from public.org_settings);

insert into public.branch_settings (branch_id)
select '00000000-0000-0000-0000-0000000000c1'
where not exists (
  select 1 from public.branch_settings
  where branch_id = '00000000-0000-0000-0000-0000000000c1'
);

-- ── 2e. HAPUS SEMUA AKUN, SISAKAN SATU MASTER ADMIN ────────────────────────
--
-- ⚠️ PALING BERBAHAYA DI SELURUH BERKAS INI. Menghapus akun yang salah =
--    terkunci dari sistem, dan hanya bisa dipulihkan lewat SQL manual.
--
-- Aman dijalankan di sini karena Bagian 1 sudah mengosongkan 4 tabel yang
-- FK-nya ke profiles TANPA `ON DELETE` (transactions.cashier_id,
-- transactions.voided_by, cash_sessions.cashier_id, cash_expenses.created_by).
-- Kalau Bagian 1 dilewati, blok ini akan GAGAL — dan itu memang disengaja.
--
-- Rantai cascade: auth.users -> profiles -> branch_memberships + notifications.
-- FK lain (audit_logs.actor_id, approvals.*, stock_*.created_by, dll.) SET NULL.
--
-- CARA MEMILIH AKUN YANG DISIMPAN:
--   Isi v_keep_email di bawah dengan email yang ingin dipertahankan.
--   Biarkan NULL -> otomatis memilih master admin AKTIF yang PALING TUA.

do $$
declare
  v_keep_email text := null;   -- <== ISI DI SINI, mis. 'aziz@8ambusiness.com'
  v_keep_id    uuid;
  v_keep_shown text;
  v_deleted    int;
begin
  if v_keep_email is null then
    select p.id into v_keep_id
    from public.profiles p
    where p.is_master_admin and p.is_active
    order by p.created_at
    limit 1;
  else
    select p.id into v_keep_id
    from public.profiles p
    join auth.users u on u.id = p.id
    where lower(u.email) = lower(v_keep_email);
  end if;

  -- Pengaman 1: harus ketemu
  if v_keep_id is null then
    raise exception 'DIBATALKAN: akun yang akan disimpan tidak ditemukan. '
                    'Periksa v_keep_email, atau pastikan ada master admin aktif.';
  end if;

  -- Pengaman 2: yang disimpan HARUS master admin aktif
  if not exists (
    select 1 from public.profiles
    where id = v_keep_id and is_master_admin and is_active
  ) then
    raise exception 'DIBATALKAN: akun terpilih bukan master admin aktif. '
                    'Menyimpannya akan membuat Anda terkunci dari sistem.';
  end if;

  select u.email into v_keep_shown from auth.users u where u.id = v_keep_id;

  delete from auth.users where id <> v_keep_id;
  get diagnostics v_deleted = row_count;

  raise notice 'DISIMPAN : % (%)', v_keep_shown, v_keep_id;
  raise notice 'DIHAPUS  : % akun', v_deleted;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Ubah ke ROLLBACK; untuk uji kering. COMMIT; untuk menjalankan sungguhan.
-- ═══════════════════════════════════════════════════════════════════════════
commit;


-- ═══════════════════════════════════════════════════════════════════════════
-- BAGIAN 3 — VERIFIKASI (jalankan SETELAH commit)
-- ═══════════════════════════════════════════════════════════════════════════

-- Semua harus 0 kecuali branches=1, dan profiles >= 1
select 'transactions' as tabel, count(*) as baris, 0 as harusnya from public.transactions
union all select 'payments',        count(*), 0 from public.payments
union all select 'stock_movements', count(*), 0 from public.stock_movements
union all select 'audit_logs',      count(*), 0 from public.audit_logs
union all select 'cash_sessions',   count(*), 0 from public.cash_sessions
union all select 'products',        count(*), 0 from public.products
union all select 'approvals',       count(*), 0 from public.approvals
union all select 'branches',        count(*), 1 from public.branches
order by tabel;

-- Guard append-only WAJIB kembali terpasang. Harus mengembalikan 2 baris.
-- Kalau kurang dari 2, PASANG ULANG SEKARANG dari BAGIAN 1e —
-- tanpa guard ini, ledger kehilangan sifat append-only-nya.
select tgname, tgrelid::regclass as "tabel"
from pg_trigger
where not tgisinternal and tgname like 'trg_append_only%';

-- ⚠️ VERIFIKASI PALING PENTING — harus mengembalikan TEPAT SATU baris,
-- dengan is_master_admin = true dan is_active = true.
-- Kalau KOSONG, Anda terkunci: buat ulang lewat Dashboard > Authentication,
-- lalu set is_master_admin = true secara manual lewat SQL.
select u.email, p.full_name, p.is_master_admin, p.is_active, u.last_sign_in_at
from public.profiles p join auth.users u on u.id = p.id;

-- Jumlah akun tersisa — harus 1
select count(*) as akun_tersisa from auth.users;

-- Sisa keanggotaan cabang milik akun yang dihapus (harus 0 — ikut CASCADE)
select count(*) as membership_yatim
from public.branch_memberships m
where not exists (select 1 from public.profiles p where p.id = m.user_id);

-- Singleton settings ada tepat satu?
select 'store_settings' as tabel, count(*) as baris from public.store_settings
union all select 'org_settings', count(*) from public.org_settings;


-- ═══════════════════════════════════════════════════════════════════════════
-- CATATAN — apa yang TIDAK dilakukan skrip ini, dan kenapa
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. MENGHAPUS akun, menyisakan tepat SATU master admin (Bagian 2e).
--    Dilindungi dua pengaman: dibatalkan bila akun yang disimpan tidak
--    ditemukan, dan dibatalkan bila akun terpilih bukan master admin aktif.
--    Alternatif lebih aman bila akunnya sedikit: hapus manual lewat
--    Dashboard > Authentication > Users. Cara itu memakai Admin API resmi
--    dan pasti membersihkan seluruh tabel pendukung di skema auth.
--
-- 2. TIDAK menghapus berkas di Storage.
--    Foto produk lama menjadi yatim setelah katalog dihapus. Bersihkan manual
--    di Dashboard > Storage (bucket product-images), atau biarkan — nanti akan
--    dipindahkan ke path ber-prefiks workspace_id saat KEP-007 dikerjakan.
--
-- 3. TIDAK menyentuh skema, fungsi, policy, atau enum.
--    Hanya baris data. Seluruh pekerjaan migrasi multi-tenant tetap berlaku
--    penuh: perubahan skema, RLS, dan penghapusan hardcode '…c1' (KEP-009)
--    tidak berkurang sedikit pun oleh reset ini.
