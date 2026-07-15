import { requireAuth } from "@/lib/auth";
import { can, isAdmin as isAdminFn } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { ProductsClient } from "./products-client";

export type ProductListItem = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
  category_id: string | null;
  image_url: string | null;
  image_urls: string[];
  sell_price: number;
  cost_price?: number | null; // hanya terisi untuk admin
  unit: string;
  stock: number;
  min_stock: number;
  is_taxable: boolean;
  discount_type: "none" | "amount" | "percent";
  discount_value: number;
  supplier: string | null;
  is_active: boolean;
};

export default async function ProductsPage() {
  const { profile } = await requireAuth();
  const admin = isAdminFn(profile);
  const supabase = await createClient();

  // Admin membaca tabel dasar (termasuk cost_price); kasir membaca view aman.
  const productsQuery = admin
    ? supabase
        .from("products")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : supabase
        .from("products_public")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

  const [{ data: products }, { data: categories }] = await Promise.all([
    productsQuery,
    supabase.from("categories").select("id, name").order("name"),
  ]);

  const items: ProductListItem[] = (products ?? []).map((p) => ({
    id: p.id!,
    sku: p.sku!,
    barcode: p.barcode ?? null,
    name: p.name!,
    description: p.description ?? null,
    category_id: p.category_id ?? null,
    image_url: p.image_url ?? null,
    image_urls: p.image_urls ?? [],
    sell_price: p.sell_price!,
    cost_price:
      admin && "cost_price" in p ? (p.cost_price as number | null) : undefined,
    unit: p.unit!,
    stock: p.stock!,
    min_stock: p.min_stock!,
    is_taxable: p.is_taxable!,
    discount_type: p.discount_type!,
    discount_value: p.discount_value!,
    supplier: p.supplier ?? null,
    is_active: p.is_active!,
  }));

  return (
    <ProductsClient
      products={items}
      categories={categories ?? []}
      isAdmin={admin}
      canCreate={can(profile, "product.create")}
      canEdit={can(profile, "product.edit")}
      canDelete={can(profile, "product.delete")}
    />
  );
}
