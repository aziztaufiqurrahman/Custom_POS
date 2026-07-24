"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getBranchContext, ACTIVE_BRANCH_COOKIE } from "@/lib/branch";

/**
 * Membersihkan sesi Supabase (server). Navigasi ke /login dilakukan di klien
 * (window.location) agar tidak terjadi race redirect saat menu/komponen unmount.
 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}

/**
 * Pilih cabang aktif. Hanya boleh memilih cabang yang boleh diakses user
 * (divalidasi terhadap konteks cabang). Disimpan di cookie & menyegarkan UI.
 */
export async function setActiveBranch(
  branchId: string,
): Promise<{ error?: string; success?: boolean }> {
  const ctx = await getBranchContext();
  if (!ctx.branches.some((b) => b.id === branchId)) {
    return { error: "Cabang tidak tersedia untuk akun Anda" };
  }
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_BRANCH_COOKIE, branchId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  revalidatePath("/", "layout");
  return { success: true };
}
