"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleKey } from "@/lib/supabase/env";
import { logAudit } from "@/lib/audit";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "@/lib/validations/employee";

export type EmployeeActionResult = { error?: string; success?: boolean };

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function createEmployee(
  raw: unknown,
): Promise<EmployeeActionResult> {
  await requireAdmin();

  const parsed = createEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const data = parsed.data;

  if (getServiceRoleKey() === "") {
    return {
      error:
        "Server belum dikonfigurasi (SUPABASE_SERVICE_ROLE_KEY). Set di Vercel lalu redeploy.",
    };
  }

  const admin = createAdminClient();
  const origin = await getOrigin();
  // Kirim undangan email — karyawan membuat kata sandinya sendiri lewat tautan.
  const { data: created, error } = await admin.auth.admin.inviteUserByEmail(
    data.email,
    {
      data: { full_name: data.full_name },
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    },
  );

  if (error || !created.user) {
    const exists =
      error?.status === 422 || /already|registered|exist/i.test(error?.message ?? "");
    return {
      error: exists
        ? "Email sudah terdaftar"
        : "Gagal mengirim undangan. Pastikan SMTP email sudah dikonfigurasi.",
    };
  }

  const uid = created.user.id;
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: data.full_name,
      phone: data.phone || null,
      role: data.role,
      permissions: data.role === "admin" ? [] : data.permissions,
      is_active: true,
    })
    .eq("id", uid);

  if (profileError) {
    // Rollback akun auth bila update profil gagal.
    await admin.auth.admin.deleteUser(uid);
    return { error: "Gagal menyimpan profil karyawan" };
  }

  await logAudit({
    action: "employee.create",
    entity: "profile",
    entityId: uid,
    metadata: { email: data.email, role: data.role },
  });

  revalidatePath("/employees");
  return { success: true };
}

export async function updateEmployee(
  raw: unknown,
): Promise<EmployeeActionResult> {
  const { userId } = await requireAdmin();

  const parsed = updateEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const data = parsed.data;

  // Cegah admin menurunkan perannya sendiri (mencegah terkunci dari sistem).
  if (data.id === userId && data.role !== "admin") {
    return { error: "Tidak bisa mengubah peran akun Anda sendiri" };
  }

  // Pakai client biasa (admin ditegakkan via RLS) — tidak butuh service role.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: data.full_name,
      phone: data.phone || null,
      role: data.role,
      permissions: data.role === "admin" ? [] : data.permissions,
    })
    .eq("id", data.id);

  if (error) return { error: "Gagal memperbarui karyawan" };

  await logAudit({
    action: "employee.update",
    entity: "profile",
    entityId: data.id,
    metadata: { role: data.role, permissions: data.permissions },
  });

  revalidatePath("/employees");
  return { success: true };
}

export async function setEmployeeActive(
  id: string,
  isActive: boolean,
): Promise<EmployeeActionResult> {
  const { userId } = await requireAdmin();

  if (id === userId && !isActive) {
    return { error: "Tidak bisa menonaktifkan akun Anda sendiri" };
  }

  // Pakai client biasa (admin ditegakkan via RLS) — tidak butuh service role.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) return { error: "Gagal mengubah status karyawan" };

  await logAudit({
    action: isActive ? "employee.activate" : "employee.deactivate",
    entity: "profile",
    entityId: id,
  });

  revalidatePath("/employees");
  return { success: true };
}

export async function sendEmployeeReset(
  email: string,
): Promise<EmployeeActionResult> {
  await requireAdmin();
  const supabase = await createClient();
  const origin = await getOrigin();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  return { success: true };
}
