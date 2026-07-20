/**
 * Pembaca environment Supabase yang tahan terhadap kesalahan umum saat mengisi
 * Environment Variables (mis. di Vercel):
 *  - nilai ter-copy bersama tanda kutip (") atau spasi/enter di ujung
 *  - URL keliru menyertakan path "/rest/v1" atau trailing slash
 *
 * Referensi ke process.env.NEXT_PUBLIC_* dibuat statis agar ter-inline saat build.
 */

function cleanValue(value: string | undefined): string {
  return (value ?? "").trim().replace(/^['"]+|['"]+$/g, "").trim();
}

function cleanUrl(value: string | undefined): string {
  return cleanValue(value)
    .replace(/\/rest\/v1\/?$/i, "") // buang "/rest/v1" bila tak sengaja ikut
    .replace(/\/+$/, ""); // buang trailing slash
}

export const SUPABASE_URL = cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = cleanValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export function hasSupabaseEnv(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Service role (server-only). Dibersihkan dari kutip/spasi juga. */
export function getServiceRoleKey(): string {
  return cleanValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
