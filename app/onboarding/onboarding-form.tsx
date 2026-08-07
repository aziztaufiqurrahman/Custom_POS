"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createWorkspace } from "./actions";
import {
  onboardingSchema,
  type OnboardingInput,
} from "@/lib/validations/onboarding";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingForm({ namaPengguna }: { namaPengguna: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { workspace_name: "", branch_name: "", branch_code: "UTAMA" },
  });

  const namaUsaha = watch("workspace_name").trim();

  function onSubmit(values: OnboardingInput) {
    startTransition(async () => {
      const result = await createWorkspace(values);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Usaha Anda siap dipakai.");
      // refresh() dulu agar layout dashboard membaca konteks workspace yang baru.
      router.refresh();
      router.replace("/pos");
    });
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          {namaPengguna ? `Selamat datang, ${namaPengguna}` : "Selamat datang"}
        </CardTitle>
        <CardDescription>
          Satu langkah lagi. Beri tahu kami nama usaha Anda, dan kami siapkan
          cabang pusatnya.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="workspace_name">Nama Usaha</Label>
            <Input
              id="workspace_name"
              autoFocus
              autoComplete="organization"
              placeholder="Warung Makan Sederhana"
              {...register("workspace_name")}
            />
            {errors.workspace_name && (
              <p className="text-sm text-destructive">
                {errors.workspace_name.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="branch_name">
              Nama Cabang Pusat{" "}
              <span className="font-normal text-muted-foreground">(opsional)</span>
            </Label>
            <Input
              id="branch_name"
              placeholder={namaUsaha ? `${namaUsaha} - Pusat` : "Cabang Pusat"}
              {...register("branch_name")}
            />
            {errors.branch_name && (
              <p className="text-sm text-destructive">
                {errors.branch_name.message}
              </p>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="branch_code">Kode Cabang</Label>
            <Input
              id="branch_code"
              className="uppercase"
              placeholder="UTAMA"
              {...register("branch_code")}
            />
            {errors.branch_code ? (
              <p className="text-sm text-destructive">
                {errors.branch_code.message}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Kode singkat untuk membedakan cabang, mis. UTAMA atau JKT-1.
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Menyiapkan…" : "Mulai Pakai"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Anda mulai di paket <strong>Gratis</strong> — 1 cabang, 2 pengguna.
            Bisa ditingkatkan kapan saja.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
