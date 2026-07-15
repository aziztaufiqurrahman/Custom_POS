import { requireAuth } from "@/lib/auth";
import { can, isAdmin as isAdminFn } from "@/lib/permissions";
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
  const { profile } = await requireAuth();
  const admin = isAdminFn(profile);
  const supabase = await createClient();

  const [{ data: products }, { data: movements }, { data: opnames }] =
    await Promise.all([
      supabase
        .from("products_public")
        .select("id, name, sku, stock, min_stock, unit")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("stock_movements")
        .select("id, product_id, type, qty_change, stock_after, note, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("stock_opnames")
        .select("id, code, status, created_at, completed_at")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  const invProducts: InvProduct[] = (products ?? []).map((p) => ({
    id: p.id!,
    name: p.name!,
    sku: p.sku!,
    stock: p.stock!,
    min_stock: p.min_stock!,
    unit: p.unit!,
  }));

  const nameById = new Map(invProducts.map((p) => [p.id, p.name]));

  const invMovements: InvMovement[] = (movements ?? []).map((m) => ({
    id: m.id,
    product_name: nameById.get(m.product_id) ?? "(produk dihapus)",
    type: m.type,
    qty_change: m.qty_change,
    stock_after: m.stock_after,
    note: m.note,
    created_at: m.created_at,
  }));

  return (
    <InventoryClient
      products={invProducts}
      movements={invMovements}
      opnames={(opnames ?? []) as InvOpname[]}
      isAdmin={admin}
      canOpname={can(profile, "stock.opname")}
    />
  );
}
