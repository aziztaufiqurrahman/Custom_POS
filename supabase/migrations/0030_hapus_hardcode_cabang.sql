-- =============================================================================
-- 0030_hapus_hardcode_cabang.sql — Cabut UUID Cabang Utama yang di-hardcode
--
-- Rujukan: KEP-009 · RENCANA-MIGRASI-1B §2
--
-- MASALAH: UUID '00000000-0000-0000-0000-0000000000c1' tertanam di TIGA lapisan:
--   Lapisan 1 — DEFAULT pada 7 kolom  -> INSERT yang lupa branch_id mendarat
--               DIAM-DIAM di cabang pusat workspace pertama. NOT NULL + DEFAULT
--               berarti tidak ada error yang muncul.
--   Lapisan 2 — DEFAULT parameter pada 2 RPC SECURITY DEFINER -> dipanggil dari
--               workspace B tanpa p_branch_id, menulis ke cabang workspace A
--               tanpa ditolak RLS.
--   Lapisan 3 — variabel v_main di 13 fungsi -> hanya cabang pusat yang
--               menyalin stok ke kolom legacy products.stock. Di multi-tenant
--               tiap workspace butuh cabang pusatnya sendiri.
--
-- SOLUSI: `branches.is_main` (0028) + helper public.is_main_branch().
--
-- ⚠️ RISIKO TERTINGGI DI SELURUH FASE 1B. `create_sale` ditulis ulang untuk
--    KETUJUH kalinya. Uji regresi kasir paling ketat setelah migrasi ini.
--
-- CATATAN: seluruh badan fungsi di bawah diambil LANGSUNG dari dump produksi
--          (docs/schema-dump/07-functions.csv) lalu ditransformasi secara
--          mekanis — bukan diketik ulang. Satu-satunya perubahan:
--            - v_main dihapus            -> public.is_main_branch(<cabang>)
--            - coalesce(x, v_main)       -> x
--            - DEFAULT '…c1' pada param  -> dihapus (p_branch_id jadi wajib)
--            - sync_branch_products_insert: + filter workspace (lihat bawah)
--          Sisa logikanya IDENTIK dengan yang berjalan di produksi.
-- =============================================================================


-- ── 1. Lapisan 1 — buang DEFAULT dari 7 kolom ──────────────────────────────
-- Setelah ini, INSERT yang lupa mengisi branch_id akan GAGAL KERAS,
-- bukan mendarat diam-diam di cabang orang lain.
--
-- Audit jalur INSERT sudah dilakukan (KEP-009): dari 4 jalur tulis langsung di
-- kode aplikasi, hanya SATU yang mengandalkan default —
-- app/(dashboard)/shifts/actions.ts:166 (cash_expenses). Berkas itu DIPATCH
-- bersamaan dengan migrasi ini. Bila belum dipatch, pencatatan pengeluaran kas
-- akan langsung gagal.
alter table public.transactions    alter column branch_id drop default;
alter table public.payments        alter column branch_id drop default;
alter table public.cash_sessions   alter column branch_id drop default;
alter table public.stock_movements alter column branch_id drop default;
alter table public.stock_opnames   alter column branch_id drop default;
alter table public.cash_expenses   alter column branch_id drop default;
alter table public.bank_accounts   alter column branch_id drop default;


-- ── 2. Lapisan 2 & 3 — 13 fungsi ditulis ulang ─────────────────────────────
-- Urutan sengaja: create_sale/void/refund dulu (paling kritikal), lalu stok,
-- gudang, dan terakhir trigger sinkronisasi katalog.

