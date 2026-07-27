import { requireMasterAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { ProductsClient } from "./products-client";

export type BranchOption = { id: string; name: string };

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
  // Katalog global: hanya admin pusat (master admin).
  await requireMasterAdmin();
  const supabase = await createClient();

  const [{ data: products }, { data: categories }, { data: branches }] =
    await Promise.all([
      supabase
        .from("products")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase.from("categories").select("id, name").order("name"),
      supabase
        .from("branches")
        .select("id, name")
        .eq("is_active", true)
        .order("name"),
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
    cost_price: (p.cost_price as number | null) ?? null,
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
      branches={(branches ?? []) as BranchOption[]}
    />
  );
}
