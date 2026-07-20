"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Membersihkan sesi Supabase (server). Navigasi ke /login dilakukan di klien
 * (window.location) agar tidak terjadi race redirect saat menu/komponen unmount.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
