"use server";

import { revalidatePath } from "next/cache";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { onboardingSchema } from "@/lib/validations/onboarding";

export type OnboardingResult = { error?: string; workspaceId?: string };

/**
 * Membuat workspace pertama untuk user yang sedang login.
 *
 * Seluruh pembuatan (workspace, keanggotaan, langganan, cabang pusat,
 * pengaturan) terjadi di dalam SATU transaksi di dalam RPC — lihat 0037.
 * Tidak ada langkah yang dikerjakan di sini agar tidak mungkin ada tenant
 * setengah jadi bila salah satu langkah gagal.
 */
export async function createWorkspace(raw: unknown): Promise<OnboardingResult> {
  const { userId } = await requireAuth();

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("provision_my_workspace", {
    p_workspace_name: d.workspace_name,
    p_branch_name: d.branch_name || undefined,
    p_branch_code: d.branch_code.toUpperCase(),
  });

  if (error) {
    // Pesan dari RPC sudah ramah ("Anda sudah memiliki workspace", dst.);
    // buang prefiks teknis Postgres sebelum ditampilkan.
    return { error: error.message.replace(/^.*?:\s*/, "") };
  }

  await logAudit({
    action: "workspace.provision",
    entity: "workspace",
    entityId: (data as string) ?? userId,
  });

  // Konteks cabang & workspace dibaca di layout dashboard — wajib disegarkan,
  // kalau tidak user mendarat di dashboard dengan konteks kosong.
  revalidatePath("/", "layout");
  return { workspaceId: data as string };
}
