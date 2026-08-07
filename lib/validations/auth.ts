import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Kata sandi wajib diisi"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Email tidak valid"),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Pendaftaran mandiri. Akun yang terbentuk selalu berperan `kasir` tanpa
 * workspace (bawaan tabel `profiles`); haknya baru naik saat ia membuat
 * workspace sendiri lewat `provision_my_workspace()`. Tidak ada field peran
 * di sini, dan `handle_new_user` hanya membaca `full_name` — jadi tidak ada
 * jalan menaikkan hak lewat metadata pendaftaran.
 */
export const signUpSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Nama minimal 2 karakter")
      .max(120, "Nama maksimal 120 karakter"),
    email: z.string().trim().email("Email tidak valid"),
    // Minimum di Supabase adalah 6; di sini 8 agar selaras dengan reset sandi.
    password: z.string().min(8, "Kata sandi minimal 8 karakter"),
    confirm: z.string().min(1, "Konfirmasi kata sandi"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Konfirmasi kata sandi tidak cocok",
    path: ["confirm"],
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Kata sandi minimal 8 karakter"),
    confirm: z.string().min(1, "Konfirmasi kata sandi"),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Konfirmasi kata sandi tidak cocok",
    path: ["confirm"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
