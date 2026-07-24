import { requireAdmin } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";

import { HargaCabangClient } from "./harga-cabang-client";

export type BranchProductRow = {
  product_id: string;
  name: string;
  sku: string;
  unit: string;
  price: number;
  min_stock: number;
  stock: number;
  is_active: boolean;
};

export default async function HargaCabangPage() {
  await requireAdmin();
  const supabase = await createClient();
  const ctx = await getBranchContext();
  const activeId = ctx.activeBranchId;

  const { data } = activeId
    ? await supabase
        .from("branch_products_public")
        .select("product_id, name, sku, unit, price, min_stock, stock, is_active")
        .eq("branch_id", activeId)
        .is("deleted_at", null)
        .order("name")
    : { data: [] };

  const rows: BranchProductRow[] = (data ?? []).map((r) => ({
    product_id: r.product_id!,
    name: r.name!,
    sku: r.sku!,
    unit: r.unit!,
    price: r.price!,
    min_stock: r.min_stock!,
    stock: r.stock!,
    is_active: r.is_active!,
  }));

  return (
    <HargaCabangClient
      branchName={ctx.activeBranch?.name ?? "Cabang aktif"}
      rows={rows}
    />
  );
}
