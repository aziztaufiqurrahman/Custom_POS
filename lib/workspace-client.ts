import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Workspace aktif untuk komponen klien (KEP-007).
 *
 * Dipakai untuk memberi prefiks `workspace_id` pada path Storage. Sejak migrasi
 * 0032, policy Storage menolak objek yang folder pertamanya bukan workspace
 * milik user — jadi tanpa prefiks ini, seluruh upload akan gagal.
 *
 * Diturunkan dari `branches`, yang sudah difilter RLS ke workspace user.
 * Tidak perlu diteruskan sebagai prop lewat rantai komponen.
 *
 * Hasilnya di-cache selama masa hidup tab: workspace seorang user tidak
 * berubah di tengah sesi.
 */
let cached: string | null = null;

export async function getWorkspaceId(
  supabase: SupabaseClient,
): Promise<string | null> {
  if (cached) return cached;

  const { data } = await supabase
    .from("branches")
    .select("workspace_id")
    .limit(1)
    .maybeSingle();

  cached = (data?.workspace_id as string | undefined) ?? null;
  return cached;
}

/** Dipanggil saat berpindah workspace (fase lanjut, bila sudah multi-workspace). */
export function resetWorkspaceCache(): void {
  cached = null;
}
