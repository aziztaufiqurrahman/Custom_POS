"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import {
  createProductPayloadSchema,
  updateProductPayloadSchema,
} from "@/lib/validations/product";
import type { Database } from "@/types/database";

export type ProductActionResult = {
  error?: string;
  success?: boolean;
  id?: string;
};

type ProductUpdate = Database["public"]["Tables"]["products"]["Update"];

/** Ubah string kosong menjadi null untuk kolom opsional. */
function nullify(value: string): string | null {
  const t = value.trim();
  return t === "" ? null : t;
}

export async function createProduct(
  raw: unknown,
): Promise<ProductActionResult> {
  const { profile } = await getSession();
  if (!profile) return { error: "Tidak terautentikasi" };
  if (!can(profile, "product.create")) {
    return { error: "Tidak berwenang menambah produk" };
  }

  const parsed = createProductPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("products")
    .insert({
      name: d.name,
      sku: d.sku,
      barcode: nullify(d.barcode),
      category_id: d.category_id || null,
      description: nullify(d.description),
      unit: d.unit,
      sell_price: d.sell_price,
      // Kasir tidak boleh menetapkan harga modal.
      cost_price: profile.role === "admin" ? d.cost_price : null,
      stock: d.initial_stock,
      min_stock: d.min_stock,
      is_taxable: d.is_taxable,
      discount_type: d.discount_type,
      discount_value: d.discount_value,
      supplier: nullify(d.supplier),
      is_active: d.is_active,
      image_url: d.image_url,
      image_urls: d.image_urls,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    if (error?.code === "23505") {
      return { error: "SKU atau barcode sudah dipakai produk lain" };
    }
    return { error: "Gagal menyimpan produk" };
  }

  // Catat stok awal (stock_movements 'initial'). RLS stock_movements = admin;
  // gunakan admin client (aksi sudah diverifikasi izinnya di atas).
  if (d.initial_stock > 0) {
    const admin = createAdminClient();
    await admin.from("stock_movements").insert({
      product_id: inserted.id,
      type: "initial",
      qty_change: d.initial_stock,
      stock_after: d.initial_stock,
      note: "Stok awal",
      created_by: profile.id,
    });
  }

  await logAudit({
    action: "product.create",
    entity: "product",
    entityId: inserted.id,
    metadata: { sku: d.sku, name: d.name },
  });

  revalidatePath("/products");
  return { success: true, id: inserted.id };
}

export async function updateProduct(
  raw: unknown,
): Promise<ProductActionResult> {
  const { profile } = await getSession();
  if (!profile) return { error: "Tidak terautentikasi" };
  if (!can(profile, "product.edit")) {
    return { error: "Tidak berwenang mengedit produk" };
  }

  const parsed = updateProductPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const d = parsed.data;

  const update: ProductUpdate = {
    name: d.name,
    sku: d.sku,
    barcode: nullify(d.barcode),
    category_id: d.category_id || null,
    description: nullify(d.description),
    unit: d.unit,
    sell_price: d.sell_price,
    min_stock: d.min_stock,
    is_taxable: d.is_taxable,
    discount_type: d.discount_type,
    discount_value: d.discount_value,
    supplier: nullify(d.supplier),
    is_active: d.is_active,
    image_url: d.image_url,
    image_urls: d.image_urls,
  };
  // Hanya admin yang boleh mengubah harga modal (kasir: biarkan nilai lama).
  if (profile.role === "admin") {
    update.cost_price = d.cost_price;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update(update)
    .eq("id", d.id);

  if (error) {
    if (error.code === "23505") {
      return { error: "SKU atau barcode sudah dipakai produk lain" };
    }
    return { error: "Gagal memperbarui produk" };
  }

  await logAudit({
    action: "product.update",
    entity: "product",
    entityId: d.id,
    metadata: { sku: d.sku, name: d.name },
  });

  revalidatePath("/products");
  return { success: true, id: d.id };
}

/** Soft delete: set deleted_at + nonaktifkan. Histori transaksi tetap utuh. */
export async function deleteProduct(id: string): Promise<ProductActionResult> {
  const { profile } = await getSession();
  if (!profile) return { error: "Tidak terautentikasi" };
  if (!can(profile, "product.delete")) {
    return { error: "Tidak berwenang menghapus produk" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id);

  if (error) return { error: "Gagal menghapus produk" };

  await logAudit({ action: "product.delete", entity: "product", entityId: id });
  revalidatePath("/products");
  return { success: true };
}
