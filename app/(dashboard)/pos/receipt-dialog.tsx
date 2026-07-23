"use client";

import { toast } from "sonner";
import { CheckCircle2, MessageCircle } from "lucide-react";

import type { CompletedSale } from "./types";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatRupiah } from "@/lib/format";
import { formatTanggalWaktu } from "@/lib/date";
import {
  buildInvoiceWaMessage,
  normalizeWaNumber,
  waMeUrl,
} from "@/lib/wa";
import { DownloadInvoiceButton } from "@/components/domain/download-invoice-button";
import { PrintReceiptButton } from "@/components/domain/print-receipt-button";
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
  const grandWithShipping = totals.grandTotal + sale.shipping;
  const hasPhone = sale.customerPhone.trim().length > 0;

  function sendWhatsApp() {
    const num = normalizeWaNumber(sale.customerPhone);
    if (!num) {
      toast.error("Nomor WhatsApp tidak valid. Periksa kembali nomornya.");
      return;
    }
    const url = `${window.location.origin}/struk/${receipt.transaction_id}`;
    const msg = buildInvoiceWaMessage({
      storeName,
      code: receipt.code,
      total: formatRupiah(grandWithShipping),
      url,
      customerName: sale.customerName,
    });
    window.open(waMeUrl(num, msg), "_blank");
  }

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
            <p className="whitespace-pre-line font-semibold">{storeName}</p>
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
            {sale.shipping > 0 && (
              <Line label="Ongkos kirim" value={formatRupiah(sale.shipping)} />
            )}
            <div className="flex justify-between border-t pt-1 font-bold">
              <span>Total</span>
              <span>{formatRupiah(grandWithShipping)}</span>
            </div>
            <Line
              label={`Bayar (${PAYMENT_METHOD_LABELS[payment.method]}${payment.bank ? " " + payment.bank : ""})`}
              value={formatRupiah(payment.cashReceived ?? grandWithShipping)}
            />
            {payment.method === "cash" && (
              <Line label="Kembalian" value={formatRupiah(receipt.change_given)} />
            )}
          </div>
        </div>

        {hasPhone && (
          <Button
            onClick={sendWhatsApp}
            className="w-full bg-[#25D366] text-white hover:bg-[#1ebe5b]"
          >
            <MessageCircle className="size-4" /> Kirim invoice ke WhatsApp
          </Button>
        )}

        <DialogFooter className="flex-row justify-between sm:justify-between">
          <div className="flex flex-wrap gap-2">
            <PrintReceiptButton transactionId={receipt.transaction_id} />
            <DownloadInvoiceButton
              kind="receipt"
              transactionId={receipt.transaction_id}
            />
          </div>
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
