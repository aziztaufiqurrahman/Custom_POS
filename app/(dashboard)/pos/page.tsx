import { requireAuth } from "@/lib/auth";
import { isAdmin as isAdminFn } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { PosClient } from "./pos-client";

export type PosProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sell_price: number;
  is_taxable: boolean;
  stock: number;
  unit: string;
  image_url: string | null;
  category_id: string | null;
};

export type PosSettings = {
  store_name: string;
  tax_enabled: boolean;
  tax_percent: number;
  tax_inclusive: boolean;
  qris_image_url: string | null;
};

export type PosBank = {
  bank: "BNI" | "BCA" | "BSI";
  account_number: string;
  account_name: string;
};

export default async function PosPage() {
  const { userId, profile } = await requireAuth();
  const supabase = await createClient();

  const [
    { data: active },
    { data: products },
    { data: categories },
    { data: settings },
    { data: banks },
  ] = await Promise.all([
    supabase
      .from("cash_sessions")
      .select("id, opening_balance, opened_at")
      .eq("cashier_id", userId)
      .eq("status", "open")
      .maybeSingle(),
    supabase
      .from("products_public")
      .select(
        "id, name, sku, barcode, sell_price, is_taxable, stock, unit, image_url, category_id",
      )
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase.from("categories").select("id, name").order("name"),
    supabase
      .from("store_settings")
      .select(
        "store_name, tax_enabled, tax_percent, tax_inclusive, qris_image_url",
      )
      .limit(1)
      .maybeSingle(),
    supabase
      .from("bank_accounts")
      .select("bank, account_number, account_name")
      .eq("is_active", true)
      .order("bank"),
  ]);

  const posProducts: PosProduct[] = (products ?? []).map((p) => ({
    id: p.id!,
    name: p.name!,
    sku: p.sku!,
    barcode: p.barcode ?? null,
    sell_price: p.sell_price!,
    is_taxable: p.is_taxable!,
    stock: p.stock!,
    unit: p.unit!,
    image_url: p.image_url ?? null,
    category_id: p.category_id ?? null,
  }));

  const posSettings: PosSettings = {
    store_name: settings?.store_name ?? "Toko",
    tax_enabled: settings?.tax_enabled ?? false,
    tax_percent: settings?.tax_percent ?? 0,
    tax_inclusive: settings?.tax_inclusive ?? false,
    qris_image_url: settings?.qris_image_url ?? null,
  };

  return (
    <PosClient
      activeSessionId={active?.id ?? null}
      products={posProducts}
      categories={categories ?? []}
      settings={posSettings}
      banks={(banks ?? []) as PosBank[]}
      isAdmin={isAdminFn(profile)}
      cashierName={profile.full_name}
    />
  );
}
