import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types";

export type SessionResult = {
  userId: string | null;
  profile: Profile | null;
};

/**
 * Ambil user + profil untuk request saat ini. Dibungkus React cache agar
 * hanya sekali query per request meski dipanggil di beberapa tempat.
 */
export const getSession = cache(async (): Promise<SessionResult> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return { userId: user.id, profile: profile ?? null };
});

/** Pastikan ada user aktif; jika tidak, redirect ke /login. */
export async function requireAuth(): Promise<{ userId: string; profile: Profile }> {
  const { userId, profile } = await getSession();
  if (!userId || !profile) redirect("/login");
  if (!profile.is_active) redirect("/login?error=nonaktif");
  return { userId, profile };
}

/** Pastikan user adalah admin; jika bukan, redirect. */
export async function requireAdmin(): Promise<{ userId: string; profile: Profile }> {
  const session = await requireAuth();
  if (session.profile.role !== "admin") redirect("/pos");
  return session;
}
