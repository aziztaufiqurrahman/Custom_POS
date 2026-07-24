"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { branchSchema, updateBranchSchema } from "@/lib/validations/branch";

export type BranchActionResult = { error?: string; success?: boolean; id?: string };

async function requireMaster(): Promise<boolean> {
  const { profile } = await getSession();
  return profile?.is_master_admin === true;
}

export async function createBranch(raw: unknown): Promise<BranchActionResult> {
  if (!(await requireMaster())) return { error: "Hanya Master Admin" };
  const parsed = branchSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const d = parsed.data;

  const supabase = await createClient();
  const { data: branch, error } = await supabase
    .from("branches")
    .insert({
      code: d.code.toUpperCase(),
      name: d.name,
      address: d.address || null,
      phone: d.phone || null,
      timezone: d.timezone || "Asia/Jakarta",
    })
    .select("id")
    .single();
  if (error || !branch) {
    if (error?.code === "23505") return { error: "Kode cabang sudah dipakai" };
    return { error: "Gagal membuat cabang" };
  }

  // Pengaturan cabang default.
  await supabase.from("branch_settings").insert({ branch_id: branch.id });

  // Seed katalog cabang (harga = harga master, stok 0). Master admin atur nanti.
  const { data: products } = await supabase
    .from("products")
    .select("id, sell_price, min_stock")
    .is("deleted_at", null);
  if (products && products.length > 0) {
    await supabase.from("branch_products").insert(
      products.map((p) => ({
        branch_id: branch.id,
        product_id: p.id,
        price: p.sell_price,
        min_stock: p.min_stock,
        stock: 0,
        is_active: true,
      })),
    );
  }

  await logAudit({ action: "branch.create", entity: "branch", entityId: branch.id, metadata: { code: d.code } });
  revalidatePath("/branches");
  return { success: true, id: branch.id };
}

export async function updateBranch(raw: unknown): Promise<BranchActionResult> {
  if (!(await requireMaster())) return { error: "Hanya Master Admin" };
  const parsed = updateBranchSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({
      code: d.code.toUpperCase(),
      name: d.name,
      address: d.address || null,
      phone: d.phone || null,
      timezone: d.timezone || "Asia/Jakarta",
    })
    .eq("id", d.id);
  if (error) {
    if (error.code === "23505") return { error: "Kode cabang sudah dipakai" };
    return { error: "Gagal memperbarui cabang" };
  }

  await logAudit({ action: "branch.update", entity: "branch", entityId: d.id });
  revalidatePath("/branches");
  return { success: true };
}

export async function setBranchActive(
  id: string,
  isActive: boolean,
): Promise<BranchActionResult> {
  if (!(await requireMaster())) return { error: "Hanya Master Admin" };
  const supabase = await createClient();
  const { error } = await supabase.from("branches").update({ is_active: isActive }).eq("id", id);
  if (error) return { error: "Gagal mengubah status cabang" };

  await logAudit({ action: isActive ? "branch.activate" : "branch.deactivate", entity: "branch", entityId: id });
  revalidatePath("/branches");
  return { success: true };
}
