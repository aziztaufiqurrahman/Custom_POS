import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { DaftarForm } from "./daftar-form";

export const metadata = { title: "Daftar" };

export default function DaftarPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">Buat Akun</CardTitle>
        <CardDescription>
          Kelola penjualan, stok, dan kas usaha Anda dalam satu aplikasi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DaftarForm />
      </CardContent>
    </Card>
  );
}
