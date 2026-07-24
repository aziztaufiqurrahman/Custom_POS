import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { ApprovalsClient } from "./approvals-client";

export type ApprovalRow = {
  id: string;
  branch_id: string;
  branch_name: string;
  request_type: string;
  reference_id: string | null;
  reference_code: string | null;
  requested_by_name: string;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
};

export default async function ApprovalsPage() {
  await requireAdmin();
  const supabase = await createClient();

  // RLS membatasi ke cabang milik user (master admin: semua).
  const { data: rows } = await supabase
    .from("approvals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const list = rows ?? [];
  const branchIds = [...new Set(list.map((a) => a.branch_id))];
  const userIds = [...new Set(list.map((a) => a.requested_by).filter(Boolean))] as string[];
  const trxIds = [...new Set(list.map((a) => a.reference_id).filter(Boolean))] as string[];

  const [{ data: branches }, { data: profiles }, { data: trx }] = await Promise.all([
    branchIds.length
      ? supabase.from("branches").select("id, name").in("id", branchIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
    trxIds.length
      ? supabase.from("transactions").select("id, code").in("id", trxIds)
      : Promise.resolve({ data: [] }),
  ]);

  const branchName = new Map((branches ?? []).map((b) => [b.id, b.name]));
  const userName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  const trxCode = new Map((trx ?? []).map((t) => [t.id, t.code]));

  const approvals: ApprovalRow[] = list.map((a) => ({
    id: a.id,
    branch_id: a.branch_id,
    branch_name: branchName.get(a.branch_id) ?? "-",
    request_type: a.request_type,
    reference_id: a.reference_id,
    reference_code: a.reference_id ? (trxCode.get(a.reference_id) ?? null) : null,
    requested_by_name: a.requested_by ? (userName.get(a.requested_by) ?? "-") : "-",
    reason: a.reason,
    status: a.status,
    created_at: a.created_at,
    decided_at: a.decided_at,
  }));

  return <ApprovalsClient approvals={approvals} />;
}
