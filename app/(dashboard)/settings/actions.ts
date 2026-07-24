"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import {
  bankAccountSchema,
  branchPosSchema,
  categorySchema,
  storeProfileSchema,
  themeSchema,
} from "@/lib/validations/settings";

export type SettingsResult = { error?: string; success?: boolean; id?: string };

async function requireAdminSession() {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return null;
  return profile;
}

async function settingsRowId(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string | null> {
  const { data } = await supabase
    .from("store_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** Cabang aktif untuk pengaturan per-cabang. */
async function activeBranchId(): Promise<string | null> {
  const ctx = await getBranchContext();
  return ctx.activeBranchId;
}

export async function updateStoreProfile(raw: unknown): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const parsed = storeProfileSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const supabase = await createClient();
  const id = await settingsRowId(supabase);
  if (!id) return { error: "Pengaturan tidak ditemukan" };

  const { error } = await supabase
    .from("store_settings")
    .update({
      store_name: parsed.data.store_name,
      address: parsed.data.address || null,
      phone: parsed.data.phone || null,
      receipt_footer: parsed.data.receipt_footer || null,
    })
    .eq("id", id);
  if (error) return { error: "Gagal menyimpan profil toko" };

  await logAudit({ action: "settings.profile_update", entity: "store_settings", entityId: id });
  revalidatePath("/settings");
  return { success: true };
}

export async function updateBranchPos(raw: unknown): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const parsed = branchPosSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const branchId = await activeBranchId();
  if (!branchId) return { error: "Cabang aktif tidak ditemukan" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("branch_settings")
    .update({
      tax_enabled: parsed.data.tax_enabled,
      tax_percent: parsed.data.tax_percent,
      tax_inclusive: parsed.data.tax_inclusive,
      trx_prefix: parsed.data.trx_prefix.toUpperCase(),
    })
    .eq("branch_id", branchId);
  if (error) return { error: "Gagal menyimpan pengaturan POS cabang" };

  await logAudit({ action: "settings.branch_pos_update", entity: "branch_settings", entityId: branchId });
  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}

export async function updateThemeSettings(raw: unknown): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const parsed = themeSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const supabase = await createClient();
  const id = await settingsRowId(supabase);
  if (!id) return { error: "Pengaturan tidak ditemukan" };

  const { error } = await supabase
    .from("store_settings")
    .update({
      theme_preset: parsed.data.theme_preset,
      theme_primary: parsed.data.theme_primary || null,
      theme_radius: parsed.data.theme_radius,
      theme_font: parsed.data.theme_font,
    })
    .eq("id", id);
  if (error) return { error: "Gagal menyimpan tampilan" };

  await logAudit({ action: "settings.theme_update", entity: "store_settings", entityId: id });
  // Tema ada di layout dashboard → segarkan seluruh area aplikasi.
  revalidatePath("/", "layout");
  return { success: true };
}

export async function setStoreImage(
  kind: "logo" | "qris",
  url: string,
): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const supabase = await createClient();

  if (kind === "logo") {
    // Logo = identitas brand global (store_settings).
    const id = await settingsRowId(supabase);
    if (!id) return { error: "Pengaturan tidak ditemukan" };
    const { error } = await supabase
      .from("store_settings")
      .update({ logo_url: url })
      .eq("id", id);
    if (error) return { error: "Gagal menyimpan gambar" };
  } else {
    // QRIS = per cabang aktif (branch_settings).
    const branchId = await activeBranchId();
    if (!branchId) return { error: "Cabang aktif tidak ditemukan" };
    const { error } = await supabase
      .from("branch_settings")
      .update({ qris_image_url: url })
      .eq("branch_id", branchId);
    if (error) return { error: "Gagal menyimpan gambar" };
  }

  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}

export async function saveBankAccount(raw: unknown): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const parsed = bankAccountSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const d = parsed.data;

  const branchId = await activeBranchId();
  if (!branchId) return { error: "Cabang aktif tidak ditemukan" };

  const supabase = await createClient();
  // Upsert per (cabang, bank): cabang baru mungkin belum punya baris rekening.
  const { error } = await supabase
    .from("bank_accounts")
    .upsert(
      {
        branch_id: branchId,
        bank: d.bank,
        account_number: d.account_number,
        account_name: d.account_name,
        is_active: d.is_active,
      },
      { onConflict: "branch_id,bank" },
    );
  if (error) return { error: "Gagal menyimpan rekening" };

  await logAudit({ action: "settings.bank_update", entity: "bank_accounts", metadata: { bank: d.bank } });
  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}

export async function createCategory(raw: unknown): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({ name: parsed.data.name });
  if (error) return { error: "Gagal menambah kategori" };

  revalidatePath("/settings");
  revalidatePath("/products");
  return { success: true };
}

export async function renameCategory(id: string, raw: unknown): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name: parsed.data.name })
    .eq("id", id);
  if (error) return { error: "Gagal mengubah kategori" };

  revalidatePath("/settings");
  revalidatePath("/products");
  return { success: true };
}

export async function deleteCategory(id: string): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { error: "Gagal menghapus kategori" };

  revalidatePath("/settings");
  revalidatePath("/products");
  return { success: true };
}
