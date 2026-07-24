"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { formatRupiah } from "@/lib/format";
import { createSaleSchema } from "@/lib/validations/sale";
import type { Json } from "@/types/database";

export type SaleReceipt = {
  transaction_id: string;
  code: string;
  grand_total: number;
  change_given: number;
};

export type CreateSaleResult = { error?: string; receipt?: SaleReceipt };

export async function createSale(raw: unknown): Promise<CreateSaleResult> {
  const { userId, profile } = await getSession();
  if (!userId || !profile) return { error: "Tidak terautentikasi" };

  const parsed = createSaleSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_sale", {
    p_cash_session_id: d.cash_session_id,
    p_items: d.items as unknown as Json,
    p_payment: {
      method: d.payment.method,
      bank: d.payment.bank,
      cash_received: d.payment.cash_received,
      reference: d.payment.reference || null,
    } as unknown as Json,
    p_order_discount: d.order_discount,
    p_customer_name: d.customer_name || undefined,
    p_customer_phone: d.customer_phone || undefined,
    p_note: d.note || undefined,
    p_shipping_cost: d.shipping_cost,
  });

  if (error) {
    // Pesan dari RPC (mis. "Stok X tidak cukup", "Shift sudah ditutup") sudah ramah.
    return { error: error.message.replace(/^.*?:\s*/, "") };
  }

  const receipt = data as unknown as SaleReceipt;

  // Pengingat: ongkos kirim perlu dicatat sebagai pengeluaran shift.
  if (d.shipping_cost > 0) {
    await supabase.from("notifications").insert({
      user_id: userId,
      type: "ongkir",
      title: "Ongkos kirim perlu dicatat",
      body: `Tambahkan ongkos kirim ${formatRupiah(d.shipping_cost)} ke pengeluaran shift.`,
      link: "/shifts",
    });
  }

  revalidatePath("/shifts");
  revalidatePath("/sales");
  return { receipt };
}

/** Simpan URL gambar QRIS statis ke pengaturan cabang aktif (admin saja). */
export async function saveQrisImage(
  url: string,
): Promise<{ error?: string; success?: boolean }> {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return { error: "Hanya admin yang boleh mengubah QRIS" };

  const ctx = await getBranchContext();
  if (!ctx.activeBranchId) return { error: "Cabang aktif tidak ditemukan" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("branch_settings")
    .update({ qris_image_url: url })
    .eq("branch_id", ctx.activeBranchId);
  if (error) return { error: "Gagal menyimpan QRIS" };

  await logAudit({
    action: "settings.qris_update",
    entity: "branch_settings",
    entityId: ctx.activeBranchId,
  });
  revalidatePath("/pos");
  return { success: true };
}
