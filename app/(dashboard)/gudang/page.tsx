import { requireAdmin } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";

import { GudangClient } from "./gudang-client";

export type WhProduct = { id: string; name: string; unit: string; stock: number };
export type SupplierOpt = { id: string; name: string };
export type BranchOpt = { id: string; name: string };
export type ReceiptRow = { code: string; status: string; received_at: string | null };
export type WastageRow = { code: string; status: string; reason: string | null; created_at: string };
export type TransferRow = {
  id: string;
  code: string;
  status: "draft" | "dispatched" | "received" | "cancelled";
  from_branch_id: string;
  to_branch_id: string;
  from_name: string;
  to_name: string;
  created_at: string;
};

export default async function GudangPage() {
  await requireAdmin();
  const supabase = await createClient();
  const ctx = await getBranchContext();
  const activeId = ctx.activeBranchId;

  const [{ data: products }, { data: suppliers }, { data: receipts }, { data: wastages }, { data: transfers }] =
    await Promise.all([
      activeId
        ? supabase
            .from("branch_products_public")
            .select("product_id, name, unit, stock")
            .eq("branch_id", activeId)
            .eq("is_active", true)
            .is("deleted_at", null)
            .order("name")
        : Promise.resolve({ data: [] }),
      supabase.from("suppliers").select("id, name").eq("is_active", true).order("name"),
      activeId
        ? supabase
            .from("goods_receipts")
            .select("code, status, received_at")
            .eq("branch_id", activeId)
            .order("created_at", { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] }),
      activeId
        ? supabase
            .from("wastages")
            .select("code, status, reason, created_at")
            .eq("branch_id", activeId)
            .order("created_at", { ascending: false })
            .limit(15)
        : Promise.resolve({ data: [] }),
      supabase
        .from("stock_transfers")
        .select("id, code, status, from_branch_id, to_branch_id, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const branchName = new Map(ctx.branches.map((b) => [b.id, b.name]));
  const whProducts: WhProduct[] = (products ?? []).map((p) => ({
    id: p.product_id!,
    name: p.name!,
    unit: p.unit!,
    stock: p.stock!,
  }));

  const transferRows: TransferRow[] = (transfers ?? []).map((t) => ({
    id: t.id,
    code: t.code,
    status: t.status,
    from_branch_id: t.from_branch_id,
    to_branch_id: t.to_branch_id,
    from_name: branchName.get(t.from_branch_id) ?? "-",
    to_name: branchName.get(t.to_branch_id) ?? "-",
    created_at: t.created_at,
  }));

  const otherBranches: BranchOpt[] = ctx.branches
    .filter((b) => b.id !== activeId)
    .map((b) => ({ id: b.id, name: b.name }));

  return (
    <GudangClient
      activeBranchId={activeId}
      activeBranchName={ctx.activeBranch?.name ?? "Cabang aktif"}
      products={whProducts}
      suppliers={(suppliers ?? []) as SupplierOpt[]}
      otherBranches={otherBranches}
      receipts={(receipts ?? []) as ReceiptRow[]}
      wastages={(wastages ?? []) as WastageRow[]}
      transfers={transferRows}
    />
  );
}