CREATE OR REPLACE FUNCTION public.create_sale(p_cash_session_id uuid, p_items jsonb, p_payment jsonb, p_order_discount numeric DEFAULT 0, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_shipping_cost numeric DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_uid uuid := auth.uid();

  v_session public.cash_sessions%rowtype;

  v_settings public.store_settings%rowtype;

  v_bs public.branch_settings%rowtype;

  v_branch uuid;

  v_tax_enabled boolean; v_tax_percent numeric; v_tax_inclusive boolean;

  v_item jsonb;

  v_pid uuid; v_price numeric(14,2); v_pname text; v_psku text; v_ptax boolean;

  v_qty numeric(14,3);

  v_line_disc numeric(14,2); v_line_total numeric(14,2); v_stock_after numeric(14,3);

  v_gross numeric(14,2) := 0; v_line_disc_total numeric(14,2) := 0;

  v_taxable_net numeric(14,2) := 0; v_tax_total numeric(14,2) := 0;

  v_discount_total numeric(14,2) := 0; v_grand numeric(14,2) := 0;

  v_ship numeric(14,2) := round(coalesce(p_shipping_cost, 0), 2);

  v_rate numeric := 0;

  v_trx_id uuid; v_code text; v_prefix text; v_datestr text; v_seq int;

  v_method payment_method; v_bank text;

  v_cash_received numeric(14,2); v_change numeric(14,2) := 0;

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



  v_branch := v_session.branch_id;

  select * into v_bs from public.branch_settings where branch_id = v_branch;

  select * into v_settings from public.store_settings limit 1;

  v_tax_enabled   := coalesce(v_bs.tax_enabled, v_settings.tax_enabled, false);

  v_tax_percent   := coalesce(v_bs.tax_percent, v_settings.tax_percent, 0);

  v_tax_inclusive := coalesce(v_bs.tax_inclusive, v_settings.tax_inclusive, false);



  v_method := (p_payment->>'method')::payment_method;

  v_bank := nullif(p_payment->>'bank','');

  if v_method = 'transfer' and v_bank is null then

    raise exception 'Bank wajib dipilih untuk transfer';

  end if;



  v_prefix := coalesce(v_bs.trx_prefix, v_settings.trx_prefix, 'TRX');

  v_datestr := to_char((now() at time zone 'Asia/Jakarta'), 'YYYYMMDD');

  perform pg_advisory_xact_lock(hashtext(v_branch::text || v_prefix || v_datestr));

  select count(*) + 1 into v_seq from public.transactions

    where branch_id = v_branch and code like v_prefix || '-' || v_datestr || '-%';

  v_code := v_prefix || '-' || v_datestr || '-' || lpad(v_seq::text, 4, '0');



  insert into public.transactions (

    branch_id, code, cashier_id, cash_session_id, customer_name, customer_phone,

    subtotal, discount_total, tax_total, grand_total, shipping_cost, status, note

  ) values (

    v_branch, v_code, v_uid, p_cash_session_id, p_customer_name, p_customer_phone,

    0, 0, 0, 0, v_ship, 'completed', p_note

  ) returning id into v_trx_id;



  for v_item in select * from jsonb_array_elements(p_items)

  loop

    v_qty := (v_item->>'qty')::numeric;

    if v_qty is null or v_qty <= 0 then raise exception 'Qty tidak valid'; end if;

    v_pid := (v_item->>'product_id')::uuid;



    select bp.price, p.name, p.sku, p.is_taxable

      into v_price, v_pname, v_psku, v_ptax

      from public.branch_products bp

      join public.products p on p.id = bp.product_id

      where bp.branch_id = v_branch and bp.product_id = v_pid

        and bp.is_active and p.deleted_at is null

      for update of bp;

    if not found then raise exception 'Produk tidak tersedia di cabang ini'; end if;



    v_line_disc := round(coalesce((v_item->>'discount')::numeric, 0), 2);

    v_line_total := round(v_price * v_qty - v_line_disc, 2);

    if v_line_total < 0 then v_line_total := 0; end if;

    v_gross := v_gross + round(v_price * v_qty, 2);

    v_line_disc_total := v_line_disc_total + v_line_disc;

    if v_ptax then v_taxable_net := v_taxable_net + v_line_total; end if;



    update public.branch_products set stock = stock - v_qty

      where branch_id = v_branch and product_id = v_pid returning stock into v_stock_after;

    if v_stock_after < 0 then raise exception 'Stok % tidak cukup', v_pname; end if;

    if public.is_main_branch(v_branch) then

      update public.products set stock = v_stock_after where id = v_pid;

    end if;



    insert into public.transaction_items (

      transaction_id, product_id, product_name_snapshot, sku_snapshot,

      unit_price, qty, discount, line_total

    ) values (

      v_trx_id, v_pid, v_pname, v_psku, v_price, v_qty, v_line_disc, v_line_total

    );



    insert into public.stock_movements (

      branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by

    ) values (

      v_branch, v_pid, 'sale', -v_qty, v_stock_after, v_trx_id, 'Penjualan ' || v_code, v_uid

    );

  end loop;



  if v_tax_enabled then

    v_rate := v_tax_percent / 100.0;

    if v_tax_inclusive then

      v_tax_total := round(v_taxable_net - (v_taxable_net / (1 + v_rate)), 2);

    else

      v_tax_total := round(v_taxable_net * v_rate, 2);

    end if;

  end if;



  v_discount_total := round(v_line_disc_total + coalesce(p_order_discount, 0), 2);

  if v_tax_enabled and v_tax_inclusive then

    v_grand := round(v_gross - coalesce(p_order_discount, 0), 2);

  else

    v_grand := round(v_gross - v_discount_total + v_tax_total, 2);

  end if;

  if v_grand < 0 then v_grand := 0; end if;

  v_grand := round(v_grand + v_ship, 2);



  if v_method = 'cash' then

    v_cash_received := round(coalesce((p_payment->>'cash_received')::numeric, 0), 2);

    if v_cash_received < v_grand then raise exception 'Uang diterima kurang dari total'; end if;

    v_change := round(v_cash_received - v_grand, 2);

  end if;



  insert into public.payments (

    branch_id, transaction_id, method, bank, amount, cash_received, change_given, reference

  ) values (

    v_branch, v_trx_id, v_method, v_bank, v_grand,

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

    total_shopeefood = total_shopeefood + case when v_method = 'shopeefood' then v_grand else 0 end,

    total_grabfood   = total_grabfood   + case when v_method = 'grabfood'   then v_grand else 0 end

  where id = p_cash_session_id;



  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)

  values (v_branch, v_uid, 'sale.create', 'transaction', v_trx_id,

          jsonb_build_object('code', v_code, 'grand_total', v_grand, 'method', v_method,

                             'shipping_cost', v_ship));



  return jsonb_build_object('transaction_id', v_trx_id, 'code', v_code,

                            'grand_total', v_grand, 'change_given', v_change);

end;

$function$;


CREATE OR REPLACE FUNCTION public.void_sale(p_transaction_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_uid uuid := auth.uid();

  v_trx public.transactions%rowtype;

  v_item record; v_pay record; v_stock_after numeric(14,3);

begin

  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;

  if not (public.is_admin() or public.has_permission('transaction.void')) then

    raise exception 'Tidak berwenang melakukan void';

  end if;

  select * into v_trx from public.transactions where id = p_transaction_id for update;

  if not found then raise exception 'Transaksi tidak ditemukan'; end if;

  if v_trx.status <> 'completed' then raise exception 'Hanya transaksi selesai yang bisa di-void'; end if;



  for v_item in

    select product_id, qty from public.transaction_items

    where transaction_id = p_transaction_id and product_id is not null

  loop

    update public.branch_products set stock = stock + v_item.qty

      where branch_id = v_trx.branch_id and product_id = v_item.product_id

      returning stock into v_stock_after;

    if found then

      if public.is_main_branch(v_trx.branch_id) then

        update public.products set stock = v_stock_after where id = v_item.product_id;

      end if;

      insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)

        values (v_trx.branch_id, v_item.product_id, 'void', v_item.qty, v_stock_after, p_transaction_id, 'Void ' || v_trx.code, v_uid);

    end if;

  end loop;



  if v_trx.cash_session_id is not null then

    for v_pay in select method, amount from public.payments where transaction_id = p_transaction_id

    loop

      update public.cash_sessions set

        total_cash       = total_cash       - case when v_pay.method = 'cash'       then v_pay.amount else 0 end,

        total_qris       = total_qris       - case when v_pay.method = 'qris'       then v_pay.amount else 0 end,

        total_transfer   = total_transfer   - case when v_pay.method = 'transfer'   then v_pay.amount else 0 end,

        total_gofood     = total_gofood     - case when v_pay.method = 'gofood'     then v_pay.amount else 0 end,

        total_shopeefood = total_shopeefood - case when v_pay.method = 'shopeefood' then v_pay.amount else 0 end,

        total_grabfood   = total_grabfood   - case when v_pay.method = 'grabfood'   then v_pay.amount else 0 end

      where id = v_trx.cash_session_id;

    end loop;

  end if;



  update public.transactions set

    status = 'void', voided_by = v_uid, voided_at = now(),

    note = coalesce(note, '') || case when p_reason is not null then ' | Void: ' || p_reason else ' | Void' end

  where id = p_transaction_id;



  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)

  values (v_trx.branch_id, v_uid, 'sale.void', 'transaction', p_transaction_id, jsonb_build_object('code', v_trx.code, 'reason', p_reason));

  return jsonb_build_object('transaction_id', p_transaction_id, 'status', 'void');

