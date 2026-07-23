import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { SettingsClient } from "./settings-client";

export type StoreSettingsData = {
  store_name: string;
  address: string | null;
  phone: string | null;
  receipt_footer: string | null;
  logo_url: string | null;
  qris_image_url: string | null;
  tax_enabled: boolean;
  tax_percent: number;
  tax_inclusive: boolean;
  trx_prefix: string;
  theme_preset: string;
  theme_primary: string | null;
  theme_radius: string;
  theme_font: string;
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

  const [{ data: settings }, { data: banks }, { data: categories }] =
    await Promise.all([
      supabase.from("store_settings").select("*").limit(1).maybeSingle(),
      supabase
        .from("bank_accounts")
        .select("bank, account_number, account_name, is_active")
        .order("bank"),
      supabase.from("categories").select("id, name").order("name"),
    ]);

  const store: StoreSettingsData = {
    store_name: settings?.store_name ?? "",
    address: settings?.address ?? null,
    phone: settings?.phone ?? null,
    receipt_footer: settings?.receipt_footer ?? null,
    logo_url: settings?.logo_url ?? null,
    qris_image_url: settings?.qris_image_url ?? null,
    tax_enabled: settings?.tax_enabled ?? false,
    tax_percent: settings?.tax_percent ?? 11,
    tax_inclusive: settings?.tax_inclusive ?? false,
    trx_prefix: settings?.trx_prefix ?? "TRX",
    theme_preset: settings?.theme_preset ?? "classic",
    theme_primary: settings?.theme_primary ?? null,
    theme_radius: settings?.theme_radius ?? "md",
    theme_font: settings?.theme_font ?? "default",
  };

  return (
    <SettingsClient
      store={store}
      banks={(banks ?? []) as BankData[]}
      categories={(categories ?? []) as CategoryData[]}
    />
  );
}
