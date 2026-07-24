import { requireMasterAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { BranchesClient } from "./branches-client";

export type BranchRow = {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  timezone: string;
  is_active: boolean;
  member_count: number;
};

export default async function BranchesPage() {
  await requireMasterAdmin();
  const supabase = await createClient();

  const { data: branches } = await supabase
    .from("branches")
    .select("id, code, name, address, phone, timezone, is_active")
    .order("name");

  const { data: memberships } = await supabase
    .from("branch_memberships")
    .select("branch_id")
    .eq("is_active", true);

  const counts = new Map<string, number>();
  for (const m of memberships ?? []) {
    counts.set(m.branch_id, (counts.get(m.branch_id) ?? 0) + 1);
  }

  const rows: BranchRow[] = (branches ?? []).map((b) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    address: b.address,
    phone: b.phone,
    timezone: b.timezone,
    is_active: b.is_active,
    member_count: counts.get(b.id) ?? 0,
  }));

  return <BranchesClient branches={rows} />;
}
