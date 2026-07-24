"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { isAdmin } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import {
  goodsReceiptSchema,
  supplierSchema,
  transferSchema,
  wastageSchema,
} from "@/lib/validations/warehouse";

export type WhResult = { error?: string; success?: boolean; code?: string; id?: string };

function rpcErr(msg: string): string {
  return msg.replace(/^.*?:\s*/, "");
}

async function activeBranch(): Promise<string | null> {
  const ctx = await getBranchContext();
  return ctx.activeBranchId;
}

export async function receiveGoods(raw: unknown): Promise<WhResult> {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return { error: "Tidak berwenang" };
  const parsed = goodsReceiptSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const branch = await activeBranch();
  if (!branch) return { error: "Cabang aktif tidak ditemukan" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_goods", {
    p_branch_id: branch,
    p_supplier_id: parsed.data.supplier_id || undefined,
    p_note: parsed.data.note || undefined,
    p_items: parsed.data.items as unknown as Json,
  });
  if (error) return { error: rpcErr(error.message) };
  revalidatePath("/gudang");
  revalidatePath("/inventory");
  revalidatePath("/products");
  const r = data as { id: string; code: string };
  return { success: true, id: r.id, code: r.code };
}

export async function recordWastage(raw: unknown): Promise<WhResult> {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return { error: "Tidak berwenang" };
  const parsed = wastageSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const branch = await activeBranch();
  if (!branch) return { error: "Cabang aktif tidak ditemukan" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("record_wastage", {
    p_branch_id: branch,
    p_reason: parsed.data.reason,
    p_photo_url: undefined,
    p_items: parsed.data.items as unknown as Json,
  });
  if (error) return { error: rpcErr(error.message) };
  revalidatePath("/gudang");
  revalidatePath("/inventory");
  revalidatePath("/products");
  const r = data as { id: string; code: string };
  return { success: true, id: r.id, code: r.code };
}

export async function createTransfer(raw: unknown): Promise<WhResult> {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return { error: "Tidak berwenang" };
  const parsed = transferSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  const branch = await activeBranch();
  if (!branch) return { error: "Cabang aktif tidak ditemukan" };
  if (branch === parsed.data.to_branch_id)
    return { error: "Cabang tujuan tidak boleh sama dengan cabang aktif" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_transfer", {
    p_from_branch: branch,
    p_to_branch: parsed.data.to_branch_id,
    p_note: parsed.data.note || undefined,
    p_items: parsed.data.items as unknown as Json,
  });
  if (error) return { error: rpcErr(error.message) };
  revalidatePath("/gudang");
  const r = data as { id: string; code: string };
  return { success: true, id: r.id, code: r.code };
}

export async function dispatchTransfer(id: string): Promise<WhResult> {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return { error: "Tidak berwenang" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("dispatch_transfer", { p_transfer_id: id });
  if (error) return { error: rpcErr(error.message) };
  revalidatePath("/gudang");
  revalidatePath("/inventory");
  revalidatePath("/products");
  return { success: true };
}

export async function receiveTransfer(id: string): Promise<WhResult> {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return { error: "Tidak berwenang" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("receive_transfer", { p_transfer_id: id });
  if (error) return { error: rpcErr(error.message) };
  revalidatePath("/gudang");
  revalidatePath("/inventory");
  revalidatePath("/products");
  return { success: true };
}

export async function createSupplier(raw: unknown): Promise<WhResult> {
  const { profile } = await getSession();
  if (!isAdmin(profile)) return { error: "Tidak berwenang" };
  const parsed = supplierSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({ name: parsed.data.name, phone: parsed.data.phone || null })
    .select("id")
    .single();
  if (error || !data) return { error: "Gagal menambah supplier" };
  revalidatePath("/gudang");
  return { success: true, id: data.id };
}
