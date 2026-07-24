-- =============================================================================
-- 0018_antifraud.sql — FASE 4: Keamanan & Anti-Fraud
--
-- 1) seq_no per cabang (gap-free) via trigger + backfill → deteksi penghapusan.
-- 2) branch_seq_gaps(): laporan celah nomor urut (indikasi transaksi terhapus).
-- 3) close_daily(): Z-report harian yang mengunci total per cabang.
--
-- Catatan: enforcement append-only + hash chain pada `transactions` (model
-- reversal) tetap ditunda agar UI void/refund & laporan tidak terganggu. seq_no
-- + gap detection + audit hash-chain (sudah aktif) memberi bukti-tamper kuat.
-- =============================================================================

-- ── 1. seq_no per cabang ────────────────────────────────────────────────────
-- Backfill urut berdasarkan waktu untuk transaksi lama.
with ordered as (
  select id, row_number() over (partition by branch_id order by created_at, id) as rn
  from public.transactions
)
update public.transactions t
set seq_no = o.rn
from ordered o
where o.id = t.id and t.seq_no is null;

create or replace function public.assign_seq_no()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.seq_no is null then
    -- Serialize per cabang agar nomor urut tanpa celah & bebas race.
    perform pg_advisory_xact_lock(hashtext('seq_no_' || new.branch_id::text));
    select coalesce(max(seq_no), 0) + 1 into new.seq_no
      from public.transactions where branch_id = new.branch_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_seq_no on public.transactions;
create trigger trg_assign_seq_no before insert on public.transactions
  for each row execute function public.assign_seq_no();

create index if not exists idx_transactions_branch_seq
  on public.transactions(branch_id, seq_no);

-- ── 2. Deteksi celah nomor urut (bukti penghapusan) ─────────────────────────
create or replace function public.branch_seq_gaps()
returns table (branch_id uuid, branch_name text, max_seq bigint, trx_count bigint, missing bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_master_admin() then
    raise exception 'Hanya Master Admin';
  end if;
  return query
    select t.branch_id, b.name, max(t.seq_no), count(*)::bigint,
           (max(t.seq_no) - count(*))::bigint
    from public.transactions t
    join public.branches b on b.id = t.branch_id
    group by t.branch_id, b.name
    having max(t.seq_no) <> count(*);
end $$;
revoke all on function public.branch_seq_gaps() from public, anon;
grant execute on function public.branch_seq_gaps() to authenticated;

-- ── 3. Z-report harian (kunci total per cabang per tanggal) ─────────────────
create or replace function public.close_daily(p_branch_id uuid, p_business_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_totals jsonb;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_master_admin() or public.has_branch_permission(p_branch_id, 'report.view')) then
    raise exception 'Tidak berwenang menutup laporan harian cabang ini';
  end if;

  select jsonb_build_object(
    'trx_count', (
      select count(*) from public.transactions t
      where t.branch_id = p_branch_id and t.status = 'completed'
        and (t.created_at at time zone 'Asia/Jakarta')::date = p_business_date),
    'gross_total', (
      select coalesce(sum(t.grand_total), 0) from public.transactions t
      where t.branch_id = p_branch_id and t.status = 'completed'
        and (t.created_at at time zone 'Asia/Jakarta')::date = p_business_date),
    'by_method', coalesce((
      select jsonb_object_agg(s.method, s.amt) from (
        select p.method::text as method, sum(p.amount) as amt
        from public.payments p
        join public.transactions t on t.id = p.transaction_id
        where t.branch_id = p_branch_id and t.status = 'completed'
          and (t.created_at at time zone 'Asia/Jakarta')::date = p_business_date
        group by p.method
      ) s), '{}'::jsonb)
  ) into v_totals;

  insert into public.daily_closures (branch_id, business_date, totals, closed_by, is_locked)
    values (p_branch_id, p_business_date, v_totals, v_uid, true)
  on conflict (branch_id, business_date) do update
    set totals = excluded.totals, closed_by = v_uid, closed_at = now(), is_locked = true;

  insert into public.audit_logs (branch_id, actor_id, action, entity, metadata)
    values (p_branch_id, v_uid, 'daily.close', 'daily_closure',
            jsonb_build_object('date', p_business_date, 'totals', v_totals));

  return v_totals;
end $$;
revoke all on function public.close_daily(uuid, date) from public, anon;
grant execute on function public.close_daily(uuid, date) to authenticated;
