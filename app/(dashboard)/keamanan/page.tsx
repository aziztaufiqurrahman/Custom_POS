import { requireAdmin } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";

import { KeamananClient } from "./keamanan-client";

export type SeqGap = {
  branch_id: string;
  branch_name: string;
  max_seq: number;
  trx_count: number;
  missing: number;
};

export type ClosureRow = {
  branch_name: string;
  business_date: string;
  totals: Record<string, unknown>;
  closed_at: string;
};

export default async function KeamananPage() {
  await requireAdmin();
  const supabase = await createClient();
  const ctx = await getBranchContext();

  // Deteksi celah nomor urut — hanya master admin.
  let gaps: SeqGap[] = [];
  if (ctx.isMasterAdmin) {
    const { data } = await supabase.rpc("branch_seq_gaps");
    gaps = (data ?? []) as SeqGap[];
  }

  // Riwayat Z-report (RLS branch-scoped).
  const { data: closures } = await supabase
    .from("daily_closures")
    .select("branch_id, business_date, totals, closed_at")
    .order("business_date", { ascending: false })
    .limit(30);

  const branchIds = [...new Set((closures ?? []).map((c) => c.branch_id))];
  const { data: branches } = branchIds.length
    ? await supabase.from("branches").select("id, name").in("id", branchIds)
    : { data: [] };
  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));

  const closureRows: ClosureRow[] = (closures ?? []).map((c) => ({
    branch_name: branchName.get(c.branch_id) ?? "-",
    business_date: c.business_date,
    totals: (c.totals ?? {}) as Record<string, unknown>,
    closed_at: c.closed_at,
  }));

  return (
    <KeamananClient
      isMasterAdmin={ctx.isMasterAdmin}
      activeBranchName={ctx.activeBranch?.name ?? "Cabang aktif"}
      gaps={gaps}
      closures={closureRows}
    />
  );
}
