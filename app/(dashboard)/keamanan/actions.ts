"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";

export type CloseDailyResult = { error?: string; totals?: Record<string, unknown> };

/** Tutup laporan harian (Z-report) untuk cabang aktif, tanggal hari ini (Asia/Jakarta). */
export async function closeDailyToday(): Promise<CloseDailyResult> {
  const { userId } = await getSession();
  if (!userId) return { error: "Tidak terautentikasi" };

  const ctx = await getBranchContext();
  if (!ctx.activeBranchId) return { error: "Cabang aktif tidak ditemukan" };

  const businessDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_daily", {
    p_branch_id: ctx.activeBranchId,
    p_business_date: businessDate,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath("/keamanan");
  return { totals: (data ?? {}) as Record<string, unknown> };
}
