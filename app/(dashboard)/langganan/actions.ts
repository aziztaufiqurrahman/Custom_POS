"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export type OrderResult = {
  error?: string;
  order?: { code: string; total: number; tier: string; billing_period: string };
};

const planIdSchema = z.string().uuid("Paket tidak valid");

/**
 * Membuat pesanan untuk sebuah paket. Harga TIDAK pernah datang dari klien —
 * hanya `plan_id` yang dikirim, dan RPC mengambil harganya dari
 * `platform.plans`. Otorisasi (harus owner/admin workspace) juga ditegakkan
 * di dalam RPC, bukan di sini.
 */
export async function orderPlan(rawPlanId: unknown): Promise<OrderResult> {
  await requireAuth();

  const parsed = planIdSchema.safeParse(rawPlanId);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Paket tidak valid" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_plan", { p_plan_id: parsed.data });

  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { error: "Pesanan gagal dibuat" };

  await logAudit({
    action: "billing.order_create",
    entity: "order",
    entityId: row.order_id as string,
  });

  revalidatePath("/langganan");
  return {
    order: {
      code: row.code as string,
      total: Number(row.total),
      tier: row.tier as string,
      billing_period: row.billing_period as string,
    },
  };
}
