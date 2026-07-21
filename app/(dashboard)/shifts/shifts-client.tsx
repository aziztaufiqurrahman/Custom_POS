"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Download, Printer, Wallet } from "lucide-react";

import { closeShift, getShiftBreakdown, openShift } from "./actions";
import type { ActiveShift, ShiftHistoryItem } from "./page";
import {
  computeReconciliation,
  grandTotal,
  type PaymentBreakdown,
} from "@/lib/shift";
import { formatRupiah } from "@/lib/format";
import { formatTanggalWaktu } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(strong && "font-semibold")}>{value}</span>
    </div>
  );
}

function VarianceBadge({ variance }: { variance: number }) {
  if (variance === 0) return <Badge variant="outline">Sesuai</Badge>;
  if (variance > 0)
    return <Badge variant="secondary">Lebih {formatRupiah(variance)}</Badge>;
  return <Badge variant="destructive">Kurang {formatRupiah(-variance)}</Badge>;
}

function OpenShiftCard({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState(0);
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await openShift({ opening_balance: value });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Shift dibuka");
      onDone();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-5" /> Buka Shift
        </CardTitle>
        <CardDescription>
          Masukkan uang awal (modal kas) untuk memulai shift. Transaksi tunai
          diblokir tanpa shift aktif.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid max-w-xs gap-2">
          <Label htmlFor="opening">Uang awal (Rp)</Label>
          <RupiahInput
            id="opening"
            value={value}
            onValueChange={setValue}
            placeholder="0"
          />
        </div>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Membuka…" : "Buka Shift"}
        </Button>
      </CardContent>
    </Card>
  );
}