end; $function$;


CREATE OR REPLACE FUNCTION public.refund_sale(p_transaction_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_uid uuid := auth.uid();

  v_trx public.transactions%rowtype;

  v_item record; v_pay record; v_stock_after numeric(14,3);

begin

  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;

  if not (public.is_admin() or public.has_permission('transaction.refund')) then

    raise exception 'Tidak berwenang melakukan refund';

  end if;

  select * into v_trx from public.transactions where id = p_transaction_id for update;

  if not found then raise exception 'Transaksi tidak ditemukan'; end if;

  if v_trx.status <> 'completed' then raise exception 'Hanya transaksi selesai yang bisa di-refund'; end if;



  for v_item in

    select product_id, qty from public.transaction_items

    where transaction_id = p_transaction_id and product_id is not null

  loop

    update public.branch_products set stock = stock + v_item.qty

      where branch_id = v_trx.branch_id and product_id = v_item.product_id

      returning stock into v_stock_after;

    if found then

      if public.is_main_branch(v_trx.branch_id) then

        update public.products set stock = v_stock_after where id = v_item.product_id;

      end if;

      insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)

        values (v_trx.branch_id, v_item.product_id, 'refund', v_item.qty, v_stock_after, p_transaction_id, 'Refund ' || v_trx.code, v_uid);

    end if;

  end loop;



  if v_trx.cash_session_id is not null then

    for v_pay in select method, amount from public.payments where transaction_id = p_transaction_id

    loop

      update public.cash_sessions set

        total_cash       = total_cash       - case when v_pay.method = 'cash'       then v_pay.amount else 0 end,

        total_qris       = total_qris       - case when v_pay.method = 'qris'       then v_pay.amount else 0 end,

        total_transfer   = total_transfer   - case when v_pay.method = 'transfer'   then v_pay.amount else 0 end,

        total_gofood     = total_gofood     - case when v_pay.method = 'gofood'     then v_pay.amount else 0 end,

        total_shopeefood = total_shopeefood - case when v_pay.method = 'shopeefood' then v_pay.amount else 0 end,

        total_grabfood   = total_grabfood   - case when v_pay.method = 'grabfood'   then v_pay.amount else 0 end

      where id = v_trx.cash_session_id;

    end loop;

  end if;



  update public.transactions set

    status = 'refunded', voided_by = v_uid, voided_at = now(),

    note = coalesce(note, '') || case when p_reason is not null then ' | Refund: ' || p_reason else ' | Refund' end

  where id = p_transaction_id;



  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)

  values (v_trx.branch_id, v_uid, 'sale.refund', 'transaction', p_transaction_id, jsonb_build_object('code', v_trx.code, 'reason', p_reason));

  return jsonb_build_object('transaction_id', p_transaction_id, 'status', 'refunded');

