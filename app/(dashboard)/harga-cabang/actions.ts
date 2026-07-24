"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  product_id: z.string().uuid(),
  price: z.number().min(0, "Harga tidak boleh negatif"),
  min_stock: z.number().min(0, "Tidak boleh negatif"),
  is_active: z.boolean(),
});

export async function updateBranchProduct(
  raw: unknown,
): Promise<{ error?: string; success?: boolean }> {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return { error: "Tidak berwenang" };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const d = parsed.data;

  const ctx = await getBranchContext();
  if (!ctx.activeBranchId) return { error: "Cabang aktif tidak ditemukan" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("branch_products")
    .update({ price: d.price, min_stock: d.min_stock, is_active: d.is_active })
    .eq("branch_id", ctx.activeBranchId)
    .eq("product_id", d.product_id);
  if (error) return { error: "Gagal menyimpan harga/stok cabang" };

  await logAudit({
    action: "branch_product.update",
    entity: "branch_product",
    entityId: d.product_id,
    branchId: ctx.activeBranchId,
    metadata: { price: d.price, min_stock: d.min_stock, is_active: d.is_active },
  });
  revalidatePath("/harga-cabang");
  revalidatePath("/pos");
  return { success: true };
}
