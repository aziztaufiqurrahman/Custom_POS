"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarCheck, ShieldAlert, ShieldCheck } from "lucide-react";

import { closeDailyToday } from "./actions";
import type { ClosureRow, SeqGap } from "./page";
import { formatRupiah } from "@/lib/format";
import { formatTanggal, formatTanggalWaktu } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function totalsText(t: Record<string, unknown>): { count: number; gross: number } {
  return {
    count: Number(t.trx_count ?? 0),
    gross: Number(t.gross_total ?? 0),
  };
}

export function KeamananClient({
  isMasterAdmin,
  activeBranchName,
  gaps,
  closures,
}: {
  isMasterAdmin: boolean;
  activeBranchName: string;
  gaps: SeqGap[];
  closures: ClosureRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function tutupHariIni() {
    start(async () => {
      const res = await closeDailyToday();
      if (res.error) {
        toast.error(res.error);
        return;
      }
      const t = totalsText(res.totals ?? {});
      toast.success(
        `Z-Report tersimpan: ${t.count} transaksi, ${formatRupiah(t.gross)}`,
      );
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {/* Integritas nomor urut (master admin) */}
      {isMasterAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {gaps.length === 0 ? (
                <ShieldCheck className="size-5 text-emerald-500" />
              ) : (
                <ShieldAlert className="size-5 text-destructive" />
              )}
              Integritas Nomor Transaksi
            </CardTitle>
            <CardDescription>
              Nomor urut per cabang harus rapat tanpa celah. Celah = indikasi
              transaksi dihapus.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {gaps.length === 0 ? (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                Aman — tidak ada celah nomor urut di cabang mana pun.
              </p>
            ) : (
              <div className="space-y-2">
                {gaps.map((g) => (
                  <div
                    key={g.branch_id}
                    className="flex items-center justify-between rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm"
                  >
                    <span className="font-medium">{g.branch_name}</span>
                    <span className="text-muted-foreground">
                      Nomor tertinggi {g.max_seq}, tercatat {g.trx_count} →{" "}
                      <b className="text-destructive">{g.missing} hilang</b>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Z-Report harian */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck className="size-5 text-primary" /> Tutup Harian (Z-Report)
            </CardTitle>
            <CardDescription>
              Kunci total penjualan hari ini untuk cabang {activeBranchName}.
            </CardDescription>
          </div>
          <Button onClick={tutupHariIni} disabled={pending}>
            {pending ? "Memproses…" : "Tutup Hari Ini"}
          </Button>
        </CardHeader>
        <CardContent>
          {closures.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada laporan harian tersimpan.
            </p>
          ) : (
            <div className="space-y-2">
              {closures.map((c, i) => {
                const t = totalsText(c.totals);
                return (
                  <div
                    key={i}
                    className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{c.branch_name}</Badge>
                      <span className="font-medium">{formatTanggal(c.business_date)}</span>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <span>{t.count} transaksi</span>
                      <span className="font-semibold text-foreground">
                        {formatRupiah(t.gross)}
                      </span>
                      <span className="text-xs">
                        dikunci {formatTanggalWaktu(c.closed_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
