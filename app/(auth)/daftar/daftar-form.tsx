"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { signUp } from "@/app/(auth)/actions";
import { signUpSchema, type SignUpInput } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

export function DaftarForm() {
  const [pending, startTransition] = useTransition();
  const [terkirim, setTerkirim] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { full_name: "", email: "", password: "", confirm: "" },
  });

  function onSubmit(values: SignUpInput) {
    startTransition(async () => {
      const result = await signUp(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setTerkirim(values.email);
    });
  }

  // Konfirmasi email wajib, jadi tidak ada sesi setelah mendaftar. Yang bisa
  // dilakukan user berikutnya hanyalah membuka emailnya.
  if (terkirim) {
    return (
      <div className="space-y-4 text-center text-sm">
        <p>
          Kami mengirim tautan konfirmasi ke <strong>{terkirim}</strong>. Buka
          tautan itu untuk mengaktifkan akun Anda.
        </p>
        <p className="text-muted-foreground">
          Tidak ada di kotak masuk? Periksa folder spam.
        </p>
        <Button
          render={<Link href="/login">Kembali ke Masuk</Link>}
          variant="outline"
          className="w-full"
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="full_name">Nama Lengkap</Label>
        <Input
          id="full_name"
          autoComplete="name"
          placeholder="Aziz Taufiqurrahman"
          {...register("full_name")}
        />
        {errors.full_name && (
          <p className="text-sm text-destructive">{errors.full_name.message}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="nama@toko.com"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="password">Kata Sandi</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          placeholder="Minimal 8 karakter"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="confirm">Ulangi Kata Sandi</Label>
        <PasswordInput
          id="confirm"
          autoComplete="new-password"
          placeholder="••••••••"
          {...register("confirm")}
        />
        {errors.confirm && (
          <p className="text-sm text-destructive">{errors.confirm.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Mendaftarkan…" : "Daftar"}
      </Button>

      <div className="text-center text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link href="/login" className="text-foreground hover:underline">
          Masuk
        </Link>
      </div>
    </form>
  );
}
