import { requireAuth } from "@/lib/auth";
import { can, isAdmin as isAdminFn } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { SalesClient } from "./sales-client";

export type SaleRow = {
  id: string;
  code: string;
  created_at: string;
  cashier_name: string;
  cash_session_id: string | null;
  customer_name: string | null;
  item_count: number;
  grand_total: number;
  status: "completed" | "void" | "refunded";
  methods: ("cash" | "qris" | "transfer")[];
  bank: "BNI" | "BCA" | "BSI" | null;
};

export type SalesFilters = {
  from: string;
  to: string;
  method: string;
  cashier: string;
  status: string;
  shift: string;
  q: string;
};

function sanitize(s: string): string {
  return s.replace(/[,()]/g, " ").trim();
}

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const { profile } = await requireAuth();
  const admin = isAdminFn(profile);
  const supabase = await createClient();

  const filters: SalesFilters = {
    from: sp.from ?? "",
    to: sp.to ?? "",
    method: sp.method ?? "all",
    cashier: sp.cashier ?? "all",
    status: sp.status ?? "all",
    shift: sp.shift ?? "all",
    q: sp.q ?? "",
  };

  let query = supabase
    .from("transactions")
    .select(
      "id, code, created_at, grand_total, status, customer_name, cashier_id, cash_session_id, cashier:profiles!transactions_cashier_id_fkey(full_name), payments(method, bank, amount), transaction_items(count)",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.from) query = query.gte("created_at", `${filters.from}T00:00:00+07:00`);
  if (filters.to) query = query.lte("created_at", `${filters.to}T23:59:59+07:00`);
  if (filters.status !== "all")
    query = query.eq("status", filters.status as "completed" | "void" | "refunded");
  if (admin && filters.cashier !== "all") query = query.eq("cashier_id", filters.cashier);
  if (filters.shift !== "all") query = query.eq("cash_session_id", filters.shift);
  if (filters.q) {
    const s = sanitize(filters.q);
    if (s) query = query.or(`code.ilike.%${s}%,customer_name.ilike.%${s}%`);
  }

  const { data } = await query;

  let rows: SaleRow[] = (data ?? []).map((t) => {
    const cashier = t.cashier as { full_name: string } | { full_name: string }[] | null;
    const cashierName = Array.isArray(cashier)
      ? (cashier[0]?.full_name ?? "-")
      : (cashier?.full_name ?? "-");
    const pays = (t.payments ?? []) as {
      method: "cash" | "qris" | "transfer";
      bank: "BNI" | "BCA" | "BSI" | null;
      amount: number;
    }[];
    const items = (t.transaction_items ?? []) as { count: number }[];
    return {
      id: t.id,
      code: t.code,
      created_at: t.created_at,
      cashier_name: cashierName,
      cash_session_id: t.cash_session_id,
      customer_name: t.customer_name,
      item_count: items[0]?.count ?? 0,
      grand_total: t.grand_total,
      status: t.status,
      methods: [...new Set(pays.map((p) => p.method))],
      bank: pays.find((p) => p.bank)?.bank ?? null,
    };
  });

  // Filter metode (client-side dilakukan di server agar konsisten dengan ringkasan)
  if (filters.method !== "all") {
    rows = rows.filter((r) => r.methods.includes(filters.method as "cash"));
  }

  // Daftar kasir & shift untuk dropdown filter.
  const [{ data: cashiers }, { data: sessions }] = await Promise.all([
    admin
      ? supabase.from("profiles").select("id, full_name").order("full_name")
      : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    supabase
      .from("cash_sessions")
      .select("id, opened_at, cashier:profiles(full_name)")
      .order("opened_at", { ascending: false })
      .limit(50),
  ]);

  const shiftOptions = (sessions ?? []).map((s) => {
    const c = s.cashier as { full_name: string } | { full_name: string }[] | null;
    const name = Array.isArray(c) ? (c[0]?.full_name ?? "") : (c?.full_name ?? "");
    return { id: s.id, opened_at: s.opened_at, cashier_name: name };
  });

  return (
    <SalesClient
      rows={rows}
      filters={filters}
      isAdmin={admin}
      canVoid={can(profile, "transaction.void")}
      canRefund={can(profile, "transaction.refund")}
      cashiers={cashiers ?? []}
      shifts={shiftOptions}
    />
  );
}