end; $function$;


-- KEP-009 Lapisan 2 — `p_branch_id` kehilangan DEFAULT '…c1', sehingga harus
-- PINDAH ke depan parameter yang masih ber-default (Postgres melarang parameter
-- tanpa default berada setelah parameter ber-default).
--
-- Karena urutan tipe berubah, `CREATE OR REPLACE` akan membuat OVERLOAD BARU
-- dan meninggalkan versi lama yang masih ber-default '…c1' tetap hidup —
-- justru membatalkan tujuan KEP-009, dan membuat PostgREST ambigu saat
-- memanggil lewat nama argumen. Versi lama WAJIB di-drop lebih dulu.
--
-- Aman bagi pemanggil: ketiga call site (`inventory/actions.ts`,
-- `approvals/actions.ts`) memakai argumen bernama, jadi urutan tidak mengikat.
-- `p_note` / `p_new_cost` tetap ber-default karena supabase-js membuang
-- properti bernilai `undefined` dari body permintaan.
drop function if exists public.adjust_stock(uuid, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.adjust_stock(p_product_id uuid, p_new_qty numeric, p_branch_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_branch uuid := p_branch_id;
  v_old numeric(14,3); v_delta numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if v_branch is null then
    raise exception 'p_branch_id wajib diisi (KEP-009: tidak ada lagi cabang default)';
  end if;
  if not (public.is_admin() or public.has_branch_permission(v_branch, 'stock.adjust')) then
    raise exception 'Tidak berwenang menyesuaikan stok';
  end if;
  if p_new_qty is null or p_new_qty < 0 then raise exception 'Nilai stok tidak valid'; end if;

  select stock into v_old from public.branch_products
    where branch_id = v_branch and product_id = p_product_id for update;
  if not found then raise exception 'Produk tidak tersedia di cabang'; end if;

  v_delta := p_new_qty - v_old;
  update public.branch_products set stock = p_new_qty
    where branch_id = v_branch and product_id = p_product_id;
  if public.is_main_branch(v_branch) then
    update public.products set stock = p_new_qty where id = p_product_id;
  end if;

  insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, note, created_by)
    values (v_branch, p_product_id, 'adjustment', v_delta, p_new_qty, coalesce(p_note, 'Koreksi stok'), v_uid);
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_branch, v_uid, 'stock.adjust', 'product', p_product_id, jsonb_build_object('from', v_old, 'to', p_new_qty));

  return jsonb_build_object('stock_after', p_new_qty, 'delta', v_delta);
