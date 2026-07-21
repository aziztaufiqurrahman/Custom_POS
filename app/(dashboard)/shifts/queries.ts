import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { emptyBreakdown, type Bank, type PaymentBreakdown } from "@/lib/shift";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

/**
 * Hitung breakdown pembayaran (cash/qris/transfer per bank) untuk sebuah shift
 * dari data payments transaksi berstatus 'completed'. Otoritatif & tunduk RLS.
 */
export async function getSessionBreakdown(
  supabase: Client,
  sessionId: string,
): Promise<PaymentBreakdown> {
  const result = emptyBreakdown();

  const { data: trx } = await supabase
    .from("transactions")
    .select("id")
    .eq("cash_session_id", sessionId)
    .eq("status", "completed");

  const ids = (trx ?? []).map((t) => t.id);
  result.count = ids.length;
  if (ids.length === 0) return result;

  const { data: pays } = await supabase
    .from("payments")
    .select("method, bank, amount")
    .in("transaction_id", ids);

  for (const p of pays ?? []) {
    if (p.method === "cash") result.cash += p.amount;
    else if (p.method === "qris") result.qris += p.amount;
    else if (p.method === "gofood") result.gofood += p.amount;
    else if (p.method === "shopeefood") result.shopeefood += p.amount;
    else if (p.method === "transfer") {
      result.transfer += p.amount;
      if (p.bank) result.transferByBank[p.bank as Bank] += p.amount;
    }
  }
  return result;
}

export type ExpenseItem = {
  id: string;
  amount: number;
  category: string;
  note: string | null;
  created_at: string;
};

export type SessionExpenses = { total: number; items: ExpenseItem[] };

/** Daftar & total pengeluaran (kas keluar) satu shift. Tunduk RLS. */
export async function getSessionExpenses(
  supabase: Client,
  sessionId: string,
): Promise<SessionExpenses> {
  const { data } = await supabase
    .from("cash_expenses")
    .select("id, amount, category, note, created_at")
    .eq("cash_session_id", sessionId)
    .order("created_at", { ascending: false });

  const items = (data ?? []) as ExpenseItem[];
  const total = items.reduce((s, e) => s + e.amount, 0);
  return { total, items };
}
