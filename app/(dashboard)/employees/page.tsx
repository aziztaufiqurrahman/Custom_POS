import { requireMasterAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleKey } from "@/lib/supabase/env";

import { EmployeesClient } from "./employees-client";

export type BranchOption = { id: string; name: string };

export type EmployeeRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: "admin" | "kasir";
  permissions: string[];
  is_active: boolean;
  is_master_admin: boolean;
  branch_id: string | null;
  branch_name: string | null;
};

export default async function EmployeesPage() {
  const { userId } = await requireMasterAdmin();

  const supabase = await createClient();
  const [{ data: profiles }, { data: branches }, { data: memberships }] =
    await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: true }),
      supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
      supabase
        .from("branch_memberships")
        .select("user_id, branch_id, branches(name)")
        .eq("is_active", true),
    ]);

  // Cabang pertama (aktif) tiap user untuk ditampilkan.
  const branchByUser = new Map<string, { id: string; name: string }>();
  for (const m of memberships ?? []) {
    if (branchByUser.has(m.user_id)) continue;
    const bn = m.branches as { name: string } | { name: string }[] | null;
    const name = Array.isArray(bn) ? (bn[0]?.name ?? "") : (bn?.name ?? "");
    branchByUser.set(m.user_id, { id: m.branch_id, name });
  }

  // Email diambil via Auth Admin API (butuh service role). Bila belum dikonfigurasi
  // di server, halaman tetap tampil tanpa email (tidak crash).
  const serviceRoleReady = getServiceRoleKey() !== "";
  const emailById = new Map<string, string>();
  if (serviceRoleReady) {
    try {
      const admin = createAdminClient();
      const { data: usersData } = await admin.auth.admin.listUsers({
        perPage: 1000,
      });
      for (const u of usersData.users) emailById.set(u.id, u.email ?? "");
    } catch {
      // abaikan — tampilkan tanpa email
    }
  }

  const employees: EmployeeRow[] = (profiles ?? []).map((p) => {
    const b = branchByUser.get(p.id) ?? null;
    return {
      id: p.id,
      email: emailById.get(p.id) ?? "",
      full_name: p.full_name,
      phone: p.phone,
      role: p.role,
      permissions: p.permissions ?? [],
      is_active: p.is_active,
      is_master_admin: p.is_master_admin === true,
      branch_id: b?.id ?? null,
      branch_name: b?.name ?? null,
    };
  });

  return (
    <EmployeesClient
      employees={employees}
      branches={(branches ?? []) as BranchOption[]}
      currentUserId={userId}
      serviceRoleMissing={!serviceRoleReady}
    />
  );
}
