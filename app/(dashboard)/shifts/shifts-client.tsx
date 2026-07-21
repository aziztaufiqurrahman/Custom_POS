"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, Download, Printer, Plus, Trash2, Wallet } from "lucide-react";

import {
  addExpense,
  closeShift,
  deleteExpense,
  getShiftBreakdown,
  openShift,
} from "./actions";
import type { ActiveShift, ShiftHistoryItem } from "./page";
import type { SessionExpenses } from "./queries";
import {
  computeReconciliation,
  grandTotal,
  type PaymentBreakdown,
} from "@/lib/shift";
import { EXPENSE_CATEGORIES } from "@/lib/validations/shift";
import { DownloadInvoiceButton } from "@/components/domain/download-invoice-button";
import { formatRupiah } from "@/lib/format";
import { formatTanggalWaktu } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  ongkir: "Ongkos kirim",
  operasional: "Operasional",
  bahan: "Bahan",
  lainnya: "Lainnya",
};

function ExpenseDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<string>("ongkir");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await addExpense({ amount, category, note });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengeluaran dicatat");
      setAmount(0);
      setCategory("ongkir");
      setNote("");
      setOpen(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Catat Pengeluaran
      </Button>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Catat Pengeluaran Kas</DialogTitle>
          <DialogDescription>
            Uang keluar dari laci kas (mis. bayar ongkos kirim/kurir). Mengurangi
            kas seharusnya saat tutup shift.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="exp-amount">Nominal (Rp)</Label>
            <RupiahInput
              id="exp-amount"
              value={amount}
              onValueChange={setAmount}
              placeholder="0"
            />
          </div>
          <div className="grid gap-2">
            <Label>Kategori</Label>
            <Select value={category} onValueChange={(v) => setCategory(v ?? "lainnya")}>
              <SelectTrigger>
                <SelectValue>
                  {(val: string | null) =>
                    EXPENSE_CATEGORY_LABELS[val ?? "lainnya"] ?? "Lainnya"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {EXPENSE_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="exp-note">Catatan (opsional)</Label>
            <Input
              id="exp-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="mis. ongkir GoSend pesanan #123"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Batal
          </Button>
          <Button onClick={submit} disabled={pending || amount <= 0}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExpensesCard({
  expenses,
  onChanged,
}: {
  expenses: SessionExpenses;
  onChanged: () => void;
}) {
  const [pending, start] = useTransition();

  function remove(id: string) {
    start(async () => {
      const res = await deleteExpense(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengeluaran dihapus");
      onChanged();
    });
  }

  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Pengeluaran (kas keluar)</span>
        <ExpenseDialog onDone={onChanged} />
      </div>
      {expenses.items.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">
          Belum ada pengeluaran pada shift ini.
        </p>
      ) : (
        <ul className="divide-y">
          {expenses.items.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <div className="min-w-0">
                <p className="truncate">
                  {EXPENSE_CATEGORY_LABELS[e.category] ?? e.category}
                  {e.note ? <span className="text-muted-foreground"> · {e.note}</span> : null}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap font-medium">
                  {formatRupiah(e.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(e.id)}
                  disabled={pending}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-1 flex items-center justify-between border-t pt-2 text-sm font-semibold">
        <span>Total pengeluaran</span>
        <span>{formatRupiah(expenses.total)}</span>
      </div>
    </div>
  );
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
  totalExpenses,
  breakdown,
  onClosed,
}: {
  opening: number;
  totalCash: number;
  totalExpenses: number;
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
    totalExpenses,
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
            {totalExpenses > 0 && (
              <Row label="− Pengeluaran kas" value={formatRupiah(totalExpenses)} />
            )}
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
            <Row label="GoFood" value={formatRupiah(breakdown.gofood)} />
            <Row label="ShopeeFood" value={formatRupiah(breakdown.shopeefood)} />
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
  expenses,
  onClosed,
}: {
  active: ActiveShift;
  breakdown: PaymentBreakdown;
  expenses: SessionExpenses;
  onClosed: () => void;
}) {
  const expectedCash = active.opening_balance + breakdown.cash - expenses.total;
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
          totalExpenses={expenses.total}
          breakdown={breakdown}
          onClosed={onClosed}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border p-3">
            <Row label="Uang awal" value={formatRupiah(active.opening_balance)} />
            <Row label="Penjualan tunai" value={formatRupiah(breakdown.cash)} />
            {expenses.total > 0 && (
              <Row label="− Pengeluaran kas" value={formatRupiah(expenses.total)} />
            )}
            <Row
              label="Kas seharusnya"
              value={formatRupiah(expectedCash)}
              strong
            />
          </div>
          <div className="rounded-md border p-3">
            <Row label="Tunai" value={formatRupiah(breakdown.cash)} />
            <Row label="QRIS" value={formatRupiah(breakdown.qris)} />
            <Row label="Transfer" value={formatRupiah(breakdown.transfer)} />
            <Row label="GoFood" value={formatRupiah(breakdown.gofood)} />
            <Row label="ShopeeFood" value={formatRupiah(breakdown.shopeefood)} />
            <Row
              label={`Total (${breakdown.count} transaksi)`}
              value={formatRupiah(grandTotal(breakdown))}
              strong
            />
          </div>
        </div>
        <ExpensesCard expenses={expenses} onChanged={onClosed} />
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
            {item.total_expenses > 0 && (
              <Row label="Pengeluaran kas" value={formatRupiah(item.total_expenses)} />
            )}
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
            <Row label="GoFood" value={formatRupiah(item.total_gofood)} />
            <Row label="ShopeeFood" value={formatRupiah(item.total_shopeefood)} />
            <Row
              label="Total transaksi"
              value={formatRupiah(
                item.total_cash +
                  item.total_qris +
                  item.total_transfer +
                  item.total_gofood +
                  item.total_shopeefood,
              )}
              strong
            />
          </div>
        </div>

        <DialogFooter className="flex-row justify-end gap-2">
          <Button
            variant="outline"
            render={
              <Link href={`/print/shift/${item.id}`} target="_blank">
                <Printer className="size-4" /> Cetak
              </Link>
            }
          />
          <DownloadInvoiceButton kind="shift" sessionId={item.id} label="Unduh PDF" />
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
    "GoFood",
    "ShopeeFood",
    "Pengeluaran",
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
    h.total_gofood,
    h.total_shopeefood,
    h.total_expenses,
    h.total_cash +
      h.total_qris +
      h.total_transfer +
      h.total_gofood +
      h.total_shopeefood,
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
  activeExpenses,
  history,
  isAdmin,
}: {
  active: ActiveShift | null;
  activeBreakdown: PaymentBreakdown | null;
  activeExpenses: SessionExpenses | null;
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
          expenses={activeExpenses ?? { total: 0, items: [] }}
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
                          h.total_cash +
                            h.total_qris +
                            h.total_transfer +
                            h.total_gofood +
                            h.total_shopeefood,
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
