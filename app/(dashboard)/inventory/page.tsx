import { requireAdmin } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";

import { InventoryClient } from "./inventory-client";

export type InvProduct = {
  id: string;
  name: string;
  sku: string;
  stock: number;
  min_stock: number;
  unit: string;
};

export type InvMovement = {
  id: string;
  product_name: string;
  type: string;
  qty_change: number;
  stock_after: number;
  note: string | null;
  created_at: string;
};

export type InvOpname = {
  id: string;
  code: string;
  status: "draft" | "completed";
  created_at: string;
  completed_at: string | null;
};

export default async function InventoryPage() {
  const { profile } = await requireAdmin();
  const ctx = await getBranchContext();
  // Inventory DIKUNCI ke Cabang Utama (Pusat) untuk master admin; manajer memakai
  // cabangnya. Fitur lain (Gudang, POS, dst.) tetap mengikuti switcher cabang.
  const activeId = ctx.isMasterAdmin ? ctx.mainBranchId : ctx.activeBranchId;
  const invBranch = ctx.branches.find((b) => b.id === activeId) ?? ctx.activeBranch;
  const supabase = await createClient();

  const [{ data: products }, { data: movements }, { data: opnames }] =
    await Promise.all([
      // Stok & katalog PER CABANG aktif (sumber kebenaran branch_products).
      activeId
        ? supabase
            .from("branch_products_public")
            .select("product_id, name, sku, stock, min_stock, unit")
            .eq("branch_id", activeId)
            .eq("is_active", true)
            .is("deleted_at", null)
            .order("name")
        : Promise.resolve({ data: [] }),
      activeId
        ? supabase
            .from("stock_movements")
            .select("id, product_id, type, qty_change, stock_after, note, created_at")
            .eq("branch_id", activeId)
            .order("created_at", { ascending: false })
            .limit(200)
        : Promise.resolve({ data: [] }),
      activeId
        ? supabase
            .from("stock_opnames")
            .select("id, code, status, created_at, completed_at")
            .eq("branch_id", activeId)
            .order("created_at", { ascending: false })
            .limit(50)
        : Promise.resolve({ data: [] }),
    ]);

  const invProducts: InvProduct[] = (products ?? []).map((p) => ({
    id: p.product_id!,
    name: p.name!,
    sku: p.sku!,
    stock: p.stock!,
    min_stock: p.min_stock!,
    unit: p.unit!,
  }));

  const nameById = new Map(invProducts.map((p) => [p.id, p.name]));

  const invMovements: InvMovement[] = (movements ?? []).map((m) => ({
    id: m.id,
    product_name: nameById.get(m.product_id) ?? "(produk lain)",
    type: m.type,
    qty_change: m.qty_change,
    stock_after: m.stock_after,
    note: m.note,
    created_at: m.created_at,
  }));

  return (
    <InventoryClient
      branchName={invBranch?.name ?? "Cabang Utama"}
      products={invProducts}
      movements={invMovements}
      opnames={(opnames ?? []) as InvOpname[]}
      isMaster={ctx.isMasterAdmin}
      canOpname={can(profile, "stock.opname")}
    />
  );
}
