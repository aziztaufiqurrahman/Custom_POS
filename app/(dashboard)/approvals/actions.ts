"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth";
import { getBranchContext } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";

export type ApprovalResult = { error?: string; success?: boolean; pending?: boolean };

/** Apakah user boleh MENYETUJUI aksi di cabang tsb (master admin / manajer / approval.grant). */
export async function isApprover(branchId: string): Promise<boolean> {
  const ctx = await getBranchContext();
  if (ctx.isMasterAdmin) return true;
  return ctx.memberships.some(
    (m) =>
      m.branch_id === branchId &&
      (m.role === "manager" || m.permissions.includes("approval.grant")),
  );
}

/**
 * Buat permintaan persetujuan (dipakai bila peminta bukan approver).
 * request_type: 'void' | 'refund' | 'discount_override' | 'price_override' |
 * 'stock_adjustment' | 'no_sale'.
 */
export async function createApproval(input: {
  branch_id: string;
  request_type: "void" | "refund" | "discount_override" | "price_override" | "stock_adjustment" | "no_sale";
  reference_type?: string;
  reference_id?: string;
  reason?: string;
}): Promise<ApprovalResult> {
  const { userId } = await getSession();
  if (!userId) return { error: "Tidak terautentikasi" };

  const supabase = await createClient();
  const { error } = await supabase.from("approvals").insert({
    branch_id: input.branch_id,
    request_type: input.request_type,
    reference_type: input.reference_type ?? null,
    reference_id: input.reference_id ?? null,
    requested_by: userId,
    status: "pending",
    reason: input.reason ?? null,
  });
  if (error) return { error: "Gagal mengirim permintaan persetujuan" };

  revalidatePath("/approvals");
  return { success: true, pending: true };
}

/** Setujui / tolak permintaan. Peminta ≠ penyetuju (segregation of duties). */
export async function decideApproval(
  id: string,
  decision: "approved" | "rejected",
  note?: string,
): Promise<ApprovalResult> {
  const { userId } = await getSession();
  if (!userId) return { error: "Tidak terautentikasi" };

  const supabase = await createClient();
  const { data: appr } = await supabase
    .from("approvals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!appr) return { error: "Permintaan tidak ditemukan" };
  if (appr.status !== "pending") return { error: "Permintaan sudah diputuskan" };
  if (!(await isApprover(appr.branch_id))) {
    return { error: "Anda tidak berwenang menyetujui" };
  }
  if (appr.requested_by === userId) {
    return { error: "Tidak boleh menyetujui permintaan Anda sendiri" };
  }

  if (decision === "approved") {
    // Eksekusi aksi yang disetujui.
    if (appr.request_type === "void" && appr.reference_id) {
      const { error } = await supabase.rpc("void_sale", {
        p_transaction_id: appr.reference_id,
        p_reason: `Disetujui: ${appr.reason ?? "-"}`,
      });
      if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
    } else if (appr.request_type === "refund" && appr.reference_id) {
      const { error } = await supabase.rpc("refund_sale", {
        p_transaction_id: appr.reference_id,
        p_reason: `Disetujui: ${appr.reason ?? "-"}`,
      });
      if (error) return { error: error.message.replace(/^.*?:\s*/, "") };
    }
    // (discount/price/stock/no_sale = pencatatan persetujuan; aksi dieksekusi
    //  di titik masing-masing pada fase berikutnya.)
  }

  const { error: upErr } = await supabase
    .from("approvals")
    .update({
      status: decision,
      approved_by: userId,
      decided_at: new Date().toISOString(),
      reason: note ? `${appr.reason ?? ""} | ${note}`.trim() : appr.reason,
    })
    .eq("id", id);
  if (upErr) return { error: "Gagal menyimpan keputusan" };

  await logAudit({
    action: decision === "approved" ? "approval.approve" : "approval.reject",
    entity: "approval",
    entityId: id,
    branchId: appr.branch_id,
    metadata: { type: appr.request_type, reference_id: appr.reference_id },
  });

  revalidatePath("/approvals");
  revalidatePath("/sales");
  return { success: true };
}
