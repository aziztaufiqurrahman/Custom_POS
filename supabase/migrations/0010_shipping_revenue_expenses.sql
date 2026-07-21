-- =============================================================================
-- 0010_shipping_revenue_expenses.sql
-- Perubahan model keuangan:
--  1) Ongkos kirim (shipping_cost) MASUK ke grand_total → jadi pendapatan &
--     nominal pembayaran (agar cocok dengan yang ditransfer konsumen).
--  2) Tabel cash_expenses (kas keluar / pengeluaran per shift) + RLS.
--     total_expenses di cash_sessions (snapshot saat tutup shift).
--  3) dashboard_analytics: tambah expenses_total (pengeluaran per rentang).
-- =============================================================================

alter table public.cash_sessions
  add column if not exists total_expenses numeric(14,2) not null default 0;

-- ---------------------------------------------------------------------------
-- Tabel pengeluaran kas (kas keluar) per shift
-- ---------------------------------------------------------------------------
create table if not exists public.cash_expenses (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  category text not null default 'lainnya',
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_cash_expenses_session on public.cash_expenses(cash_session_id);
create index if not exists idx_cash_expenses_created on public.cash_expenses(created_at);

alter table public.cash_expenses enable row level security;

drop policy if exists cash_expenses_select on public.cash_expenses;
drop policy if exists cash_expenses_insert on public.cash_expenses;
drop policy if exists cash_expenses_delete on public.cash_expenses;

-- Kasir hanya melihat pengeluaran shift miliknya; admin melihat semua.
create policy cash_expenses_select on public.cash_expenses
  for select using (
    public.is_admin() or exists (
      select 1 from public.cash_sessions s
      where s.id = cash_expenses.cash_session_id and s.cashier_id = auth.uid()
    )
  );

-- Hanya boleh mencatat pada shift MILIK sendiri yang masih terbuka.
create policy cash_expenses_insert on public.cash_expenses
  for insert with check (
    created_by = auth.uid() and exists (
      select 1 from public.cash_sessions s
      where s.id = cash_expenses.cash_session_id
        and s.status = 'open'
        and (s.cashier_id = auth.uid() or public.is_admin())
    )
  );

-- Boleh menghapus (koreksi) selama shift masih terbuka; admin kapan saja.
create policy cash_expenses_delete on public.cash_expenses
  for delete using (
    public.is_admin() or exists (
      select 1 from public.cash_sessions s
      where s.id = cash_expenses.cash_session_id
        and s.cashier_id = auth.uid() and s.status = 'open'
    )
  );

-- ---------------------------------------------------------------------------
-- create_sale — ONGKOS KIRIM kini MENAMBAH grand_total & pembayaran
-- ---------------------------------------------------------------------------
create or replace function public.create_sale(
  p_cash_session_id uuid,
  p_items jsonb,
  p_payment jsonb,
  p_order_discount numeric default 0,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_note text default null,
  p_shipping_cost numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.cash_sessions%rowtype;
  v_settings public.store_settings%rowtype;
  v_item jsonb;
  v_prod public.products%rowtype;
  v_qty numeric(14,3);
  v_line_disc numeric(14,2);
  v_line_total numeric(14,2);
  v_stock_after numeric(14,3);
  v_gross numeric(14,2) := 0;
  v_line_disc_total numeric(14,2) := 0;
  v_taxable_net numeric(14,2) := 0;
  v_tax_total numeric(14,2) := 0;
  v_discount_total numeric(14,2) := 0;
  v_grand numeric(14,2) := 0;
  v_ship numeric(14,2) := round(coalesce(p_shipping_cost, 0), 2);
  v_rate numeric := 0;
  v_trx_id uuid;
  v_code text;
  v_prefix text;
  v_datestr text;
  v_seq int;
  v_method payment_method;
  v_bank bank_code;
  v_cash_received numeric(14,2);
  v_change numeric(14,2) := 0;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Keranjang kosong';
  end if;
  if v_ship < 0 then v_ship := 0; end if;

  select * into v_session from public.cash_sessions where id = p_cash_session_id;
  if not found then raise exception 'Shift tidak ditemukan'; end if;
  if v_session.cashier_id <> v_uid and not public.is_admin() then
    raise exception 'Shift bukan milik Anda';
  end if;
  if v_session.status <> 'open' then raise exception 'Shift sudah ditutup'; end if;

  select * into v_settings from public.store_settings limit 1;

  v_method := (p_payment->>'method')::payment_method;
  v_bank := nullif(p_payment->>'bank','')::bank_code;
  if v_method = 'transfer' and v_bank is null then
    raise exception 'Bank wajib dipilih untuk transfer';
  end if;

  v_prefix := coalesce(v_settings.trx_prefix, 'TRX');
  v_datestr := to_char((now() at time zone 'Asia/Jakarta'), 'YYYYMMDD');
  perform pg_advisory_xact_lock(hashtext(v_prefix || v_datestr));
  select count(*) + 1 into v_seq
    from public.transactions
    where code like v_prefix || '-' || v_datestr || '-%';
  v_code := v_prefix || '-' || v_datestr || '-' || lpad(v_seq::text, 4, '0');

  insert into public.transactions (
    code, cashier_id, cash_session_id, customer_name, customer_phone,
    subtotal, discount_total, tax_total, grand_total, shipping_cost, status, note
  ) values (
    v_code, v_uid, p_cash_session_id, p_customer_name, p_customer_phone,
    0, 0, 0, 0, v_ship, 'completed', p_note
  ) returning id into v_trx_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Qty tidak valid'; end if;

    select * into v_prod from public.products
      where id = (v_item->>'product_id')::uuid and deleted_at is null for update;
    if not found then raise exception 'Produk tidak ditemukan / sudah dihapus'; end if;

    v_line_disc := round(coalesce((v_item->>'discount')::numeric, 0), 2);
    v_line_total := round(v_prod.sell_price * v_qty - v_line_disc, 2);
    if v_line_total < 0 then v_line_total := 0; end if;

    v_gross := v_gross + round(v_prod.sell_price * v_qty, 2);
    v_line_disc_total := v_line_disc_total + v_line_disc;
    if v_prod.is_taxable then v_taxable_net := v_taxable_net + v_line_total; end if;

    update public.products set stock = stock - v_qty
      where id = v_prod.id returning stock into v_stock_after;
    if v_stock_after < 0 then
      raise exception 'Stok % tidak cukup (tersisa %)', v_prod.name, v_prod.stock;
    end if;

    insert into public.transaction_items (
      transaction_id, product_id, product_name_snapshot, sku_snapshot,
      unit_price, qty, discount, line_total
    ) values (
      v_trx_id, v_prod.id, v_prod.name, v_prod.sku,
      v_prod.sell_price, v_qty, v_line_disc, v_line_total
    );

    insert into public.stock_movements (
      product_id, type, qty_change, stock_after, reference_id, note, created_by
    ) values (
      v_prod.id, 'sale', -v_qty, v_stock_after, v_trx_id, 'Penjualan ' || v_code, v_uid
    );
  end loop;

  if coalesce(v_settings.tax_enabled, false) then
    v_rate := coalesce(v_settings.tax_percent, 0) / 100.0;
    if coalesce(v_settings.tax_inclusive, false) then
      v_tax_total := round(v_taxable_net - (v_taxable_net / (1 + v_rate)), 2);
    else
      v_tax_total := round(v_taxable_net * v_rate, 2);
    end if;
  end if;

  v_discount_total := round(v_line_disc_total + coalesce(p_order_discount, 0), 2);
  if coalesce(v_settings.tax_enabled, false) and coalesce(v_settings.tax_inclusive, false) then
    v_grand := round(v_gross - coalesce(p_order_discount, 0), 2);
  else
    v_grand := round(v_gross - v_discount_total + v_tax_total, 2);
  end if;
  if v_grand < 0 then v_grand := 0; end if;

  -- Ongkos kirim MENAMBAH grand_total → ikut jadi pendapatan & nominal bayar.
  v_grand := round(v_grand + v_ship, 2);

  if v_method = 'cash' then
    v_cash_received := round(coalesce((p_payment->>'cash_received')::numeric, 0), 2);
    if v_cash_received < v_grand then raise exception 'Uang diterima kurang dari total'; end if;
    v_change := round(v_cash_received - v_grand, 2);
  end if;

  insert into public.payments (
    transaction_id, method, bank, amount, cash_received, change_given, reference
  ) values (
    v_trx_id, v_method, v_bank, v_grand,
    case when v_method = 'cash' then v_cash_received end,
    case when v_method = 'cash' then v_change end,
    nullif(p_payment->>'reference','')
  );

  update public.transactions set
    subtotal = v_gross, discount_total = v_discount_total,
    tax_total = v_tax_total, grand_total = v_grand
  where id = v_trx_id;

  update public.cash_sessions set
    total_cash       = total_cash       + case when v_method = 'cash'       then v_grand else 0 end,
    total_qris       = total_qris       + case when v_method = 'qris'       then v_grand else 0 end,
    total_transfer   = total_transfer   + case when v_method = 'transfer'   then v_grand else 0 end,
    total_gofood     = total_gofood     + case when v_method = 'gofood'     then v_grand else 0 end,
    total_shopeefood = total_shopeefood + case when v_method = 'shopeefood' then v_grand else 0 end
  where id = p_cash_session_id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (v_uid, 'sale.create', 'transaction', v_trx_id,
          jsonb_build_object('code', v_code, 'grand_total', v_grand, 'method', v_method,
                             'shipping_cost', v_ship));

  return jsonb_build_object(
    'transaction_id', v_trx_id, 'code', v_code,
    'grand_total', v_grand, 'change_given', v_change
  );
end;
$$;

revoke all on function public.create_sale(uuid, jsonb, jsonb, numeric, text, text, text, numeric) from public, anon;
grant execute on function public.create_sale(uuid, jsonb, jsonb, numeric, text, text, text, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- dashboard_analytics: tambah expenses_total (pengeluaran per rentang).
-- Catatan: revenue = sum(grand_total) kini SUDAH termasuk ongkos kirim.
-- shipping_total tetap informasional (berapa dari pendapatan yang berupa ongkir).
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_analytics(
  p_from timestamptz, p_to timestamptz, p_bucket text default 'day'
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  j text := 'Asia/Jakarta';
  bucket text := case when p_bucket in ('day','week','month') then p_bucket else 'day' end;
begin
  if not public.is_admin() then raise exception 'Hanya admin'; end if;
  return jsonb_build_object(
    'revenue', (select coalesce(sum(grand_total),0) from public.transactions where status='completed' and created_at between p_from and p_to),
    'tx_count', (select count(*) from public.transactions where status='completed' and created_at between p_from and p_to),
    'items_sold', (select coalesce(sum(ti.qty),0) from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to),
    'gross_profit', (select coalesce(sum(ti.line_total - ti.qty*coalesce(p.cost_price,0)),0) from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to left join public.products p on p.id=ti.product_id),
    'shipping_total', (select coalesce(sum(shipping_cost),0) from public.transactions where status='completed' and created_at between p_from and p_to),
    'expenses_total', (select coalesce(sum(amount),0) from public.cash_expenses where created_at between p_from and p_to),
    'by_method', (select coalesce(jsonb_object_agg(method, amt), '{}'::jsonb) from (select pm.method::text as method, sum(pm.amount) as amt from public.payments pm join public.transactions t on t.id=pm.transaction_id and t.status='completed' and t.created_at between p_from and p_to group by pm.method) m),
    'by_bank', (select coalesce(jsonb_object_agg(bank, amt), '{}'::jsonb) from (select pm.bank::text as bank, sum(pm.amount) as amt from public.payments pm join public.transactions t on t.id=pm.transaction_id and t.status='completed' and t.created_at between p_from and p_to where pm.method='transfer' and pm.bank is not null group by pm.bank) b),
    'trend', (select coalesce(jsonb_agg(jsonb_build_object('bucket', b, 'revenue', rev, 'tx_count', cnt) order by b), '[]'::jsonb) from (select (date_trunc(bucket, (created_at at time zone j)))::date as b, sum(grand_total) as rev, count(*) as cnt from public.transactions where status='completed' and created_at between p_from and p_to group by 1) s),
    'top_products', (select coalesce(jsonb_agg(jsonb_build_object('name', name, 'qty', qty, 'revenue', rev) order by rev desc), '[]'::jsonb) from (select ti.product_name_snapshot as name, sum(ti.qty) as qty, sum(ti.line_total) as rev from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to group by ti.product_name_snapshot order by rev desc limit 10) tp),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', cat, 'qty', qty, 'revenue', rev) order by rev desc), '[]'::jsonb) from (select coalesce(c.name,'Tanpa kategori') as cat, sum(ti.qty) as qty, sum(ti.line_total) as rev from public.transaction_items ti join public.transactions t on t.id=ti.transaction_id and t.status='completed' and t.created_at between p_from and p_to left join public.products p on p.id=ti.product_id left join public.categories c on c.id=p.category_id group by 1 order by rev desc) bc),
    'by_cashier', (select coalesce(jsonb_agg(jsonb_build_object('cashier', name, 'revenue', rev, 'tx_count', cnt) order by rev desc), '[]'::jsonb) from (select coalesce(pr.full_name,'-') as name, sum(t.grand_total) as rev, count(*) as cnt from public.transactions t left join public.profiles pr on pr.id=t.cashier_id where t.status='completed' and t.created_at between p_from and p_to group by 1 order by rev desc) bcs)
  );
end; $$;
