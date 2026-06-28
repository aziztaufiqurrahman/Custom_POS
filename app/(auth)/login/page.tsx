import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === "nonaktif"
      ? "Akun Anda dinonaktifkan. Hubungi admin."
      : error === "auth"
        ? "Tautan tidak valid atau kedaluwarsa."
        : null;

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">POS Kasir</CardTitle>
        <CardDescription>Masuk untuk mulai bertransaksi</CardDescription>
      </CardHeader>
      <CardContent>
        {message && (
          <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {message}
          </p>
        )}
        <LoginForm />
      </CardContent>
    </Card>
  );
}
