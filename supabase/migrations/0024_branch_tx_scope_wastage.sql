-- =============================================================================
-- 0024_branch_tx_scope_wastage.sql
--
-- (#10) KRITIS: kode transaksi/penerimaan/barang-rusak dibuat per-cabang, namun
--       kolom `code` UNIQUE global → dua cabang menghasilkan kode sama →
--       "duplicate key ... transactions_code_key". Ganti ke UNIQUE (branch_id, code).
-- (#11) Shift, transaksi, pembayaran, pengeluaran: isolasi per cabang. Manajer
--       hanya cabangnya; kasir hanya miliknya; master admin semua.
-- (#4)  Barang rusak (wastage) oleh manajer WAJIB persetujuan admin sebelum stok
--       berkurang: enum approval 'wastage' + RPC request/approve/reject.
--
-- Aditif & idempoten. Cabang Utama id: 00000000-0000-0000-0000-0000000000c1
-- =============================================================================

-- ── (#10) UNIQUE per-cabang untuk kode bernomor-urut per cabang ──────────────
alter table public.transactions   drop constraint if exists transactions_code_key;
alter table public.goods_receipts drop constraint if exists goods_receipts_code_key;
alter table public.wastages       drop constraint if exists wastages_code_key;

create unique index if not exists uq_transactions_branch_code   on public.transactions(branch_id, code);
create unique index if not exists uq_goods_receipts_branch_code on public.goods_receipts(branch_id, code);
create unique index if not exists uq_wastages_branch_code       on public.wastages(branch_id, code);

-- ── (#11) RLS isolasi cabang: manajer=cabangnya, kasir=miliknya, master=semua ─
-- has_branch_role(b,'manager') sudah TRUE untuk master admin (short-circuit).
drop policy if exists sessions_select on public.cash_sessions;
create policy sessions_select on public.cash_sessions for select to authenticated
  using (public.has_branch_role(branch_id, 'manager') or cashier_id = auth.uid());

drop policy if exists sessions_insert on public.cash_sessions;
create policy sessions_insert on public.cash_sessions for insert to authenticated
  with check (
    cashier_id = auth.uid()
    and (public.is_master_admin() or branch_id in (select public.user_branch_ids()))
  );

drop policy if exists sessions_update on public.cash_sessions;
create policy sessions_update on public.cash_sessions for update to authenticated
  using (public.has_branch_role(branch_id, 'manager') or cashier_id = auth.uid())
  with check (public.has_branch_role(branch_id, 'manager') or cashier_id = auth.uid());

drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions for select to authenticated
  using (public.has_branch_role(branch_id, 'manager') or cashier_id = auth.uid());

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (exists (
    select 1 from public.transactions t
    where t.id = transaction_id
      and (public.has_branch_role(t.branch_id, 'manager') or t.cashier_id = auth.uid())
  ));

drop policy if exists cash_expenses_select on public.cash_expenses;
create policy cash_expenses_select on public.cash_expenses for select to authenticated
  using (exists (
    select 1 from public.cash_sessions s
    where s.id = cash_expenses.cash_session_id
      and (public.has_branch_role(s.branch_id, 'manager') or s.cashier_id = auth.uid())
  ));

-- ── (#4) Barang rusak butuh persetujuan admin ───────────────────────────────
alter type approval_type add value if not exists 'wastage';

-- Manajer mengajukan barang rusak: buat wastage 'pending_approval' + approval
-- 'wastage'. TIDAK mengurangi stok (menunggu persetujuan admin pusat).
create or replace function public.request_wastage(
  p_branch_id uuid, p_reason text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text; v_seq int; v_datestr text; v_wid uuid;
  v_item jsonb; v_pid uuid; v_qty numeric(14,3);
  v_items_snap jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_master_admin() or public.has_branch_permission(p_branch_id, 'stock.wastage')) then
    raise exception 'Tidak berwenang mencatat barang rusak di cabang ini';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Tidak ada item'; end if;

  v_datestr := to_char((now() at time zone 'Asia/Jakarta'), 'YYYYMMDD');
  select count(*) + 1 into v_seq from public.wastages
    where branch_id = p_branch_id and code like 'WST-' || v_datestr || '-%';
  v_code := 'WST-' || v_datestr || '-' || lpad(v_seq::text, 4, '0');

  insert into public.wastages (branch_id, code, status, reason, created_by)
    values (p_branch_id, v_code, 'pending_approval', p_reason, v_uid) returning id into v_wid;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah tidak valid'; end if;
    -- Validasi ketersediaan (stok dikurangi nanti saat disetujui).
    if not exists (select 1 from public.branch_products where branch_id = p_branch_id and product_id = v_pid) then
      raise exception 'Produk tidak tersedia di cabang';
    end if;
    insert into public.wastage_items (wastage_id, product_id, qty) values (v_wid, v_pid, v_qty);
    v_items_snap := v_items_snap || jsonb_build_object('product_id', v_pid, 'qty', v_qty);
  end loop;

  insert into public.approvals (branch_id, request_type, reference_type, reference_id, requested_by, status, reason, payload)
    values (p_branch_id, 'wastage', 'wastage', v_wid, v_uid, 'pending', p_reason,
            jsonb_build_object('wastage_code', v_code, 'items', v_items_snap));

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (p_branch_id, v_uid, 'stock.wastage_request', 'wastage', v_wid,
            jsonb_build_object('code', v_code, 'reason', p_reason));

  return jsonb_build_object('id', v_wid, 'code', v_code, 'pending', true);
end $$;
revoke all on function public.request_wastage(uuid, text, jsonb) from public, anon;
grant execute on function public.request_wastage(uuid, text, jsonb) to authenticated;

-- Admin menyetujui: kurangi stok sekarang + tandai wastage 'approved'.
create or replace function public.approve_wastage(p_wastage_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_main uuid := '00000000-0000-0000-0000-0000000000c1';
  v_w public.wastages%rowtype;
  v_it record; v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_w from public.wastages where id = p_wastage_id for update;
  if not found then raise exception 'Data barang rusak tidak ditemukan'; end if;
  if v_w.status <> 'pending_approval' then raise exception 'Barang rusak sudah diputuskan'; end if;
  if not (public.is_master_admin() or public.has_branch_role(v_w.branch_id, 'manager')
          or public.has_branch_permission(v_w.branch_id, 'approval.grant')) then
    raise exception 'Tidak berwenang menyetujui barang rusak';
  end if;

  for v_it in select product_id, qty from public.wastage_items where wastage_id = p_wastage_id
  loop
    update public.branch_products set stock = stock - v_it.qty
      where branch_id = v_w.branch_id and product_id = v_it.product_id returning stock into v_after;
    if not found then raise exception 'Produk tidak tersedia di cabang'; end if;
    if v_after < 0 then raise exception 'Stok tidak cukup untuk dibuang'; end if;
    if v_w.branch_id = v_main then update public.products set stock = v_after where id = v_it.product_id; end if;
    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
      values (v_w.branch_id, v_it.product_id, 'wastage', -v_it.qty, v_after, p_wastage_id,
              coalesce(v_w.reason, 'Barang rusak ' || v_w.code), v_uid);
  end loop;

  update public.wastages set status = 'approved', approved_by = v_uid where id = p_wastage_id;
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_w.branch_id, v_uid, 'stock.wastage', 'wastage', p_wastage_id, jsonb_build_object('code', v_w.code));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.approve_wastage(uuid) from public, anon;
grant execute on function public.approve_wastage(uuid) to authenticated;

-- Admin menolak: tandai 'rejected' tanpa mengubah stok.
create or replace function public.reject_wastage(p_wastage_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_w public.wastages%rowtype;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_w from public.wastages where id = p_wastage_id for update;
  if not found then raise exception 'Data barang rusak tidak ditemukan'; end if;
  if v_w.status <> 'pending_approval' then raise exception 'Barang rusak sudah diputuskan'; end if;
  if not (public.is_master_admin() or public.has_branch_role(v_w.branch_id, 'manager')
          or public.has_branch_permission(v_w.branch_id, 'approval.grant')) then
    raise exception 'Tidak berwenang menolak barang rusak';
  end if;

  update public.wastages set status = 'rejected', approved_by = v_uid where id = p_wastage_id;
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_w.branch_id, v_uid, 'stock.wastage_reject', 'wastage', p_wastage_id, jsonb_build_object('code', v_w.code));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.reject_wastage(uuid) from public, anon;
grant execute on function public.reject_wastage(uuid) to authenticated;
