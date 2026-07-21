"use client";

import Link from "next/link";
import { CheckCircle2, Printer } from "lucide-react";

import type { CompletedSale } from "./types";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatRupiah } from "@/lib/format";
import { formatTanggalWaktu } from "@/lib/date";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ReceiptDialog({
  sale,
  storeName,
  cashierName,
  onClose,
}: {
  sale: CompletedSale;
  storeName: string;
  cashierName: string;
  onClose: () => void;
}) {
  const { receipt, items, totals, payment } = sale;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-500" /> Transaksi Berhasil
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <div className="text-center">
            <p className="font-semibold">{storeName}</p>
            <p className="text-xs text-muted-foreground">{receipt.code}</p>
            <p className="text-xs text-muted-foreground">
              {formatTanggalWaktu(sale.createdAt)} · {cashierName}
            </p>
          </div>

          <ul className="divide-y border-y py-1">
            {items.map((it, i) => (
              <li key={i} className="py-1">
                <div className="flex justify-between">
                  <span>{it.name}</span>
                  <span>{formatRupiah(it.lineTotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {it.qty} × {formatRupiah(it.unitPrice)}
                  {it.discount > 0 && ` − diskon ${formatRupiah(it.discount)}`}
                </p>
              </li>
            ))}
          </ul>

          <div className="space-y-0.5">
            <Line label="Subtotal" value={formatRupiah(totals.grossSubtotal)} />
            {totals.discountTotal > 0 && (
              <Line label="Diskon" value={`- ${formatRupiah(totals.discountTotal)}`} />
            )}
            {totals.taxTotal > 0 && (
              <Line label="Pajak" value={formatRupiah(totals.taxTotal)} />
            )}
            <div className="flex justify-between border-t pt-1 font-bold">
              <span>Total</span>
              <span>{formatRupiah(totals.grandTotal)}</span>
            </div>
            <Line
              label={`Bayar (${PAYMENT_METHOD_LABELS[payment.method]}${payment.bank ? " " + payment.bank : ""})`}
              value={formatRupiah(
                payment.cashReceived ?? totals.grandTotal,
              )}
            />
            {payment.method === "cash" && (
              <Line label="Kembalian" value={formatRupiah(receipt.change_given)} />
            )}
            {sale.shipping > 0 && (
              <Line label="Ongkos kirim" value={formatRupiah(sale.shipping)} />
            )}
          </div>
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button
            variant="outline"
            render={
              <Link href={`/print/receipt/${receipt.transaction_id}`} target="_blank">
                <Printer className="size-4" /> Cetak
              </Link>
            }
          />
          <Button onClick={onClose}>Transaksi Baru</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
