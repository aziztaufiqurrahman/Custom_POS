import { requireAdmin } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";

import { ReportsClient } from "./reports-client";

export type ReportTrx = {
  code: string;
  created_at: string;
  branch_name: string;
  cashier_name: string;
  grand_total: number;
  status: "completed" | "void" | "refunded";
};
export type LedgerRow = {
  created_at: string;
  product_name: string;
  type: string;
  qty_change: number;
  stock_after: number;
  note: string | null;
};
export type TopProduct = { name: string; qty: number; revenue: number };
export type TrendPoint = { date: string; revenue: number; count: number };
export type VarianceRow = { cashier_name: string; variance: number; closed_at: string | null };

export type ReportData = {
  isMasterAdmin: boolean;
  branches: { id: string; name: string }[];
  filters: { from: string; to: string; branch: string };
  summary: {
    revenue: number;
    txCount: number;
    avg: number;
    itemsSold: number;
    shipping: number;
    grossProfit: number | null; // null utk non-master (HPP rahasia)
    byMethod: Record<string, number>;
    voidCount: number;
    refundCount: number;
    totalVariance: number;
  };
  trend: TrendPoint[];
  topProducts: TopProduct[];
  transactions: ReportTrx[];
  ledger: LedgerRow[];
  variances: VarianceRow[];
};

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();
  const ctx = await getBranchContext();

  const today = jakartaToday();
  const from = sp.from || today.slice(0, 8) + "01";
  const to = sp.to || today;
  const branchSel = sp.branch || "all";

  const accessibleIds = ctx.branches.map((b) => b.id);
  const branchIds =
    branchSel !== "all" && accessibleIds.includes(branchSel) ? [branchSel] : accessibleIds;
  const branchName = new Map(ctx.branches.map((b) => [b.id, b.name]));

  const fromTs = `${from}T00:00:00+07:00`;
  const toTs = `${to}T23:59:59+07:00`;

  // Transaksi dalam rentang (semua status) untuk cabang terpilih.
  const { data: trxRows } = await supabase
    .from("transactions")
    .select(
      "id, code, created_at, branch_id, grand_total, status, cashier:profiles!transactions_cashier_id_fkey(full_name)",
    )
    .gte("created_at", fromTs)
    .lte("created_at", toTs)
    .in("branch_id", branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"])
    .order("created_at", { ascending: false })
    .limit(2000);

  const trx = trxRows ?? [];
  const completed = trx.filter((t) => t.status === "completed");
  const completedIds = completed.map((t) => t.id);

  const cashierName = (c: unknown): string => {
    const v = c as { full_name: string } | { full_name: string }[] | null;
    return Array.isArray(v) ? (v[0]?.full_name ?? "-") : (v?.full_name ?? "-");
  };

  // Pembayaran & item untuk transaksi selesai (batasi bila banyak).
  const [{ data: pays }, { data: items }, { data: movements }, { data: sessions }] =
    await Promise.all([
      completedIds.length
        ? supabase.from("payments").select("transaction_id, method, amount").in("transaction_id", completedIds)
        : Promise.resolve({ data: [] }),
      completedIds.length
        ? supabase
            .from("transaction_items")
            .select("transaction_id, product_id, product_name_snapshot, qty, line_total")
            .in("transaction_id", completedIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("stock_movements")
        .select("created_at, product_id, type, qty_change, stock_after, note")
        .gte("created_at", fromTs)
        .lte("created_at", toTs)
        .in("branch_id", branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"])
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("cash_sessions")
        .select("variance, closed_at, cashier:profiles(full_name)")
        .eq("status", "closed")
        .neq("variance", 0)
        .gte("closed_at", fromTs)
        .lte("closed_at", toTs)
        .in("branch_id", branchIds.length ? branchIds : ["00000000-0000-0000-0000-000000000000"])
        .limit(50),
    ]);

  // Ringkasan.
  const revenue = completed.reduce((s, t) => s + Number(t.grand_total), 0);
  const byMethod: Record<string, number> = {};
  for (const p of pays ?? []) {
    byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
  }

  // Tren harian.
  const trendMap = new Map<string, { revenue: number; count: number }>();
  for (const t of completed) {
    const d = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(t.created_at));
    const cur = trendMap.get(d) ?? { revenue: 0, count: 0 };
    cur.revenue += Number(t.grand_total);
    cur.count += 1;
    trendMap.set(d, cur);
  }
  const trend: TrendPoint[] = [...trendMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => ({ date, revenue: v.revenue, count: v.count }));

  // Produk terlaris + item terjual.
  const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
  let itemsSold = 0;
  for (const it of items ?? []) {
    itemsSold += Number(it.qty);
    const key = it.product_id ?? it.product_name_snapshot;
    const cur = prodMap.get(key) ?? { name: it.product_name_snapshot, qty: 0, revenue: 0 };
    cur.qty += Number(it.qty);
    cur.revenue += Number(it.line_total);
    prodMap.set(key, cur);
  }
  const topProducts = [...prodMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 10);

  // Laba kotor (hanya master admin — butuh HPP).
  let grossProfit: number | null = null;
  if (ctx.isMasterAdmin && (items ?? []).length > 0) {
    const pids = [...new Set((items ?? []).map((i) => i.product_id).filter(Boolean))] as string[];
    const { data: costs } = pids.length
      ? await supabase.from("products").select("id, base_cost_price").in("id", pids)
      : { data: [] };
    const costMap = new Map((costs ?? []).map((c) => [c.id, Number(c.base_cost_price ?? 0)]));
    let cogs = 0;
    for (const it of items ?? []) {
      cogs += Number(it.qty) * (costMap.get(it.product_id ?? "") ?? 0);
    }
    grossProfit = revenue - cogs;
  }

  const nameById = new Map((items ?? []).map((i) => [i.product_id, i.product_name_snapshot]));
  const movementName = (pid: string | null) => (pid ? (nameById.get(pid) ?? "(produk)") : "(produk)");

  const data: ReportData = {
    isMasterAdmin: ctx.isMasterAdmin,
    branches: ctx.branches.map((b) => ({ id: b.id, name: b.name })),
    filters: { from, to, branch: branchSel },
    summary: {
      revenue,
      txCount: completed.length,
      avg: completed.length ? Math.round(revenue / completed.length) : 0,
      itemsSold,
      shipping: 0,
      grossProfit,
      byMethod,
      voidCount: trx.filter((t) => t.status === "void").length,
      refundCount: trx.filter((t) => t.status === "refunded").length,
      totalVariance: (sessions ?? []).reduce((s, v) => s + Number(v.variance ?? 0), 0),
    },
    trend,
    topProducts,
    transactions: trx.slice(0, 500).map((t) => ({
      code: t.code,
      created_at: t.created_at,
      branch_name: branchName.get(t.branch_id) ?? "-",
      cashier_name: cashierName(t.cashier),
      grand_total: Number(t.grand_total),
      status: t.status,
    })),
    ledger: (movements ?? []).map((m) => ({
      created_at: m.created_at,
      product_name: movementName(m.product_id),
      type: m.type,
      qty_change: Number(m.qty_change),
      stock_after: Number(m.stock_after),
      note: m.note,
    })),
    variances: (sessions ?? []).map((v) => ({
      cashier_name: cashierName(v.cashier),
      variance: Number(v.variance ?? 0),
      closed_at: v.closed_at,
    })),
  };

  return <ReportsClient data={data} />;
}
