import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getServiceRoleKey } from "@/lib/supabase/env";
import { normalizeWaNumber, waMeUrl } from "@/lib/wa";

/**
 * Kirim peringatan anti-fraud ke penerima berwenang (master admin + manajer
 * cabang terkait) sebagai notifikasi in-app. Bila nomor WhatsApp peringatan
 * diatur di org_settings, notifikasi diberi tautan wa.me sehingga penerima
 * tinggal mengetuk untuk meneruskannya ke WhatsApp.
 *
 * Memakai service role (mengirim notifikasi ke user LAIN melewati RLS insert
 * yang membatasi user_id = auth.uid()). Bila service role belum diset, dilewati
 * dengan aman (fitur inti tetap jalan).
 */
export async function notifyRisky(opts: {
  branchId: string;
  title: string;
  body: string;
}): Promise<void> {
  if (getServiceRoleKey() === "") return;
  try {
    const admin = createAdminClient();

    const [{ data: masters }, { data: managers }] = await Promise.all([
      admin.from("profiles").select("id").eq("is_master_admin", true).eq("is_active", true),
      admin
        .from("branch_memberships")
        .select("user_id")
        .eq("branch_id", opts.branchId)
        .eq("role", "manager")
        .eq("is_active", true),
    ]);

    const ids = new Set<string>();
    for (const m of masters ?? []) ids.add(m.id);
    for (const m of managers ?? []) ids.add(m.user_id);
    if (ids.size === 0) return;

    const { data: org } = await admin
      .from("org_settings")
      .select("alert_whatsapp")
      .limit(1)
      .maybeSingle();
    const num = org?.alert_whatsapp ? normalizeWaNumber(org.alert_whatsapp) : null;
    const link = num ? waMeUrl(num, `[PERINGATAN] ${opts.title}\n${opts.body}`) : null;

    await admin.from("notifications").insert(
      [...ids].map((uid) => ({
        user_id: uid,
        type: "alert",
        title: opts.title,
        body: opts.body,
        link,
      })),
    );
  } catch {
    // Jangan pernah menggagalkan aksi utama karena peringatan gagal.
  }
}
