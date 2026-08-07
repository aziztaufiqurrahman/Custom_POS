import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/format";
import { formatTanggalWaktu } from "@/lib/date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { TombolKonfirmasi } from "./tombol-konfirmasi";

export const metadata = { title: "Pesanan Masuk" };

export default async function PesananPlatformPage() {
  await requireAuth();
  const supabase = await createClient();

  // Halaman operator SaaS, bukan tenant. Non-staf tidak boleh melihat apa pun.
  const { data: staf } = await supabase.rpc("am_i_staff");
  if (staf !== true) redirect("/pos");

  const [{ data: pendingRows }, { data: paymentRows }] = await Promise.all([
    supabase.rpc("staff_pending_orders"),
    supabase.rpc("staff_recent_payments"),
  ]);

  const pending = (pendingRows ?? []) as {
    order_id: string;
    code: string;
    total: number;
    created_at: string;
    tier: string;
    billing_period: string;
    workspace: string;
    pemesan: string | null;
  }[];

  const payments = (paymentRows ?? []) as {
    code: string;
    workspace: string;
    tier: string;
    amount: number;
    method: string | null;
    gateway: string;
    paid_at: string;
  }[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pesanan Masuk</h1>
        <p className="text-sm text-muted-foreground">
          Cocokkan transfer yang diterima dengan pesanan, lalu konfirmasi.
          Paket pelanggan naik otomatis setelah dikonfirmasi.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Menunggu Pembayaran</CardTitle>
          <CardDescription>
            {pending.length === 0
              ? "Tidak ada pesanan yang menunggu."
              : `${pending.length} pesanan menunggu konfirmasi.`}
          </CardDescription>
        </CardHeader>
        {pending.length > 0 && (
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Usaha</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                  <TableHead>Dibuat</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((o) => (
                  <TableRow key={o.order_id}>
                    <TableCell className="font-mono text-xs">{o.code}</TableCell>
                    <TableCell>
                      <div>{o.workspace}</div>
                      <div className="text-xs text-muted-foreground">{o.pemesan}</div>
                    </TableCell>
                    <TableCell className="capitalize">
                      {o.tier}
                      <span className="text-muted-foreground">
                        {o.billing_period === "annual" ? " · tahunan" : " · bulanan"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatRupiah(Number(o.total))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatTanggalWaktu(o.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <TombolKonfirmasi
                        orderId={o.order_id}
                        kode={o.code}
                        nilai={Number(o.total)}
                        usaha={o.workspace}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pembayaran Terakhir</CardTitle>
          <CardDescription>50 pembayaran terakhir yang sudah lunas.</CardDescription>
        </CardHeader>
        {payments.length > 0 && (
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kode</TableHead>
                  <TableHead>Usaha</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead>Waktu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.code + p.paid_at}>
                    <TableCell className="font-mono text-xs">{p.code}</TableCell>
                    <TableCell>{p.workspace}</TableCell>
                    <TableCell className="capitalize">{p.tier}</TableCell>
                    <TableCell className="text-right">
                      {formatRupiah(Number(p.amount))}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.gateway === "manual" ? "Transfer manual" : p.gateway}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatTanggalWaktu(p.paid_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
