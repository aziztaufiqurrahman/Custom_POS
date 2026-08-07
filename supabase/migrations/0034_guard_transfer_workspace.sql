-- =============================================================================
-- 0034_guard_transfer_workspace.sql — Tutup lubang isolasi TULIS
--
-- Rujukan: KEP-005 (temuan saat inventarisasi) · RENCANA-MIGRASI-1B §2
--
-- MASALAH: `stock_transfers` tidak punya `branch_id` — yang ada
--   from_branch_id dan to_branch_id, keduanya FK ke branches TANPA penjaga
--   apa pun. Tidak ada yang mencegah transfer stok dari cabang UMKM A ke
--   cabang UMKM B. Stok berpindah lintas tenant dan stock_movements di KEDUA
--   sisi ikut tercatat.
--
--   Ini kebocoran TULIS, bukan sekadar baca — lebih berat daripada kebocoran
--   baca biasa, karena mengubah data milik tenant lain.
--
-- Tidak pernah disebut di PRD maupun Handoff.
--
-- CHECK constraint tidak boleh memuat subquery di Postgres, jadi ditegakkan
-- lewat trigger agar tidak bisa dilewati jalur mana pun (termasuk service-role).
-- =============================================================================

create or replace function public.guard_transfer_same_workspace()
returns trigger language plpgsql security definer
set search_path = public as $$
declare v_from uuid; v_to uuid;
begin
  select workspace_id into v_from from public.branches where id = new.from_branch_id;
  select workspace_id into v_to   from public.branches where id = new.to_branch_id;

  if v_from is null or v_to is null then
    raise exception 'Cabang asal/tujuan tidak ditemukan';
  end if;

  if v_from <> v_to then
    raise exception 'Transfer stok antar-workspace tidak diizinkan '
                    '(asal: %, tujuan: %)', v_from, v_to
      using errcode = 'check_violation';
  end if;

  if new.from_branch_id = new.to_branch_id then
    raise exception 'Cabang asal dan tujuan tidak boleh sama';
  end if;

  return new;
end $$;

drop trigger if exists trg_guard_transfer_workspace on public.stock_transfers;
create trigger trg_guard_transfer_workspace
  before insert or update of from_branch_id, to_branch_id on public.stock_transfers
  for each row execute function public.guard_transfer_same_workspace();


-- ── Verifikasi ─────────────────────────────────────────────────────────────
do $$
begin
  if not exists (select 1 from pg_trigger
                 where tgname = 'trg_guard_transfer_workspace' and not tgisinternal) then
    raise exception 'Trigger penjaga transfer tidak terpasang';
  end if;
  raise notice '0034 OK — transfer lintas workspace mustahil';
end $$;
