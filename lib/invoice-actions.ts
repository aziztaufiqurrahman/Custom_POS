"use server";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getSessionBreakdown,
  getSessionExpenses,
} from "@/app/(dashboard)/shifts/queries";

/** Data lengkap untuk unduh invoice/struk transaksi (termasuk identitas toko). */
export type InvoiceStore = {
  name: string;
  address: string | null;
  phone: string | null;
  footer: string | null;
};

export type ReceiptInvoiceItem = {
  name: string;
  qty: number;
  unit_price: number;
  discount: number;
  line_total: number;
};

export type ReceiptInvoicePayment = {
  method: "cash" | "qris" | "transfer" | "gofood" | "shopeefood";
  bank: "BNI" | "BCA" | "BSI" | null;
  amount: number;
  cash_received: number | null;
  change_given: number | null;
  reference: string | null;
};

export type ReceiptInvoice = {
  store: InvoiceStore;
  id: string;
  code: string;
  created_at: string;
  cashier_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  shipping_cost: number;
  grand_total: number;
  status: "completed" | "void" | "refunded";
  note: string | null;
  items: ReceiptInvoiceItem[];
  payments: ReceiptInvoicePayment[];
};

async function getStore(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<InvoiceStore> {
  const { data } = await supabase
    .from("store_settings")
    .select("store_name, address, phone, receipt_footer")
    .limit(1)
    .maybeSingle();
  return {
    name: data?.store_name ?? "Toko",
    address: data?.address ?? null,
    phone: data?.phone ?? null,
    footer: data?.receipt_footer ?? null,
  };
}

export async function getReceiptInvoice(
  id: string,
): Promise<ReceiptInvoice | null> {
  const { userId } = await getSession();
  if (!userId) return null;
  const supabase = await createClient();

  const { data: trx } = await supabase
    .from("transactions")
    .select(
      "*, cashier:profiles!transactions_cashier_id_fkey(full_name), transaction_items(product_name_snapshot, qty, unit_price, discount, line_total), payments(method, bank, amount, cash_received, change_given, reference)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!trx) return null;

  const cashier = trx.cashier as { full_name: string } | { full_name: string }[] | null;
  const cashierName = Array.isArray(cashier)
    ? (cashier[0]?.full_name ?? "-")
    : (cashier?.full_name ?? "-");

  return {
    store: await getStore(supabase),
    id: trx.id,
    code: trx.code,
    created_at: trx.created_at,
    cashier_name: cashierName,
    customer_name: trx.customer_name,
    customer_phone: trx.customer_phone,
    subtotal: trx.subtotal,
    discount_total: trx.discount_total,
    tax_total: trx.tax_total,
    shipping_cost: trx.shipping_cost ?? 0,
    grand_total: trx.grand_total,
    status: trx.status,
    note: trx.note,
    items: (trx.transaction_items ?? []).map((it) => ({
      name: it.product_name_snapshot,
      qty: it.qty,
      unit_price: it.unit_price,
      discount: it.discount,
      line_total: it.line_total,
    })),
    payments: (trx.payments ?? []).map((p) => ({
      method: p.method,
      bank: p.bank,
      amount: p.amount,
      cash_received: p.cash_received,
      change_given: p.change_given,
      reference: p.reference,
    })),
  };
}

/** Data lengkap untuk unduh ringkasan shift. */
export type ShiftInvoiceExpense = {
  category: string;
  note: string | null;
  amount: number;
};

export type ShiftInvoice = {
  store: { name: string };
  id: string;
  cashier_name: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  expected_cash: number | null;
  counted_cash: number | null;
  variance: number | null;
  total_expenses: number;
  cash: number;
  qris: number;
  transfer: number;
  gofood: number;
  shopeefood: number;
  transferByBank: { BNI: number; BCA: number; BSI: number };
  count: number;
  expenses: ShiftInvoiceExpense[];
};

export async function getShiftInvoice(id: string): Promise<ShiftInvoice | null> {
  const { userId } = await getSession();
  if (!userId) return null;
  const supabase = await createClient();

  const { data: s } = await supabase
    .from("cash_sessions")
    .select("*, cashier:profiles(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!s) return null;

  const { data: settings } = await supabase
    .from("store_settings")
    .select("store_name")
    .limit(1)
    .maybeSingle();

  const b = await getSessionBreakdown(supabase, id);
  const e = await getSessionExpenses(supabase, id);
  const cashier = s.cashier as { full_name: string } | { full_name: string }[] | null;
  const cashierName = Array.isArray(cashier)
    ? (cashier[0]?.full_name ?? "-")
    : (cashier?.full_name ?? "-");

  return {
    store: { name: settings?.store_name ?? "Toko" },
    id: s.id,
    cashier_name: cashierName,
    opened_at: s.opened_at,
    closed_at: s.closed_at,
    opening_balance: s.opening_balance,
    expected_cash: s.expected_cash,
    counted_cash: s.counted_cash,
    variance: s.variance,
    total_expenses: s.total_expenses ?? 0,
    cash: b.cash,
    qris: b.qris,
    transfer: b.transfer,
    gofood: b.gofood,
    shopeefood: b.shopeefood,
    transferByBank: b.transferByBank,
    count: b.count,
    expenses: e.items.map((x) => ({
      category: x.category,
      note: x.note,
      amount: x.amount,
    })),
  };
}
