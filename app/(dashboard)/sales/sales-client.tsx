"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Download, Eye, Printer, Search, Undo2 } from "lucide-react";

import {
  getSaleDetail,
  refundSaleAction,
  voidSaleAction,
  type SaleDetail,
} from "./actions";
import type { SaleRow, SalesFilters } from "./page";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatNumber, formatRupiah } from "@/lib/format";
import { formatTanggalRingkas, formatTanggalWaktu } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function StatusBadge({ status }: { status: SaleRow["status"] }) {
  if (status === "void") return <Badge variant="destructive">Void</Badge>;
  if (status === "refunded") return <Badge variant="secondary">Refund</Badge>;
  return <Badge variant="outline">Selesai</Badge>;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function SalesClient({
  rows,
  filters,
  isAdmin,
  canVoid,
  canRefund,
  cashiers,
  shifts,
}: {
  rows: SaleRow[];
  filters: SalesFilters;
  isAdmin: boolean;
  canVoid: boolean;
  canRefund: boolean;
  cashiers: { id: string; full_name: string }[];
  shifts: { id: string; opened_at: string; cashier_name: string }[];
}) {
  const router = useRouter();
  const [f, setF] = useState<SalesFilters>(filters);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [action, setAction] = useState<{ row: SaleRow; kind: "void" | "refund" } | null>(null);

  useEffect(() => setF(filters), [filters]);

  function apply(next: Partial<SalesFilters> = {}) {
    const merged = { ...f, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v && v !== "all") params.set(k, v);
    }
    router.push(`/sales?${params.toString()}`);
  }

  function reset() {
    router.push("/sales");
  }

  const summary = useMemo(() => {
    const completed = rows.filter((r) => r.status === "completed");
    const byMethod = { cash: 0, qris: 0, transfer: 0, gofood: 0, shopeefood: 0 };
    const byBank = { BNI: 0, BCA: 0, BSI: 0 };
    let revenue = 0;
    let items = 0;
    for (const r of completed) {
      revenue += r.grand_total;
      items += r.item_count;
      const m = r.methods[0] ?? "cash";
      byMethod[m] += r.grand_total;
      if (m === "transfer" && r.bank) byBank[r.bank] += r.grand_total;
    }
    return { count: completed.length, revenue, items, byMethod, byBank };
  }, [rows]);

  function exportCsv() {
    const header = ["No Transaksi", "Tanggal", "Kasir", "Item", "Total", "Metode", "Status"];
    const body = rows.map((r) => [
      r.code,
      r.created_at,
      r.cashier_name,
      r.item_count,
      r.grand_total,
      r.methods.map((m) => PAYMENT_METHOD_LABELS[m]).join("+"),
      r.status,
    ]);
    const csv = [header, ...body]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "rekap-penjualan.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat label="Total Transaksi" value={formatNumber(summary.count)} sub="selesai" />
        <Stat label="Pendapatan" value={formatRupiah(summary.revenue)} />
        <Stat label="Item Terjual" value={formatNumber(summary.items)} />
      </div>

      {/* Rincian per metode pembayaran */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Tunai" value={formatRupiah(summary.byMethod.cash)} />
        <Stat label="QRIS" value={formatRupiah(summary.byMethod.qris)} />
        <Stat label="Transfer" value={formatRupiah(summary.byMethod.transfer)} />
        <Stat label="GoFood" value={formatRupiah(summary.byMethod.gofood)} />
        <Stat label="ShopeeFood" value={formatRupiah(summary.byMethod.shopeefood)} />
      </div>

      {/* Transfer per bank — kolom masing-masing bank */}
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Transfer BNI" value={formatRupiah(summary.byBank.BNI)} />
        <Stat label="Transfer BCA" value={formatRupiah(summary.byBank.BCA)} />
        <Stat label="Transfer BSI" value={formatRupiah(summary.byBank.BSI)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Dari tanggal</Label>
              <Input
                type="date"
                value={f.from}
                onChange={(e) => setF({ ...f, from: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Sampai tanggal</Label>
              <Input
                type="date"
                value={f.to}
                onChange={(e) => setF({ ...f, to: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Metode</Label>
              <Select value={f.method} onValueChange={(v) => setF({ ...f, method: v ?? "all" })}>
                <SelectTrigger>
                  <SelectValue>
                    {(val: string | null) =>
                      val === "cash"
                        ? "Tunai"
                        : val === "qris"
                          ? "QRIS"
                          : val === "transfer"
                            ? "Transfer"
                            : val === "gofood"
                              ? "GoFood"
                              : val === "shopeefood"
                                ? "ShopeeFood"
                                : "Semua metode"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua metode</SelectItem>
                  <SelectItem value="cash">Tunai</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                  <SelectItem value="transfer">Transfer</SelectItem>
                  <SelectItem value="gofood">GoFood</SelectItem>
                  <SelectItem value="shopeefood">ShopeeFood</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v ?? "all" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua status</SelectItem>
                  <SelectItem value="completed">Selesai</SelectItem>
                  <SelectItem value="void">Void</SelectItem>
                  <SelectItem value="refunded">Refund</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isAdmin && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Kasir</Label>
                <Select value={f.cashier} onValueChange={(v) => setF({ ...f, cashier: v ?? "all" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua kasir</SelectItem>
                    {cashiers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-xs">Shift</Label>
              <Select value={f.shift} onValueChange={(v) => setF({ ...f, shift: v ?? "all" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua shift</SelectItem>
                  {shifts.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {formatTanggalRingkas(s.opened_at)} · {s.cashier_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={f.q}
                onChange={(e) => setF({ ...f, q: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && apply()}
                placeholder="Cari no transaksi / pelanggan…"
                className="pl-8"
              />
            </div>
            <Button onClick={() => apply()}>Terapkan</Button>
            <Button variant="outline" onClick={reset}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>{rows.length} Transaksi</CardTitle>
          {rows.length > 0 && (
            <Button variant="outline" onClick={exportCsv}>
              <Download className="size-4" /> Ekspor CSV
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada transaksi untuk filter ini.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No</TableHead>
                    <TableHead>Tanggal</TableHead>
                    {isAdmin && <TableHead>Kasir</TableHead>}
                    <TableHead className="text-right">Item</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.code}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatTanggalRingkas(r.created_at)}
                      </TableCell>
                      {isAdmin && <TableCell>{r.cashier_name}</TableCell>}
                      <TableCell className="text-right">{formatNumber(r.item_count)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatRupiah(r.grand_total)}
                      </TableCell>
                      <TableCell>
                        {r.methods.map((m) => (
                          <Badge key={m} variant="secondary" className="mr-1">
                            {PAYMENT_METHOD_LABELS[m]}
                            {m === "transfer" && r.bank ? ` ${r.bank}` : ""}
                          </Badge>
                        ))}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon-sm" onClick={() => setDetailId(r.id)}>
                          <Eye className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {detailId && (
        <DetailDialog
          id={detailId}
          canVoid={canVoid}
          canRefund={canRefund}
          onClose={() => setDetailId(null)}
          onAction={(row, kind) => {
            setDetailId(null);
            setAction({ row, kind });
          }}
        />
      )}

      {action && (
        <ActionDialog
          row={action.row}
          kind={action.kind}
          onOpenChange={(o) => !o && setAction(null)}
          onDone={() => {
            setAction(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function DetailDialog({
  id,
  canVoid,
  canRefund,
  onClose,
  onAction,
}: {
  id: string;
  canVoid: boolean;
  canRefund: boolean;
  onClose: () => void;
  onAction: (row: SaleRow, kind: "void" | "refund") => void;
}) {
  const [detail, setDetail] = useState<SaleDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getSaleDetail(id)
      .then((d) => alive && setDetail(d))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Detail Transaksi</DialogTitle>
          <DialogDescription>{detail?.code ?? "Memuat…"}</DialogDescription>
        </DialogHeader>

        {loading || !detail ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Memuat…</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="text-xs text-muted-foreground">
              {formatTanggalWaktu(detail.created_at)} · {detail.cashier_name}
              {detail.customer_name ? ` · ${detail.customer_name}` : ""}
            </div>

            <ul className="divide-y border-y">
              {detail.items.map((it, i) => (
                <li key={i} className="flex justify-between py-1.5">
                  <span>
                    {it.name}
                    <span className="block text-xs text-muted-foreground">
                      {formatNumber(it.qty)} × {formatRupiah(it.unit_price)}
                      {it.discount > 0 ? ` − ${formatRupiah(it.discount)}` : ""}
                    </span>
                  </span>
                  <span>{formatRupiah(it.line_total)}</span>
                </li>
              ))}
            </ul>

            <div className="space-y-0.5">
              <Row label="Subtotal" value={formatRupiah(detail.subtotal)} />
              {detail.discount_total > 0 && (
                <Row label="Diskon" value={`- ${formatRupiah(detail.discount_total)}`} />
              )}
              {detail.tax_total > 0 && <Row label="Pajak" value={formatRupiah(detail.tax_total)} />}
              <div className="flex justify-between border-t pt-1 font-bold">
                <span>Total</span>
                <span>{formatRupiah(detail.grand_total)}</span>
              </div>
              {detail.shipping_cost > 0 && (
                <Row
                  label="Ongkos kirim (di luar pendapatan)"
                  value={formatRupiah(detail.shipping_cost)}
                />
              )}
            </div>

            <div className="rounded-md border p-2">
              {detail.payments.map((p, i) => (
                <div key={i} className="text-xs">
                  <Row
                    label={`${PAYMENT_METHOD_LABELS[p.method]}${p.bank ? " " + p.bank : ""}`}
                    value={formatRupiah(p.cash_received ?? p.amount)}
                  />
                  {p.change_given != null && (
                    <Row label="Kembalian" value={formatRupiah(p.change_given)} />
                  )}
                  {p.reference && <Row label="Ref" value={p.reference} />}
                </div>
              ))}
            </div>

            {detail.status !== "completed" && (
              <Badge variant="destructive">
                {detail.status === "void" ? "Transaksi di-void" : "Refund"}
              </Badge>
            )}
          </div>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="outline"
            render={
              <Link href={`/print/receipt/${id}`} target="_blank">
                <Printer className="size-4" /> Cetak
              </Link>
            }
          />
          {detail?.status === "completed" && (
            <div className="flex gap-2">
              {canRefund && (
                <Button
                  variant="outline"
                  onClick={() =>
                    onAction({ id: detail.id, code: detail.code } as SaleRow, "refund")
                  }
                >
                  <Undo2 className="size-4" /> Refund
                </Button>
              )}
              {canVoid && (
                <Button
                  variant="destructive"
                  onClick={() =>
                    onAction({ id: detail.id, code: detail.code } as SaleRow, "void")
                  }
                >
                  <Ban className="size-4" /> Void
                </Button>
              )}
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionDialog({
  row,
  kind,
  onOpenChange,
  onDone,
}: {
  row: SaleRow;
  kind: "void" | "refund";
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const isVoid = kind === "void";

  function submit() {
    start(async () => {
      const res = isVoid
        ? await voidSaleAction(row.id, reason)
        : await refundSaleAction(row.id, reason);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(
        isVoid ? "Transaksi di-void, stok dikembalikan" : "Transaksi di-refund, stok dikembalikan",
      );
      onDone();
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {isVoid ? "Void" : "Refund"} transaksi {row.code}?
          </DialogTitle>
          <DialogDescription>
            Stok akan dikembalikan dan transaksi ditandai {isVoid ? "void" : "refunded"}.
            Tindakan ini tercatat di audit.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="reason">Alasan (opsional)</Label>
          <Textarea
            id="reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Batal
          </Button>
          <Button variant="destructive" onClick={submit} disabled={pending}>
            {pending ? "Memproses…" : isVoid ? "Ya, Void" : "Ya, Refund"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
