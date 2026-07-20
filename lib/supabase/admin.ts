import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { getServiceRoleKey, SUPABASE_URL } from "./env";

/**
 * Supabase ADMIN client (service role) — MELEWATI RLS.
 *
 * BAHAYA: hanya boleh dipanggil di sisi server (Server Action / Route Handler).
 * Import `server-only` memastikan modul ini tidak pernah ter-bundle ke klien.
 * Pakai hanya untuk operasi admin terkontrol (mis. membuat akun karyawan).
 */
export function createAdminClient() {
  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diset di environment server.");
  }

  return createSupabaseClient<Database>(SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
