"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
  // Katalog global hanya dikelola admin pusat (master admin).
  if (!profile.is_master_admin) {
    return { error: "Hanya admin pusat yang dapat menambah produk" };
  }

  const parsed = createProductPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  // Harga jual & stok master = 0; harga/stok riil diatur per cabang.
  const { data: inserted, error } = await supabase
    .from("products")
    .insert({
      name: d.name,
      sku: d.sku,
      barcode: nullify(d.barcode),
      category_id: d.category_id || null,
      description: nullify(d.description),
      unit: d.unit,
      sell_price: 0,
      cost_price: d.cost_price, // HPP global (base_cost_price di bawah)
      base_cost_price: d.cost_price,
      stock: 0,
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

  // Trigger DB menyemai branch_products ke SEMUA cabang (harga & stok 0).
  // Sesuai pilihan cabang tujuan, hapus baris untuk cabang yang TIDAK dipilih
  // → produk hanya tersedia di cabang terpilih (mendukung produk khusus cabang).
  const { error: trimErr } = await supabase
    .from("branch_products")
    .delete()
    .eq("product_id", inserted.id)
    .not("branch_id", "in", `(${d.branch_ids.join(",")})`);
  if (trimErr) {
    // Non-fatal: produk tetap tersimpan; admin bisa merapikan lewat Harga & Stok.
    console.error("Gagal memangkas cabang produk baru:", trimErr.message);
  }

  await logAudit({
    action: "product.create",
    entity: "product",
    entityId: inserted.id,
    metadata: { sku: d.sku, name: d.name, branches: d.branch_ids.length },
  });

  revalidatePath("/products");
  return { success: true, id: inserted.id };
}

export async function updateProduct(
  raw: unknown,
): Promise<ProductActionResult> {
  const { profile } = await getSession();
  if (!profile) return { error: "Tidak terautentikasi" };
  if (!profile.is_master_admin) {
    return { error: "Hanya admin pusat yang dapat mengedit produk" };
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
    min_stock: d.min_stock,
    is_taxable: d.is_taxable,
    discount_type: d.discount_type,
    discount_value: d.discount_value,
    supplier: nullify(d.supplier),
    is_active: d.is_active,
    image_url: d.image_url,
    image_urls: d.image_urls,
    // HPP global (base_cost_price + cost_price legacy).
    cost_price: d.cost_price,
    base_cost_price: d.cost_price,
  };

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
  if (!profile.is_master_admin) {
    return { error: "Hanya admin pusat yang dapat menghapus produk" };
  }

  const supabase = await createClient();
  // Soft delete: trigger DB otomatis menonaktifkan produk di SEMUA cabang.
  const { error } = await supabase
    .from("products")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id);

  if (error) return { error: "Gagal menghapus produk" };

  await logAudit({ action: "product.delete", entity: "product", entityId: id });
  revalidatePath("/products");
  return { success: true };
}
