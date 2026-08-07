"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import {
  forgotPasswordSchema,
  loginSchema,
  signUpSchema,
} from "@/lib/validations/auth";

export type ActionResult = { error?: string; success?: boolean };

async function getOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

export async function signIn(raw: unknown): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { error: "Input tidak valid" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email atau kata sandi salah" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", user.id)
      .single();
    if (profile && !profile.is_active) {
      await supabase.auth.signOut();
      return { error: "Akun Anda dinonaktifkan. Hubungi admin." };
    }
    await logAudit({ action: "auth.login", entity: "auth", entityId: user.id });
  }

  redirect("/pos");
}

/**
 * Pendaftaran mandiri. Konfirmasi email WAJIB di kedua proyek
 * (`mailer_autoconfirm = false`), sehingga `signUp` TIDAK mengembalikan sesi —
 * user harus mengklik tautan di email lebih dulu. Tautan itu mengarah ke
 * `/auth/confirm?type=signup&next=/` (lihat `supabase/email-templates/
 * confirmation.html`), lalu `/` → `/pos` → penjaga onboarding.
 *
 * Peran tidak pernah dikirim dari sini. Akun lahir sebagai `kasir` tanpa
 * workspace; haknya naik hanya untuk workspace yang ia buat sendiri.
 */
export async function signUp(raw: unknown): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Input tidak valid" };
  }
  const { email, password, full_name } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name } },
  });

  if (error) {
    // Batas kirim email terlampaui adalah satu-satunya kegagalan yang perlu
    // dibedakan — user harus tahu untuk mencoba lagi nanti, bukan mengira
    // datanya salah.
    if (error.status === 429) {
      return { error: "Terlalu banyak percobaan. Coba lagi beberapa saat lagi." };
    }
    return { error: "Pendaftaran gagal. Periksa data Anda lalu coba lagi." };
  }

  // Selalu balas sukses tanpa menyebut apakah email sudah terdaftar, agar tidak
  // bisa dipakai memeriksa keberadaan akun (email enumeration).
  return { success: true };
}

export async function requestPasswordReset(raw: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { error: "Email tidak valid" };

  const supabase = await createClient();
  const origin = await getOrigin();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });
  // Selalu sukses agar tidak membocorkan keberadaan email.
  return { success: true };
}
