"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { uuidish } from "@/lib/validations/common";

export type BranchPriceResult = {
  error?: string;
  success?: boolean;
  pending?: boolean;
};

// ── PUSAT: set harga jual, stok minimum, & status aktif per cabang ───────────
// Stok TIDAK diubah di sini — keluar/masuk stok hanya lewat Gudang & Inventory.
const setSchema = z.object({
  branch_id: uuidish,
  product_id: z.string().uuid(),
  price: z.number().min(0, "Harga tidak boleh negatif"),
  min_stock: z.number().min(0, "Tidak boleh negatif"),
  is_active: z.boolean(),
});

export async function setBranchPrice(
  raw: unknown,
): Promise<BranchPriceResult> {
  const { profile } = await getSession();
  if (!profile) return { error: "Tidak terautentikasi" };
  if (!profile.is_master_admin) {
    return { error: "Hanya admin pusat yang dapat mengatur harga cabang" };
  }
  const parsed = setSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  // Update langsung (RLS: master admin) — hanya harga/min/aktif, stok utuh.
  const { error } = await supabase
    .from("branch_products")
    .update({ price: d.price, min_stock: d.min_stock, is_active: d.is_active })
    .eq("branch_id", d.branch_id)
    .eq("product_id", d.product_id);
  if (error) return { error: "Gagal menyimpan harga cabang" };

  await logAudit({
    action: "branch_product.set",
    entity: "branch_product",
    entityId: d.product_id,
    branchId: d.branch_id,
    metadata: { price: d.price, min_stock: d.min_stock, is_active: d.is_active },
  });

  revalidatePath("/harga-cabang");
  revalidatePath("/pos");
  return { success: true };
}

// ── MANAJER: ajukan perubahan harga (harga berjalan tetap terkunci) ──────────
const requestSchema = z.object({
  branch_id: uuidish,
  product_id: z.string().uuid(),
  new_price: z.number().min(0, "Harga tidak boleh negatif"),
  reason: z.string().max(200).optional().or(z.literal("")),
});

export async function requestPriceChange(
  raw: unknown,
): Promise<BranchPriceResult> {
  const { userId, profile } = await getSession();
  if (!userId || !profile) return { error: "Tidak terautentikasi" };

  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const d = parsed.data;

  // Hanya anggota cabang (atau master admin) yang boleh mengajukan.
  const ctx = await getBranchContext();
  const canAccess =
    ctx.isMasterAdmin || ctx.branches.some((b) => b.id === d.branch_id);
  if (!canAccess) return { error: "Anda tidak terhubung ke cabang ini" };

  const supabase = await createClient();

  // Ambil harga & nama produk berjalan di cabang tsb (untuk snapshot usulan).
  const { data: bp } = await supabase
    .from("branch_products_public")
    .select("price, name")
    .eq("branch_id", d.branch_id)
    .eq("product_id", d.product_id)
    .maybeSingle();
  if (!bp) return { error: "Produk tidak tersedia di cabang ini" };
  if (Number(bp.price) === d.new_price) {
    return { error: "Harga usulan sama dengan harga berjalan" };
  }

  // Tolak bila sudah ada pengajuan harga yang masih menunggu utk produk ini.
  const { data: existing } = await supabase
    .from("approvals")
    .select("id")
    .eq("branch_id", d.branch_id)
    .eq("request_type", "price_override")
    .eq("reference_id", d.product_id)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) {
    return { error: "Sudah ada pengajuan harga yang menunggu persetujuan" };
  }

  const { error } = await supabase.from("approvals").insert({
    branch_id: d.branch_id,
    request_type: "price_override",
    reference_type: "branch_product",
    reference_id: d.product_id,
    requested_by: userId,
    status: "pending",
    reason: d.reason || null,
    payload: {
      product_id: d.product_id,
      product_name: bp.name,
      old_price: Number(bp.price),
      new_price: d.new_price,
    },
  });
  if (error) return { error: "Gagal mengirim pengajuan harga" };

  await logAudit({
    action: "branch_product.price_request",
    entity: "branch_product",
    entityId: d.product_id,
    branchId: d.branch_id,
    metadata: { old_price: Number(bp.price), new_price: d.new_price },
  });

  revalidatePath("/harga-cabang");
  revalidatePath("/approvals");
  return { success: true, pending: true };
}
