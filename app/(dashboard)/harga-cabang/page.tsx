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

export default async function HargaCabangPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  await requireAdmin();
  const ctx = await getBranchContext();
  const sp = await searchParams;
  const supabase = await createClient();

  // Cabang aktif ditentukan EKSPLISIT dari query (?branch=), divalidasi terhadap
  // cabang yang boleh diakses — menghindari silent-fallback yang membingungkan.
  const accessible = ctx.branches;
  const selectedBranchId =
    sp.branch && accessible.some((b) => b.id === sp.branch)
      ? sp.branch
      : (accessible[0]?.id ?? null);

  const { data } = selectedBranchId
    ? await supabase
        .from("branch_products_public")
        .select("product_id, name, sku, unit, price, min_stock, stock, is_active")
        .eq("branch_id", selectedBranchId)
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

  // Pengajuan harga yang masih menunggu (untuk menandai baris terkunci).
  const pendingPrice: Record<string, number> = {};
  if (selectedBranchId) {
    const { data: appr } = await supabase
      .from("approvals")
      .select("reference_id, payload")
      .eq("branch_id", selectedBranchId)
      .eq("request_type", "price_override")
      .eq("status", "pending");
    for (const a of appr ?? []) {
      const pid = a.reference_id as string | null;
      const pl = a.payload as { new_price?: number } | null;
      if (pid && pl?.new_price != null) pendingPrice[pid] = Number(pl.new_price);
    }
  }

  return (
    <HargaCabangClient
      isMaster={ctx.isMasterAdmin}
      branches={accessible.map((b) => ({ id: b.id, name: b.name }))}
      selectedBranchId={selectedBranchId}
      rows={rows}
      pendingPrice={pendingPrice}
    />
  );
}
