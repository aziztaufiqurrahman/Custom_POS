import { requireAdmin } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";

import { SettingsClient } from "./settings-client";

/** Identitas brand + tampilan (global, store_settings). */
export type StoreSettingsData = {
  store_name: string;
  address: string | null;
  phone: string | null;
  receipt_footer: string | null;
  logo_url: string | null;
  theme_preset: string;
  theme_primary: string | null;
  theme_radius: string;
  theme_font: string;
};

/** Pengaturan POS untuk cabang aktif (branch_settings). */
export type BranchPosData = {
  branch_id: string | null;
  branch_name: string | null;
  tax_enabled: boolean;
  tax_percent: number;
  tax_inclusive: boolean;
  trx_prefix: string;
  qris_image_url: string | null;
};

export type BankData = {
  bank: string;
  account_number: string;
  account_name: string;
  is_active: boolean;
};

export type CategoryData = { id: string; name: string };

export default async function SettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const branchCtx = await getBranchContext();
  const activeBranchId = branchCtx.activeBranchId;

  const [{ data: settings }, { data: bs }, { data: banksRaw }, { data: categories }, { data: org }] =
    await Promise.all([
      supabase.from("store_settings").select("*").limit(1).maybeSingle(),
      activeBranchId
        ? supabase
            .from("branch_settings")
            .select("*")
            .eq("branch_id", activeBranchId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      activeBranchId
        ? supabase
            .from("bank_accounts")
            .select("bank, account_number, account_name, is_active")
            .eq("branch_id", activeBranchId)
        : Promise.resolve({ data: [] }),
      supabase.from("categories").select("id, name").order("name"),
      supabase.from("org_settings").select("alert_whatsapp").limit(1).maybeSingle(),
    ]);

  const store: StoreSettingsData = {
    store_name: settings?.store_name ?? "",
    address: settings?.address ?? null,
    phone: settings?.phone ?? null,
    receipt_footer: settings?.receipt_footer ?? null,
    logo_url: settings?.logo_url ?? null,
    theme_preset: settings?.theme_preset ?? "classic",
    theme_primary: settings?.theme_primary ?? null,
    theme_radius: settings?.theme_radius ?? "md",
    theme_font: settings?.theme_font ?? "default",
  };

  const branchPos: BranchPosData = {
    branch_id: activeBranchId,
    branch_name: branchCtx.activeBranch?.name ?? null,
    tax_enabled: bs?.tax_enabled ?? false,
    tax_percent: bs?.tax_percent ?? 11,
    tax_inclusive: bs?.tax_inclusive ?? false,
    trx_prefix: bs?.trx_prefix ?? "TRX",
    qris_image_url: bs?.qris_image_url ?? null,
  };

  // Bank dinamis: tampilkan rekening yang sudah ditambahkan admin untuk cabang
  // ini (bisa ditambah/dihapus). Tidak lagi dipatok ke 3 bank tetap.
  const banks: BankData[] = (banksRaw ?? [])
    .map((b) => ({
      bank: b.bank,
      account_number: b.account_number ?? "",
      account_name: b.account_name ?? "",
      is_active: b.is_active ?? true,
    }))
    .sort((a, b) => a.bank.localeCompare(b.bank));

  return (
    <SettingsClient
      store={store}
      branchPos={branchPos}
      banks={banks}
      categories={(categories ?? []) as CategoryData[]}
      isMasterAdmin={branchCtx.isMasterAdmin}
      alertWhatsapp={org?.alert_whatsapp ?? ""}
    />
  );
}
