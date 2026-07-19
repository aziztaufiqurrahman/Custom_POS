-- =============================================================================
-- 0007_refund.sql — RPC refund_sale (SECURITY DEFINER).
-- Mengembalikan barang: stok +qty (movement 'refund'), status 'refunded',
-- sesuaikan ringkasan shift, catat audit. Hanya transaksi 'completed'.
-- =============================================================================

create or replace function public.refund_sale(
  p_transaction_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trx public.transactions%rowtype;
  v_item record;
  v_pay record;
  v_stock_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_admin() or public.has_permission('transaction.refund')) then
    raise exception 'Tidak berwenang melakukan refund';
  end if;

  select * into v_trx from public.transactions where id = p_transaction_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan'; end if;
  if v_trx.status <> 'completed' then
    raise exception 'Hanya transaksi selesai yang bisa di-refund';
  end if;

  for v_item in
    select product_id, qty from public.transaction_items
    where transaction_id = p_transaction_id and product_id is not null
  loop
    update public.products set stock = stock + v_item.qty
      where id = v_item.product_id returning stock into v_stock_after;
    insert into public.stock_movements
      (product_id, type, qty_change, stock_after, reference_id, note, created_by)
      values (v_item.product_id, 'refund', v_item.qty, v_stock_after, p_transaction_id,
              'Refund ' || v_trx.code, v_uid);
  end loop;

  if v_trx.cash_session_id is not null then
    for v_pay in
      select method, amount from public.payments where transaction_id = p_transaction_id
    loop
      update public.cash_sessions set
        total_cash     = total_cash     - case when v_pay.method = 'cash'     then v_pay.amount else 0 end,
        total_qris     = total_qris     - case when v_pay.method = 'qris'     then v_pay.amount else 0 end,
        total_transfer = total_transfer - case when v_pay.method = 'transfer' then v_pay.amount else 0 end
      where id = v_trx.cash_session_id;
    end loop;
  end if;

  update public.transactions set
    status = 'refunded',
    voided_by = v_uid,
    voided_at = now(),
    note = coalesce(note, '') ||
           case when p_reason is not null then ' | Refund: ' || p_reason else ' | Refund' end
  where id = p_transaction_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (v_uid, 'sale.refund', 'transaction', p_transaction_id,
            jsonb_build_object('code', v_trx.code, 'reason', p_reason));

  return jsonb_build_object('transaction_id', p_transaction_id, 'status', 'refunded');
end;
$$;

revoke all on function public.refund_sale(uuid, text) from public, anon;
grant execute on function public.refund_sale(uuid, text) to authenticated;