end; $function$;


-- Alasan drop + pemindahan `p_branch_id` sama seperti adjust_stock di atas.
drop function if exists public.restock_product(uuid, numeric, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.restock_product(p_product_id uuid, p_qty numeric, p_branch_id uuid, p_new_cost numeric DEFAULT NULL::numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_branch uuid := p_branch_id;
  v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if v_branch is null then
    raise exception 'p_branch_id wajib diisi (KEP-009: tidak ada lagi cabang default)';
  end if;
  if not (public.is_admin() or public.has_branch_permission(v_branch, 'stock.receive')) then
    raise exception 'Tidak berwenang menambah stok';
  end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Jumlah harus lebih dari 0'; end if;

  update public.branch_products set stock = stock + p_qty
    where branch_id = v_branch and product_id = p_product_id
    returning stock into v_after;
  if not found then raise exception 'Produk tidak tersedia di cabang'; end if;

  -- HPP global (base_cost_price + cost_price legacy).
  if p_new_cost is not null then
    update public.products set base_cost_price = p_new_cost, cost_price = p_new_cost
      where id = p_product_id;
  end if;
  if public.is_main_branch(v_branch) then
    update public.products set stock = v_after where id = p_product_id;
  end if;

  insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, note, created_by)
    values (v_branch, p_product_id, 'restock', p_qty, v_after, coalesce(p_note, 'Barang masuk'), v_uid);
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_branch, v_uid, 'stock.restock', 'product', p_product_id, jsonb_build_object('qty', p_qty, 'new_cost', p_new_cost));

  return jsonb_build_object('stock_after', v_after);
end; $function$;


CREATE OR REPLACE FUNCTION public.complete_opname(p_opname_id uuid, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_op public.stock_opnames%rowtype;
  v_branch uuid;
  v_item jsonb; v_prod public.products%rowtype;
  v_sys numeric(14,3); v_phys numeric(14,3); v_diff numeric(14,3);
  v_reason text; v_changed int := 0;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_admin() or public.has_permission('stock.opname')) then
    raise exception 'Tidak berwenang melakukan stock opname';
  end if;

  select * into v_op from public.stock_opnames where id = p_opname_id for update;
  if not found then raise exception 'Sesi opname tidak ditemukan'; end if;
  if v_op.status <> 'draft' then raise exception 'Sesi opname sudah selesai'; end if;
  if not (public.is_admin() or v_op.created_by = v_uid) then
    raise exception 'Sesi opname bukan milik Anda';
  end if;
  v_branch := v_op.branch_id;

  delete from public.stock_opname_items where opname_id = p_opname_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_prod from public.products
      where id = (v_item->>'product_id')::uuid and deleted_at is null;
    if not found then continue; end if;

    select stock into v_sys from public.branch_products
      where branch_id = v_branch and product_id = v_prod.id for update;
    if not found then continue; end if;

    v_phys := (v_item->>'physical_qty')::numeric;
    if v_phys is null or v_phys < 0 then raise exception 'Qty fisik tidak valid untuk %', v_prod.name; end if;
    v_diff := v_phys - v_sys;
    v_reason := nullif(btrim(coalesce(v_item->>'reason', '')), '');
    if v_diff <> 0 and v_reason is null then
      raise exception 'Alasan wajib untuk selisih pada %', v_prod.name;
    end if;

    insert into public.stock_opname_items (opname_id, product_id, system_qty, physical_qty, difference, reason)
      values (p_opname_id, v_prod.id, v_sys, v_phys, v_diff, v_reason);

    if v_diff <> 0 then
      update public.branch_products set stock = v_phys
        where branch_id = v_branch and product_id = v_prod.id;
      if public.is_main_branch(v_branch) then
        update public.products set stock = v_phys where id = v_prod.id;
      end if;
      insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
        values (v_branch, v_prod.id, 'opname', v_diff, v_phys, p_opname_id, coalesce(v_reason, 'Stock opname'), v_uid);
      v_changed := v_changed + 1;
    end if;
  end loop;

  update public.stock_opnames set status = 'completed', completed_at = now() where id = p_opname_id;
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_branch, v_uid, 'stock.opname_complete', 'stock_opname', p_opname_id, jsonb_build_object('changed', v_changed));

  return jsonb_build_object('changed', v_changed);