function CloseShiftDialog({
  opening,
  totalCash,
  breakdown,
  onClosed,
}: {
  opening: number;
  totalCash: number;
  breakdown: PaymentBreakdown;
  onClosed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [counted, setCounted] = useState(0);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  const recon = computeReconciliation({
    openingBalance: opening,
    totalCash,
    countedCash: counted,
  });

  function submit() {
    start(async () => {
      const res = await closeShift({
        counted_cash: counted,
        note,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Shift ditutup");
      setOpen(false);
      onClosed();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>Tutup Shift</Button>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tutup Shift & Rekonsiliasi</DialogTitle>
          <DialogDescription>
            Masukkan hitungan fisik uang tunai di laci.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="counted">Hitungan fisik tunai (Rp)</Label>
            <RupiahInput
              id="counted"
              value={counted}
              onValueChange={setCounted}
              placeholder="0"
            />
          </div>

          <div className="rounded-md border p-3">
            <Row label="Uang awal" value={formatRupiah(opening)} />
            <Row label="+ Penjualan tunai" value={formatRupiah(totalCash)} />
            <Row label="= Kas seharusnya" value={formatRupiah(recon.expectedCash)} strong />
            <Row label="Hitungan fisik" value={formatRupiah(counted)} />
            <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">Selisih</span>
              <VarianceBadge variance={recon.variance} />
            </div>
          </div>

          <div className="rounded-md border p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Ringkasan metode bayar
            </p>
            <Row label="Tunai" value={formatRupiah(breakdown.cash)} />
            <Row label="QRIS" value={formatRupiah(breakdown.qris)} />
            <Row label="Transfer" value={formatRupiah(breakdown.transfer)} />
            <Row
              label="Total transaksi"
              value={formatRupiah(grandTotal(breakdown))}
              strong
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="note">Catatan (opsional)</Label>
            <Textarea
              id="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Menutup…" : "Konfirmasi Tutup Shift"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActiveShiftCard({
  active,
  breakdown,
  onClosed,
}: {
  active: ActiveShift;
  breakdown: PaymentBreakdown;
  onClosed: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5" /> Shift Aktif
          </CardTitle>
          <CardDescription>
            Dibuka {formatTanggalWaktu(active.opened_at)}
          </CardDescription>
        </div>
        <CloseShiftDialog
          opening={active.opening_balance}
          totalCash={breakdown.cash}
          breakdown={breakdown}
          onClosed={onClosed}
        />
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <Row label="Uang awal" value={formatRupiah(active.opening_balance)} />
            <Row label="Penjualan tunai" value={formatRupiah(breakdown.cash)} />
            <Row
              label="Kas seharusnya"
              value={formatRupiah(active.opening_balance + breakdown.cash)}
              strong
            />
          </div>
          <div className="rounded-md border p-3">
            <Row label="Tunai" value={formatRupiah(breakdown.cash)} />
            <Row label="QRIS" value={formatRupiah(breakdown.qris)} />
            <Row label="Transfer" value={formatRupiah(breakdown.transfer)} />
            <Row
              label={`Total (${breakdown.count} transaksi)`}
              value={formatRupiah(grandTotal(breakdown))}
              strong
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailDialog({
  item,
  onOpenChange,
}: {
  item: ShiftHistoryItem;
  onOpenChange: (o: boolean) => void;
}) {
  const [breakdown, setBreakdown] = useState<PaymentBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  // Muat breakdown per bank saat dialog dibuka.
  useEffect(() => {
    let alive = true;
    getShiftBreakdown(item.id)
      .then((b) => {
        if (alive) setBreakdown(b);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [item.id]);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Detail Shift</DialogTitle>
          <DialogDescription>
            {item.cashier_name} · {formatTanggalWaktu(item.opened_at)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border p-3">
            <Row label="Uang awal" value={formatRupiah(item.opening_balance)} />
            <Row label="Kas seharusnya" value={formatRupiah(item.expected_cash ?? 0)} />
            <Row label="Hitungan fisik" value={formatRupiah(item.counted_cash ?? 0)} />
            <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm">
              <span className="text-muted-foreground">Selisih</span>
              <VarianceBadge variance={item.variance ?? 0} />
            </div>
          </div>

          <div className="rounded-md border p-3">
            <Row label="Tunai" value={formatRupiah(item.total_cash)} />
            <Row label="QRIS" value={formatRupiah(item.total_qris)} />
            <Row label="Transfer total" value={formatRupiah(item.total_transfer)} />
            {loading ? (
              <p className="py-1 text-xs text-muted-foreground">Memuat rincian bank…</p>
            ) : breakdown ? (
              <div className="mt-1 border-t pt-1">
                <Row label="— Transfer BNI" value={formatRupiah(breakdown.transferByBank.BNI)} />
                <Row label="— Transfer BCA" value={formatRupiah(breakdown.transferByBank.BCA)} />
                <Row label="— Transfer BSI" value={formatRupiah(breakdown.transferByBank.BSI)} />
              </div>
            ) : null}
            <Row
              label="Total transaksi"
              value={formatRupiah(
                item.total_cash + item.total_qris + item.total_transfer,
              )}
              strong
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            render={
              <Link href={`/print/shift/${item.id}`} target="_blank">
                <Printer className="size-4" /> Cetak
              </Link>
            }
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function exportCsv(history: ShiftHistoryItem[]) {
  const header = [
    "Kasir",
    "Dibuka",
    "Ditutup",
    "Uang Awal",
    "Kas Seharusnya",
    "Hitungan Fisik",
    "Selisih",
    "Tunai",
    "QRIS",
    "Transfer",
    "Total Transaksi",
  ];
  const rows = history.map((h) => [
    h.cashier_name,
    h.opened_at,
    h.closed_at ?? "",
    h.opening_balance,
    h.expected_cash ?? 0,
    h.counted_cash ?? 0,
    h.variance ?? 0,
    h.total_cash,
    h.total_qris,
    h.total_transfer,
    h.total_cash + h.total_qris + h.total_transfer,
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "riwayat-shift.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function ShiftsClient({
  active,
  activeBreakdown,
  history,
  isAdmin,
}: {
  active: ActiveShift | null;
  activeBreakdown: PaymentBreakdown | null;
  history: ShiftHistoryItem[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<ShiftHistoryItem | null>(null);

  function refresh() {
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {active && activeBreakdown ? (
        <ActiveShiftCard
          active={active}
          breakdown={activeBreakdown}
          onClosed={refresh}
        />
      ) : (
        <OpenShiftCard onDone={refresh} />
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Riwayat Shift</CardTitle>
            <CardDescription>
              {history.length} shift {isAdmin ? "(semua kasir)" : "Anda"}
            </CardDescription>
          </div>
          {history.length > 0 && (
            <Button variant="outline" onClick={() => exportCsv(history)}>
              <Download className="size-4" /> Ekspor CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada shift yang ditutup.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && <TableHead>Kasir</TableHead>}
                    <TableHead>Ditutup</TableHead>
                    <TableHead className="text-right">Uang Awal</TableHead>
                    <TableHead className="text-right">Total Transaksi</TableHead>
                    <TableHead>Selisih</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((h) => (
                    <TableRow
                      key={h.id}
                      className="cursor-pointer"
                      onClick={() => setDetail(h)}
                    >
                      {isAdmin && <TableCell>{h.cashier_name}</TableCell>}
                      <TableCell>
                        {h.closed_at ? formatTanggalWaktu(h.closed_at) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRupiah(h.opening_balance)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRupiah(
                          h.total_cash + h.total_qris + h.total_transfer,
                        )}
                      </TableCell>
                      <TableCell>
                        <VarianceBadge variance={h.variance ?? 0} />
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        Detail
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {detail && (
        <DetailDialog
          key={detail.id}
          item={detail}
          onOpenChange={(o) => !o && setDetail(null)}
        />
      )}
    </div>
  );
}
