import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Workspace (tenant) milik user saat ini, atau null bila belum ada.
 *
 * Lewat RPC `public.my_workspace_id()` — BUKAN query langsung ke
 * `platform.workspace_members`. Skema `platform` tidak terdaftar di PostgREST
 * "Exposed schemas", jadi tabelnya memang tidak bisa dijangkau dari klien;
 * migrasi 0038 menyediakan pembungkusnya di `public`.
 *
 * Ini sumber kebenaran untuk membedakan "belum onboarding" dari "sudah punya
 * tenant", karena fungsi yang sama (`platform.current_workspace_id()`) yang
 * menjadi dasar seluruh guard RLS sejak 0031.
 */
export const getMyWorkspaceId = cache(async (): Promise<string | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_workspace_id");

  // Saat RPC gagal (mis. migrasi 0038 belum terpasang), JANGAN paksa onboarding:
  // mengembalikan null akan menjebak user yang sebenarnya punya tenant di loop
  // redirect. Lebih aman menganggap "sudah punya" dan membiarkan RLS bekerja.
  if (error) return "tidak-diketahui";
  return (data as string | null) ?? null;
});

/** True bila user belum punya tenant dan harus melalui onboarding. */
export async function needsOnboarding(): Promise<boolean> {
  return (await getMyWorkspaceId()) === null;
}
