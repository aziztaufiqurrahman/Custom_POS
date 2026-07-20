import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/types/database";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./env";

/**
 * Supabase client untuk komponen Client (browser).
 * HANYA gunakan ANON KEY publik di sini — JANGAN service role key.
 */
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
}
