"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { computeReconciliation, type PaymentBreakdown } from "@/lib/shift";
import { closeShiftSchema, openShiftSchema } from "@/lib/validations/shift";

import { getSessionBreakdown } from "./queries";

export type ShiftActionResult = { error?: string; success?: boolean };

export async function openShift(raw: unknown): Promise<ShiftActionResult> {
  const { userId, profile } = await getSession();
  if (!userId || !profile) return { error: "Tidak terautentikasi" };

  const parsed = openShiftSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_sessions")
    .insert({
      cashier_id: userId,
      opening_balance: parsed.data.opening_balance,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      return { error: "Anda masih memiliki shift yang aktif" };
    }
    return { error: "Gagal membuka shift" };
  }

  await logAudit({
    action: "shift.open",
    entity: "cash_session",
    entityId: data.id,
    metadata: { opening_balance: parsed.data.opening_balance },
  });
  revalidatePath("/shifts");
  return { success: true };
}

export async function closeShift(raw: unknown): Promise<ShiftActionResult> {
  const { userId, profile } = await getSession();
  if (!userId || !profile) return { error: "Tidak terautentikasi" };

  const parsed = closeShiftSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("cash_sessions")
    .select("id, opening_balance")
    .eq("cashier_id", userId)
    .eq("status", "open")
    .maybeSingle();

  if (!session) return { error: "Tidak ada shift aktif" };

  // Hitung ulang total dari data pembayaran (otoritatif).
  const b = await getSessionBreakdown(supabase, session.id);
  const { expectedCash, variance } = computeReconciliation({
    openingBalance: session.opening_balance,
    totalCash: b.cash,
    countedCash: parsed.data.counted_cash,
  });

  const { error } = await supabase
    .from("cash_sessions")
    .update({
      status: "closed",
      closed_at: new Date().toISOString(),
      counted_cash: parsed.data.counted_cash,
      expected_cash: expectedCash,
      variance,
      total_cash: b.cash,
      total_qris: b.qris,
      total_transfer: b.transfer,
      total_gofood: b.gofood,
      total_shopeefood: b.shopeefood,
      note: parsed.data.note || null,
    })
    .eq("id", session.id);

  if (error) return { error: "Gagal menutup shift" };

  await logAudit({
    action: "shift.close",
    entity: "cash_session",
    entityId: session.id,
    metadata: { expected_cash: expectedCash, counted_cash: parsed.data.counted_cash, variance },
  });
  revalidatePath("/shifts");
  return { success: true };
}

/** Breakdown pembayaran satu shift (untuk detail/cetak). */
export async function getShiftBreakdown(
  sessionId: string,
): Promise<PaymentBreakdown | null> {
  const { userId } = await getSession();
  if (!userId) return null;
  const supabase = await createClient();
  return getSessionBreakdown(supabase, sessionId);
}
