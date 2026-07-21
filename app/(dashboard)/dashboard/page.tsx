import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { DashboardClient } from "./dashboard-client";

export type DashKpis = {
  today: { revenue: number; count: number };
  week: { revenue: number; count: number };
  month: { revenue: number; count: number };
  avg_month: number;
  gross_profit_month: number;
};

export type DashAnalytics = {
  revenue: number;
  tx_count: number;
  items_sold: number;
  gross_profit: number;
  shipping_total: number;
  by_method: Record<string, number>;
  by_bank: Record<string, number>;
  trend: { bucket: string; revenue: number; tx_count: number }[];
  top_products: { name: string; qty: number; revenue: number }[];
  by_category: { category: string; qty: number; revenue: number }[];
  by_cashier: { cashier: string; revenue: number; tx_count: number }[];
};

export type LowStockItem = {
  name: string;
  stock: number;
  min_stock: number;
  unit: string;
};

export type VarianceItem = {
  cashier_name: string;
  variance: number;
  closed_at: string | null;
};

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();

  const today = jakartaToday();
  const monthStart = today.slice(0, 8) + "01";
  const from = sp.from || monthStart;
  const to = sp.to || today;
  const bucket = sp.bucket === "week" || sp.bucket === "month" ? sp.bucket : "day";

  const [{ data: kpisData }, { data: analyticsData }, { data: products }, { data: variances }] =
    await Promise.all([
      supabase.rpc("dashboard_kpis"),
      supabase.rpc("dashboard_analytics", {
        p_from: `${from}T00:00:00+07:00`,
        p_to: `${to}T23:59:59+07:00`,
        p_bucket: bucket,
      }),
      supabase
        .from("products_public")
        .select("name, stock, min_stock, unit")
        .is("deleted_at", null)
        .eq("is_active", true),
      supabase
        .from("cash_sessions")
        .select("variance, closed_at, cashier:profiles(full_name)")
        .eq("status", "closed")
        .neq("variance", 0)
        .order("closed_at", { ascending: false })
        .limit(5),
    ]);

  const lowStock: LowStockItem[] = (products ?? [])
    .filter((p) => (p.stock ?? 0) <= (p.min_stock ?? 0))
    .slice(0, 10)
    .map((p) => ({
      name: p.name!,
      stock: p.stock!,
      min_stock: p.min_stock!,
      unit: p.unit!,
    }));

  const varianceItems: VarianceItem[] = (variances ?? []).map((v) => {
    const c = v.cashier as { full_name: string } | { full_name: string }[] | null;
    const name = Array.isArray(c) ? (c[0]?.full_name ?? "-") : (c?.full_name ?? "-");
    return { cashier_name: name, variance: v.variance ?? 0, closed_at: v.closed_at };
  });

  return (
    <DashboardClient
      kpis={kpisData as unknown as DashKpis}
      analytics={analyticsData as unknown as DashAnalytics}
      lowStock={lowStock}
      variances={varianceItems}
      range={{ from, to, bucket }}
    />
  );
}
