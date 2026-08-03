import { requireAuth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import type { PaymentBreakdown } from "@/lib/shift";

import { getSessionBreakdown, getSessionExpenses, type SessionExpenses } from "./queries";
import { ShiftsClient } from "./shifts-client";

export type ActiveShift = {
  id: string;
  opening_balance: number;
  opened_at: string;
};

export type ShiftHistoryItem = {
  id: string;
  cashier_name: string;
  branch_name: string;
  opened_at: string;
  closed_at: string | null;
  opening_balance: number;
  expected_cash: number | null;
  counted_cash: number | null;
  variance: number | null;
  total_cash: number;
  total_qris: number;
  total_transfer: number;
  total_gofood: number;
  total_shopeefood: number;
  total_grabfood: number;
  total_expenses: number;
};

export default async function ShiftsPage() {
  const { userId } = await requireAuth();
  const ctx = await getBranchContext();
  const isMaster = ctx.isMasterAdmin;
  const isManager = ctx.memberships.some((m) => m.role === "manager");
  // Master admin melihat SEMUA cabang; manajer melihat cabangnya; kasir hanya
  // shift miliknya sendiri.
  const canSeeBranch = isMaster || isManager;
  const supabase = await createClient();

  const { data: active } = await supabase
    .from("cash_sessions")
    .select("id, opening_balance, opened_at")
    .eq("cashier_id", userId)
    .eq("status", "open")
    .maybeSingle();

  const activeBreakdown: PaymentBreakdown | null = active
    ? await getSessionBreakdown(supabase, active.id)
    : null;

  const activeExpenses: SessionExpenses | null = active
    ? await getSessionExpenses(supabase, active.id)
    : null;

  let historyQuery = supabase
    .from("cash_sessions")
    .select("*, cashier:profiles(full_name), branch:branches(name)")
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(50);
  if (isMaster) {
    // semua cabang
  } else if (isManager) {
    historyQuery = historyQuery.in(
      "branch_id",
      ctx.branches.map((b) => b.id),
    );
  } else {
    historyQuery = historyQuery.eq("cashier_id", userId);
  }
  const { data: history } = await historyQuery;

  const historyItems: ShiftHistoryItem[] = (history ?? []).map((h) => {
    const cashier = h.cashier as { full_name: string } | { full_name: string }[] | null;
    const name = Array.isArray(cashier)
      ? (cashier[0]?.full_name ?? "-")
      : (cashier?.full_name ?? "-");
    const branch = h.branch as { name: string } | { name: string }[] | null;
    const branchName = Array.isArray(branch)
      ? (branch[0]?.name ?? "-")
      : (branch?.name ?? "-");
    return {
      id: h.id,
      cashier_name: name,
      branch_name: branchName,
      opened_at: h.opened_at,
      closed_at: h.closed_at,
      opening_balance: h.opening_balance,
      expected_cash: h.expected_cash,
      counted_cash: h.counted_cash,
      variance: h.variance,
      total_cash: h.total_cash,
      total_qris: h.total_qris,
      total_transfer: h.total_transfer,
      total_gofood: h.total_gofood,
      total_shopeefood: h.total_shopeefood,
      total_grabfood: h.total_grabfood ?? 0,
      total_expenses: h.total_expenses ?? 0,
    };
  });

  // Daftar bank aktif cabang (untuk pilihan sumber pengeluaran kas).
  const { data: bankRows } = ctx.activeBranchId
    ? await supabase
        .from("bank_accounts")
        .select("bank")
        .eq("branch_id", ctx.activeBranchId)
        .eq("is_active", true)
        .order("bank")
    : { data: [] as { bank: string }[] };
  const branchBanks = (bankRows ?? []).map((b) => b.bank as string);

  return (
    <ShiftsClient
      active={active ?? null}
      activeBreakdown={activeBreakdown}
      activeExpenses={activeExpenses}
      history={historyItems}
      isAdmin={canSeeBranch}
      showBranch={isMaster}
      banks={branchBanks}
    />
  );
}
