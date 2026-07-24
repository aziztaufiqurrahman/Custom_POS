import { requireAdmin } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { BANKS } from "@/lib/constants";

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
  bank: "BNI" | "BCA" | "BSI";
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

  const [{ data: settings }, { data: bs }, { data: banksRaw }, { data: categories }] =
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

  // Normalkan ke tiga bank (BNI/BCA/BSI) agar UI selalu lengkap untuk cabang.
  const bankMap = new Map(
    (banksRaw ?? []).map((b) => [b.bank, b as BankData]),
  );
  const banks: BankData[] = BANKS.map(
    (bank) =>
      bankMap.get(bank) ?? {
        bank,
        account_number: "",
        account_name: "",
        is_active: true,
      },
  );

  return (
    <SettingsClient
      store={store}
      branchPos={branchPos}
      banks={banks}
      categories={(categories ?? []) as CategoryData[]}
    />
  );
}
