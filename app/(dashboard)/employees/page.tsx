import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleKey } from "@/lib/supabase/env";

import { EmployeesClient } from "./employees-client";

export type EmployeeRow = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: "admin" | "kasir";
  permissions: string[];
  is_active: boolean;
};

export default async function EmployeesPage() {
  const { userId } = await requireAdmin();

  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });

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

  const employees: EmployeeRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? "",
    full_name: p.full_name,
    phone: p.phone,
    role: p.role,
    permissions: p.permissions ?? [],
    is_active: p.is_active,
  }));

  return (
    <EmployeesClient
      employees={employees}
      currentUserId={userId}
      serviceRoleMissing={!serviceRoleReady}
    />
  );
}
