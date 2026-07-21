"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";

import { getReceiptInvoice, getShiftInvoice } from "@/lib/invoice-actions";
import { downloadReceiptInvoicePng, downloadShiftInvoicePng } from "@/lib/png-invoice";
import { Button } from "@/components/ui/button";

type Props = {
  label?: string;
} & (
  | { kind: "receipt"; transactionId: string }
  | { kind: "shift"; sessionId: string }
);

/**
 * Tombol unduh invoice/struk sebagai PDF. Data diambil dari server (RLS)
 * lalu dirender menjadi PDF di browser (dynamic import jsPDF).
 */
export function DownloadInvoiceButton(props: Props) {
  const [loading, setLoading] = useState(false);

  async function handle() {
    setLoading(true);
    try {
      if (props.kind === "receipt") {
        const data = await getReceiptInvoice(props.transactionId);
        if (!data) {
          toast.error("Data invoice tidak ditemukan");
          return;
        }
        await downloadReceiptInvoicePng(data);
      } else {
        const data = await getShiftInvoice(props.sessionId);
        if (!data) {
          toast.error("Data shift tidak ditemukan");
          return;
        }
        await downloadShiftInvoicePng(data);
      }
      toast.success("Gambar (PNG) berhasil diunduh");
    } catch {
      toast.error("Gagal membuat PDF");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" onClick={handle} disabled={loading}>
      {loading ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      {props.label ?? "Unduh"}
    </Button>
  );
}
