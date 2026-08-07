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

    // KEP-003 — service-role MENEMBUS RLS, jadi seluruh kueri di bawah wajib
    // dibatasi workspace secara eksplisit. Tanpa ini, peringatan anti-fraud
    // UMKM A terkirim ke pemilik UMKM B beserta isinya.
    const { data: branch } = await admin
      .from("branches")
      .select("workspace_id")
      .eq("id", opts.branchId)
      .maybeSingle();
    const workspaceId = branch?.workspace_id;
    if (!workspaceId) return;

    // Master admin DI WORKSPACE INI saja (bukan seluruh platform).
    const { data: wsMembers } = await admin
      .schema("platform")
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", workspaceId)
      .eq("is_active", true);
    const wsUserIds = (wsMembers ?? []).map((m) => m.user_id);

    const [{ data: masters }, { data: managers }] = await Promise.all([
      wsUserIds.length > 0
        ? admin
            .from("profiles")
            .select("id")
            .eq("is_master_admin", true)
            .eq("is_active", true)
            .in("id", wsUserIds)
        : Promise.resolve({ data: [] as { id: string }[] }),
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

    // Nomor WhatsApp penerima peringatan milik workspace INI (KEP-003).
    const { data: org } = await admin
      .from("org_settings")
      .select("alert_whatsapp")
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    const num = org?.alert_whatsapp ? normalizeWaNumber(org.alert_whatsapp) : null;
    const link = num ? waMeUrl(num, `[PERINGATAN] ${opts.title}\n${opts.body}`) : null;

    await admin.from("notifications").insert(
      [...ids].map((uid) => ({
        user_id: uid,
        // `notifications` tidak punya branch_id, jadi workspace_id TIDAK bisa
        // diturunkan trigger — wajib dikirim (KEP-003). Di sini diambil dari
        // cabang pemicu alert, bukan dari konteks user (dipanggil service-role).
        workspace_id: workspaceId,
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
