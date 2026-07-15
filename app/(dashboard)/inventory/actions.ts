"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { can, isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import {
  adjustStockSchema,
  completeOpnameSchema,
  restockSchema,
  saveOpnameDraftSchema,
} from "@/lib/validations/inventory";

export type InvResult = { error?: string; success?: boolean; id?: string };

function rpcError(msg: string): string {
  return msg.replace(/^.*?:\s*/, "");
}

export async function restockProduct(raw: unknown): Promise<InvResult> {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return { error: "Hanya admin yang boleh menambah stok" };

  const parsed = restockSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("restock_product", {
    p_product_id: d.product_id,
    p_qty: d.qty,
    p_new_cost: d.new_cost ?? undefined,
    p_note: d.note || undefined,
  });
  if (error) return { error: rpcError(error.message) };

  revalidatePath("/inventory");
  revalidatePath("/products");
  return { success: true };
}

export async function adjustStock(raw: unknown): Promise<InvResult> {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return { error: "Hanya admin yang boleh menyesuaikan stok" };

  const parsed = adjustStockSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("adjust_stock", {
    p_product_id: d.product_id,
    p_new_qty: d.new_qty,
    p_note: d.note || undefined,
  });
  if (error) return { error: rpcError(error.message) };

  revalidatePath("/inventory");
  revalidatePath("/products");
  return { success: true };
}

export async function createOpname(): Promise<InvResult> {
  const { userId, profile } = await getSession();
  if (!userId || !profile) return { error: "Tidak terautentikasi" };
  if (!can(profile, "stock.opname")) {
    return { error: "Tidak berwenang melakukan stock opname" };
  }

  const supabase = await createClient();
  const datestr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replace(/-/g, "");

  const { count } = await supabase
    .from("stock_opnames")
    .select("id", { count: "exact", head: true })
    .like("code", `OPN-${datestr}-%`);

  const code = `OPN-${datestr}-${String((count ?? 0) + 1).padStart(4, "0")}`;

  const { data, error } = await supabase
    .from("stock_opnames")
    .insert({ code, status: "draft", created_by: userId })
    .select("id")
    .single();
  if (error || !data) return { error: "Gagal membuat sesi opname" };

  return { success: true, id: data.id };
}

export async function saveOpnameDraft(raw: unknown): Promise<InvResult> {
  const { profile } = await getSession();
  if (!profile || !can(profile, "stock.opname")) {
    return { error: "Tidak berwenang" };
  }
  const parsed = saveOpnameDraftSchema.safeParse(raw);
  if (!parsed.success) return { error: "Input tidak valid" };
  const d = parsed.data;

  const supabase = await createClient();
  await supabase.from("stock_opname_items").delete().eq("opname_id", d.opname_id);
  const { error } = await supabase.from("stock_opname_items").insert(
    d.items.map((it) => ({
      opname_id: d.opname_id,
      product_id: it.product_id,
      system_qty: it.system_qty,
      physical_qty: it.physical_qty,
      difference: it.difference,
      reason: it.reason || null,
    })),
  );
  if (error) return { error: "Gagal menyimpan draft" };

  revalidatePath(`/inventory/opname/${d.opname_id}`);
  return { success: true };
}

export async function completeOpname(raw: unknown): Promise<InvResult> {
  const { profile } = await getSession();
  if (!profile || !can(profile, "stock.opname")) {
    return { error: "Tidak berwenang" };
  }
  const parsed = completeOpnameSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const d = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_opname", {
    p_opname_id: d.opname_id,
    p_items: d.items as unknown as Json,
  });
  if (error) return { error: rpcError(error.message) };

  revalidatePath("/inventory");
  revalidatePath("/products");
  return { success: true };
}
