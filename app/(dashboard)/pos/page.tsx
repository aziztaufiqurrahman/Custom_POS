import { requireAuth } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
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
  const branchCtx = await getBranchContext();
  const activeBranchId = branchCtx.activeBranchId;

  const [
    { data: active },
    { data: products },
    { data: categories },
    { data: store },
    { data: branchSettings },
    { data: banks },
  ] = await Promise.all([
    supabase
      .from("cash_sessions")
      .select("id, opening_balance, opened_at")
      .eq("cashier_id", userId)
      .eq("status", "open")
      .maybeSingle(),
    // Katalog per cabang aktif (harga & stok dari branch_products).
    activeBranchId
      ? supabase
          .from("branch_products_public")
          .select(
            "product_id, name, sku, barcode, price, is_taxable, stock, unit, image_url, category_id",
          )
          .eq("branch_id", activeBranchId)
          .eq("is_active", true)
          .is("deleted_at", null)
          .order("name")
      : Promise.resolve({ data: [] }),
    supabase.from("categories").select("id, name").order("name"),
    // Identitas toko (brand) tetap global.
    supabase.from("store_settings").select("store_name").limit(1).maybeSingle(),
    // Pengaturan POS per cabang aktif (pajak & QRIS).
    activeBranchId
      ? supabase
          .from("branch_settings")
          .select("tax_enabled, tax_percent, tax_inclusive, qris_image_url")
          .eq("branch_id", activeBranchId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Rekening bank cabang aktif.
    activeBranchId
      ? supabase
          .from("bank_accounts")
          .select("bank, account_number, account_name")
          .eq("branch_id", activeBranchId)
          .eq("is_active", true)
          .order("bank")
      : Promise.resolve({ data: [] }),
  ]);

  const posProducts: PosProduct[] = (products ?? []).map((p) => ({
    id: p.product_id!,
    name: p.name!,
    sku: p.sku!,
    barcode: p.barcode ?? null,
    sell_price: p.price!,
    is_taxable: p.is_taxable!,
    stock: p.stock!,
    unit: p.unit!,
    image_url: p.image_url ?? null,
    category_id: p.category_id ?? null,
  }));

  const posSettings: PosSettings = {
    store_name: store?.store_name ?? "Toko",
    tax_enabled: branchSettings?.tax_enabled ?? false,
    tax_percent: branchSettings?.tax_percent ?? 0,
    tax_inclusive: branchSettings?.tax_inclusive ?? false,
    qris_image_url: branchSettings?.qris_image_url ?? null,
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
