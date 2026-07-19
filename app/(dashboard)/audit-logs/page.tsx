import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { AuditLogsClient } from "./audit-logs-client";

export type AuditRow = {
  id: string;
  actor_name: string;
  action: string;
  entity: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  await requireAdmin();
  const supabase = await createClient();

  const from = sp.from ?? "";
  const to = sp.to ?? "";
  const action = sp.action ?? "";

  let query = supabase
    .from("audit_logs")
    .select("id, action, entity, created_at, metadata, actor:profiles(full_name)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (from) query = query.gte("created_at", `${from}T00:00:00+07:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59+07:00`);
  if (action) query = query.ilike("action", `%${action.replace(/[,()]/g, "")}%`);

  const { data } = await query;

  const rows: AuditRow[] = (data ?? []).map((r) => {
    const actor = r.actor as { full_name: string } | { full_name: string }[] | null;
    const name = Array.isArray(actor)
      ? (actor[0]?.full_name ?? "-")
      : (actor?.full_name ?? "(sistem)");
    return {
      id: r.id,
      actor_name: name,
      action: r.action,
      entity: r.entity,
      created_at: r.created_at,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    };
  });

  return <AuditLogsClient rows={rows} filters={{ from, to, action }} />;
}