end; $function$;


CREATE OR REPLACE FUNCTION public.receive_goods(p_branch_id uuid, p_supplier_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_code text; v_seq int; v_datestr text; v_rid uuid;
  v_item jsonb; v_pid uuid; v_qty numeric(14,3); v_cost numeric(14,2); v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not (public.is_master_admin() or public.has_branch_permission(p_branch_id, 'stock.receive')) then
    raise exception 'Tidak berwenang menerima barang di cabang ini';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Tidak ada item'; end if;

  v_datestr := to_char((now() at time zone 'Asia/Jakarta'), 'YYYYMMDD');
  select count(*) + 1 into v_seq from public.goods_receipts
    where branch_id = p_branch_id and code like 'GRN-' || v_datestr || '-%';
  v_code := 'GRN-' || v_datestr || '-' || lpad(v_seq::text, 4, '0');

  insert into public.goods_receipts (branch_id, code, supplier_id, status, received_by, received_at, note)
    values (p_branch_id, v_code, p_supplier_id, 'received', v_uid, now(), p_note)
    returning id into v_rid;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    v_cost := nullif(v_item->>'cost_price','')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah tidak valid'; end if;

    insert into public.goods_receipt_items (receipt_id, product_id, qty, cost_price)
      values (v_rid, v_pid, v_qty, v_cost);

    update public.branch_products set stock = stock + v_qty
      where branch_id = p_branch_id and product_id = v_pid returning stock into v_after;
    if not found then raise exception 'Produk tidak tersedia di cabang'; end if;

    if v_cost is not null then
      update public.products set base_cost_price = v_cost, cost_price = v_cost where id = v_pid;
    end if;
    if public.is_main_branch(p_branch_id) then
      update public.products set stock = v_after where id = v_pid;
    end if;

    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
      values (p_branch_id, v_pid, 'restock', v_qty, v_after, v_rid, coalesce(p_note, 'Penerimaan ' || v_code), v_uid);
  end loop;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (p_branch_id, v_uid, 'stock.receive', 'goods_receipt', v_rid, jsonb_build_object('code', v_code));

  return jsonb_build_object('id', v_rid, 'code', v_code);
end $function$;


CREATE OR REPLACE FUNCTION public.record_wastage(p_branch_id uuid, p_reason text, p_photo_url text DEFAULT NULL::text, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_code text; v_seq int; v_datestr text; v_wid uuid;
  v_item jsonb; v_pid uuid; v_qty numeric(14,3); v_after numeric(14,3);
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

  insert into public.wastages (branch_id, code, status, reason, photo_url, created_by, approved_by)
    values (p_branch_id, v_code, 'approved', p_reason, p_photo_url, v_uid, v_uid)
    returning id into v_wid;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_pid := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Jumlah tidak valid'; end if;

    insert into public.wastage_items (wastage_id, product_id, qty) values (v_wid, v_pid, v_qty);

    update public.branch_products set stock = stock - v_qty
      where branch_id = p_branch_id and product_id = v_pid returning stock into v_after;
    if not found then raise exception 'Produk tidak tersedia di cabang'; end if;
    if v_after < 0 then raise exception 'Stok tidak cukup untuk dibuang'; end if;
    if public.is_main_branch(p_branch_id) then
      update public.products set stock = v_after where id = v_pid;
    end if;

    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
      values (p_branch_id, v_pid, 'wastage', -v_qty, v_after, v_wid, coalesce(p_reason, 'Barang rusak ' || v_code), v_uid);
  end loop;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (p_branch_id, v_uid, 'stock.wastage', 'wastage', v_wid, jsonb_build_object('code', v_code, 'reason', p_reason));

  return jsonb_build_object('id', v_wid, 'code', v_code);
end $function$;


CREATE OR REPLACE FUNCTION public.approve_wastage(p_wastage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$

declare

  v_uid uuid := auth.uid();

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

    if public.is_main_branch(v_w.branch_id) then update public.products set stock = v_after where id = v_it.product_id; end if;

    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)

      values (v_w.branch_id, v_it.product_id, 'wastage', -v_it.qty, v_after, p_wastage_id,

              coalesce(v_w.reason, 'Barang rusak ' || v_w.code), v_uid);

  end loop;



  update public.wastages set status = 'approved', approved_by = v_uid where id = p_wastage_id;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)

    values (v_w.branch_id, v_uid, 'stock.wastage', 'wastage', p_wastage_id, jsonb_build_object('code', v_w.code));

  return jsonb_build_object('ok', true);

end $function$;


CREATE OR REPLACE FUNCTION public.dispatch_transfer(p_transfer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_t public.stock_transfers%rowtype;
  v_it record; v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_t from public.stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.status <> 'draft' then raise exception 'Transfer sudah diproses'; end if;
  if not (public.is_master_admin() or public.has_branch_permission(v_t.from_branch_id, 'stock.transfer_request')) then
    raise exception 'Tidak berwenang mengirim transfer ini';
  end if;

  for v_it in select product_id, qty from public.stock_transfer_items where transfer_id = p_transfer_id
  loop
    update public.branch_products set stock = stock - v_it.qty
      where branch_id = v_t.from_branch_id and product_id = v_it.product_id returning stock into v_after;
    if not found then raise exception 'Produk tidak ada di cabang asal'; end if;
    if v_after < 0 then raise exception 'Stok cabang asal tidak cukup'; end if;
    if public.is_main_branch(v_t.from_branch_id) then update public.products set stock = v_after where id = v_it.product_id; end if;
    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
      values (v_t.from_branch_id, v_it.product_id, 'transfer_out', -v_it.qty, v_after, p_transfer_id, 'Transfer keluar ' || v_t.code, v_uid);
  end loop;

  update public.stock_transfers set status = 'dispatched', dispatched_by = v_uid, dispatched_at = now() where id = p_transfer_id;
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_t.from_branch_id, v_uid, 'transfer.dispatch', 'stock_transfer', p_transfer_id, jsonb_build_object('code', v_t.code));
  return jsonb_build_object('status', 'dispatched');
end $function$;


CREATE OR REPLACE FUNCTION public.receive_transfer(p_transfer_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_t public.stock_transfers%rowtype;
  v_it record; v_after numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  select * into v_t from public.stock_transfers where id = p_transfer_id for update;
  if not found then raise exception 'Transfer tidak ditemukan'; end if;
  if v_t.status <> 'dispatched' then raise exception 'Transfer belum dikirim / sudah diterima'; end if;
  if not (public.is_master_admin() or public.has_branch_permission(v_t.to_branch_id, 'stock.transfer_receive')) then
    raise exception 'Tidak berwenang menerima transfer ini';
  end if;

  for v_it in select product_id, qty from public.stock_transfer_items where transfer_id = p_transfer_id
  loop
    -- Pastikan baris katalog cabang tujuan ada.
    insert into public.branch_products (branch_id, product_id, price, min_stock, stock, is_active)
      select v_t.to_branch_id, v_it.product_id, coalesce(p.sell_price, 0), 0, 0, true
      from public.products p where p.id = v_it.product_id
      on conflict (branch_id, product_id) do nothing;

    update public.branch_products set stock = stock + v_it.qty
      where branch_id = v_t.to_branch_id and product_id = v_it.product_id returning stock into v_after;
    if public.is_main_branch(v_t.to_branch_id) then update public.products set stock = v_after where id = v_it.product_id; end if;
    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, reference_id, note, created_by)
      values (v_t.to_branch_id, v_it.product_id, 'transfer_in', v_it.qty, v_after, p_transfer_id, 'Transfer masuk ' || v_t.code, v_uid);
  end loop;

  update public.stock_transfers set status = 'received', received_by = v_uid, received_at = now() where id = p_transfer_id;
  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (v_t.to_branch_id, v_uid, 'transfer.receive', 'stock_transfer', p_transfer_id, jsonb_build_object('code', v_t.code));
  return jsonb_build_object('status', 'received');
end $function$;


CREATE OR REPLACE FUNCTION public.set_branch_price_stock(p_branch_id uuid, p_product_id uuid, p_price numeric, p_stock numeric, p_min_stock numeric DEFAULT NULL::numeric, p_is_active boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_old_stock numeric(14,3);
  v_delta numeric(14,3);
begin
  if v_uid is null then raise exception 'Tidak terautentikasi'; end if;
  if not public.is_master_admin() then
    raise exception 'Hanya admin pusat yang dapat mengatur harga & stok cabang';
  end if;
  if p_price is null or p_price < 0 then raise exception 'Harga tidak valid'; end if;
  if p_stock is null or p_stock < 0 then raise exception 'Stok tidak valid'; end if;

  -- Pastikan produk ada & belum dihapus.
  if not exists (select 1 from public.products where id = p_product_id and deleted_at is null) then
    raise exception 'Produk tidak ditemukan';
  end if;

  select stock into v_old_stock from public.branch_products
    where branch_id = p_branch_id and product_id = p_product_id
    for update;

  if not found then
    -- Katalog cabang belum punya baris produk ini (mis. produk khusus cabang lain
    -- yang kini disediakan pusat) — buat barisnya.
    insert into public.branch_products (branch_id, product_id, price, min_stock, stock, is_active)
      values (p_branch_id, p_product_id, p_price, coalesce(p_min_stock, 0), 0, coalesce(p_is_active, true));
    v_old_stock := 0;
  end if;

  update public.branch_products set
    price = p_price,
    min_stock = coalesce(p_min_stock, min_stock),
    is_active = coalesce(p_is_active, is_active)
  where branch_id = p_branch_id and product_id = p_product_id;

  v_delta := p_stock - v_old_stock;
  if v_delta <> 0 then
    update public.branch_products set stock = p_stock
      where branch_id = p_branch_id and product_id = p_product_id;
    if public.is_main_branch(p_branch_id) then
      update public.products set stock = p_stock where id = p_product_id;
    end if;
    insert into public.stock_movements (branch_id, product_id, type, qty_change, stock_after, note, created_by)
      values (p_branch_id, p_product_id, 'adjustment', v_delta, p_stock, 'Set stok awal (pusat)', v_uid);
  end if;

  insert into public.audit_logs (branch_id, actor_id, action, entity, entity_id, metadata)
    values (p_branch_id, v_uid, 'branch_product.set', 'product', p_product_id,
            jsonb_build_object('price', p_price, 'stock', p_stock, 'delta', v_delta));

  return jsonb_build_object('ok', true, 'stock', p_stock, 'delta', v_delta, 'price', p_price);
end;
$function$;


CREATE OR REPLACE FUNCTION public.sync_branch_products_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.branch_products (branch_id, product_id, price, min_stock, stock, is_active)
  select b.id, new.id, coalesce(new.sell_price, 0), coalesce(new.min_stock, 0),
         case when b.is_main then coalesce(new.stock, 0) else 0 end,
         coalesce(new.is_active, true)
  from public.branches b
  where b.workspace_id = new.workspace_id
  on conflict (branch_id, product_id) do nothing;
  return new;
end $function$;


-- ── 3. Verifikasi ──────────────────────────────────────────────────────────
do $$
declare v_def int; v_fn int;
begin
  -- Tidak boleh ada lagi DEFAULT yang menunjuk cabang pusat
  select count(*) into v_def
  from information_schema.columns
  where table_schema = 'public' and column_name = 'branch_id'
    and column_default like '%0000000000c1%';
  if v_def > 0 then
    raise exception 'Masih ada % kolom ber-DEFAULT cabang hardcode', v_def;
  end if;

  -- Tidak boleh ada lagi fungsi yang menanam UUID cabang pusat
  -- prokind='f' WAJIB: pg_get_functiondef() melempar error untuk aggregate
  -- ('array_agg is an aggregate function'), window function, dan prosedur.
  select count(*) into v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and pg_get_functiondef(p.oid) like '%0000000000c1%';
  if v_fn > 0 then
    raise exception 'Masih ada % fungsi dengan UUID cabang hardcode', v_fn;
  end if;

  raise notice '0030 OK — 7 DEFAULT dicabut, 13 fungsi bebas hardcode';
  raise notice 'WAJIB: patch app/(dashboard)/shifts/actions.ts:166 sebelum dipakai';
end $$;
