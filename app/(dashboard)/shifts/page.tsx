import { requireAuth } from "@/lib/auth";
import { isAdmin as isAdminFn } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { PaymentBreakdown } from "@/lib/shift";

import { getSessionBreakdown } from "./queries";
import { ShiftsClient } from "./shifts-client";

export type ActiveShift = {
  id: string;
  opening_balance: number;
  opened_at: string;
};

export type ShiftHistoryItem = {
  id: string;
  cashier_name: string;
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
};

export default async function ShiftsPage() {
  const { userId, profile } = await requireAuth();
  const admin = isAdminFn(profile);
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

  let historyQuery = supabase
    .from("cash_sessions")
    .select("*, cashier:profiles(full_name)")
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(50);
  if (!admin) historyQuery = historyQuery.eq("cashier_id", userId);
  const { data: history } = await historyQuery;

  const historyItems: ShiftHistoryItem[] = (history ?? []).map((h) => {
    const cashier = h.cashier as { full_name: string } | { full_name: string }[] | null;
    const name = Array.isArray(cashier)
      ? (cashier[0]?.full_name ?? "-")
      : (cashier?.full_name ?? "-");
    return {
      id: h.id,
      cashier_name: name,
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
    };
  });

  return (
    <ShiftsClient
      active={active ?? null}
      activeBreakdown={activeBreakdown}
      history={historyItems}
      isAdmin={admin}
    />
  );
}
