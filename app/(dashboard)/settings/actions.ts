"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import {
  bankAccountSchema,
  categorySchema,
  storeProfileSchema,
  taxSchema,
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
      trx_prefix: parsed.data.trx_prefix.toUpperCase(),
    })
    .eq("id", id);
  if (error) return { error: "Gagal menyimpan profil toko" };

  await logAudit({ action: "settings.profile_update", entity: "store_settings", entityId: id });
  revalidatePath("/settings");
  return { success: true };
}

export async function updateTaxSettings(raw: unknown): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const parsed = taxSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const supabase = await createClient();
  const id = await settingsRowId(supabase);
  if (!id) return { error: "Pengaturan tidak ditemukan" };

  const { error } = await supabase
    .from("store_settings")
    .update({
      tax_enabled: parsed.data.tax_enabled,
      tax_percent: parsed.data.tax_percent,
      tax_inclusive: parsed.data.tax_inclusive,
    })
    .eq("id", id);
  if (error) return { error: "Gagal menyimpan pengaturan pajak" };

  await logAudit({ action: "settings.tax_update", entity: "store_settings", entityId: id });
  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}

export async function setStoreImage(
  kind: "logo" | "qris",
  url: string,
): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const supabase = await createClient();
  const id = await settingsRowId(supabase);
  if (!id) return { error: "Pengaturan tidak ditemukan" };

  const patch =
    kind === "logo" ? { logo_url: url } : { qris_image_url: url };
  const { error } = await supabase
    .from("store_settings")
    .update(patch)
    .eq("id", id);
  if (error) return { error: "Gagal menyimpan gambar" };

  revalidatePath("/settings");
  revalidatePath("/pos");
  return { success: true };
}

export async function saveBankAccount(raw: unknown): Promise<SettingsResult> {
  if (!(await requireAdminSession())) return { error: "Hanya admin" };
  const parsed = bankAccountSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("bank_accounts")
    .update({
      account_number: d.account_number,
      account_name: d.account_name,
      is_active: d.is_active,
    })
    .eq("bank", d.bank);
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
