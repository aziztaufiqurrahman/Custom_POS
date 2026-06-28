"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
} from "@/lib/validations/employee";

export type EmployeeActionResult = { error?: string; success?: boolean };

export async function createEmployee(
  raw: unknown,
): Promise<EmployeeActionResult> {
  await requireAdmin();

  const parsed = createEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const data = parsed.data;

  const admin = createAdminClient();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: data.email,
    password: data.password,
    email_confirm: true,
    user_metadata: { full_name: data.full_name },
  });

  if (error || !created.user) {
    const exists =
      error?.status === 422 || /already/i.test(error?.message ?? "");
    return {
      error: exists ? "Email sudah terdaftar" : "Gagal membuat akun karyawan",
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

  const admin = createAdminClient();
  const { error } = await admin
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

  const admin = createAdminClient();
  const { error } = await admin
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
  await supabase.auth.resetPasswordForEmail(email);
  return { success: true };
}
