"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export type KonfirmasiResult = { error?: string; success?: boolean };

const schema = z.object({
  order_id: z.string().uuid(),
  // Nomor referensi transfer, dicatat agar rekonsiliasi bank bisa ditelusuri.
  gateway_ref: z.string().trim().max(120).optional().or(z.literal("")),
});

/**
 * Konfirmasi pembayaran transfer manual.
 *
 * Otorisasi TIDAK dicek di sini — `platform.confirm_order_payment()` menolak
 * pemanggil non-staf, dan itu satu-satunya tempat aturan tersebut hidup.
 * Mengulangnya di sini hanya menciptakan dua sumber kebenaran yang bisa
 * berbeda diam-diam.
 */
export async function konfirmasiPembayaran(raw: unknown): Promise<KonfirmasiResult> {
  await requireAuth();

  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: "Input tidak valid" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_confirm_payment", {
    p_order_id: parsed.data.order_id,
    p_gateway_ref: parsed.data.gateway_ref || undefined,
  });

  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  await logAudit({
    action: "billing.payment_confirm",
    entity: "payment",
    entityId: (data as string) ?? parsed.data.order_id,
  });

  revalidatePath("/platform/pesanan");
  return { success: true };
}
