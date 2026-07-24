"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { createApproval, isApprover } from "@/app/(dashboard)/approvals/actions";

export type SaleDetailItem = {
  name: string;
  qty: number;
  unit_price: number;
  discount: number;
  line_total: number;
};
export type SaleDetailPayment = {
  method: "cash" | "qris" | "transfer" | "gofood" | "shopeefood";
  bank: "BNI" | "BCA" | "BSI" | null;
  amount: number;
  cash_received: number | null;
  change_given: number | null;
  reference: string | null;
};
export type SaleDetail = {
  id: string;
  code: string;
  created_at: string;
  cashier_name: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  shipping_cost: number;
  status: "completed" | "void" | "refunded";
  note: string | null;
  items: SaleDetailItem[];
  payments: SaleDetailPayment[];
};

export async function getSaleDetail(id: string): Promise<SaleDetail | null> {
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
    id: trx.id,
    code: trx.code,
    created_at: trx.created_at,
    cashier_name: cashierName,
    customer_name: trx.customer_name,
    customer_phone: trx.customer_phone,
    subtotal: trx.subtotal,
    discount_total: trx.discount_total,
    tax_total: trx.tax_total,
    grand_total: trx.grand_total,
    shipping_cost: trx.shipping_cost ?? 0,
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

type ActionResult = { error?: string; success?: boolean; pending?: boolean };

/** Ambil branch_id transaksi untuk penentuan approver. */
async function trxBranch(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("branch_id")
    .eq("id", id)
    .maybeSingle();
  return data?.branch_id ?? null;
}

export async function voidSaleAction(id: string, reason: string): Promise<ActionResult> {
  const { profile } = await getSession();
  if (!profile) return { error: "Tidak terautentikasi" };
  if (!can(profile, "transaction.void")) {
    return { error: "Tidak berwenang melakukan void" };
  }
  const branch = await trxBranch(id);
  if (!branch) return { error: "Transaksi tidak ditemukan" };

  // Segregation of duties: bukan approver → ajukan persetujuan, jangan eksekusi.
  if (!(await isApprover(branch))) {
    return createApproval({
      branch_id: branch,
      request_type: "void",
      reference_type: "transaction",
      reference_id: id,
      reason,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_sale", {
    p_transaction_id: id,
    p_reason: reason || undefined,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/sales");
  revalidatePath("/shifts");
  revalidatePath("/products");
  return { success: true };
}

export async function refundSaleAction(id: string, reason: string): Promise<ActionResult> {
  const { profile } = await getSession();
  if (!profile) return { error: "Tidak terautentikasi" };
  if (!can(profile, "transaction.refund")) {
    return { error: "Tidak berwenang melakukan refund" };
  }
  const branch = await trxBranch(id);
  if (!branch) return { error: "Transaksi tidak ditemukan" };

  if (!(await isApprover(branch))) {
    return createApproval({
      branch_id: branch,
      request_type: "refund",
      reference_type: "transaction",
      reference_id: id,
      reason,
    });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("refund_sale", {
    p_transaction_id: id,
    p_reason: reason || undefined,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/sales");
  revalidatePath("/shifts");
  revalidatePath("/products");
  return { success: true };
}
