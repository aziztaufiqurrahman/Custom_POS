/**
 * Pembaca environment Supabase yang tahan terhadap kesalahan umum saat mengisi
 * Environment Variables (mis. di Vercel):
 *  - nilai ter-copy bersama tanda kutip (") atau spasi/enter di ujung
 *  - URL keliru menyertakan path "/rest/v1" atau trailing slash
 *  - env belum ter-inject ke build -> pakai fallback publik agar app tetap jalan
 *
 * URL & ANON KEY bersifat PUBLIK (memang dikirim ke browser oleh Supabase; data
 * tetap dilindungi RLS), sehingga aman dijadikan fallback. SERVICE ROLE tidak
 * pernah dijadikan fallback karena bersifat rahasia (hanya dari env server).
 */

// Fallback publik (staging). Env var TETAP diprioritaskan bila tersedia.
const FALLBACK_URL = "https://qeoeqspinyydcmoysbrb.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlb2Vxc3Bpbnl5ZGNtb3lzYnJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI2Mzg3MDUsImV4cCI6MjA5ODIxNDcwNX0.tD1y-WaAKiqojp8Dg0B8C0nqnMjKvF8bJBsrD3i7Ylo";

function cleanValue(value: string | undefined): string {
  return (value ?? "").trim().replace(/^['"]+|['"]+$/g, "").trim();
}

function cleanUrl(value: string | undefined): string {
  return cleanValue(value)
    .replace(/\/rest\/v1\/?$/i, "") // buang "/rest/v1" bila tak sengaja ikut
    .replace(/\/+$/, ""); // buang trailing slash
}

export const SUPABASE_URL =
  cleanUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) || FALLBACK_URL;
export const SUPABASE_ANON_KEY =
  cleanValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) || FALLBACK_ANON_KEY;

export function hasSupabaseEnv(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

/** Service role (server-only). Dibersihkan dari kutip/spasi. Tanpa fallback. */
export function getServiceRoleKey(): string {
  return cleanValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
}
