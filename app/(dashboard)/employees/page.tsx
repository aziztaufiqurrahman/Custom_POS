import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

  const admin = createAdminClient();
  const { data: usersData } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  const emailById = new Map(
    usersData.users.map((u) => [u.id, u.email ?? ""]),
  );

  const employees: EmployeeRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? "",
    full_name: p.full_name,
    phone: p.phone,
    role: p.role,
    permissions: p.permissions ?? [],
    is_active: p.is_active,
  }));

  return <EmployeesClient employees={employees} currentUserId={userId} />;
}
