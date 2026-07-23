"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Loader2, Printer, Bluetooth, Globe } from "lucide-react";

import { getReceiptInvoice } from "@/lib/invoice-actions";
import { buildReceiptEscpos } from "@/lib/escpos";
import {
  isBluetoothPrintingSupported,
  printEscpos,
  selectPrinter,
  forgetPrinter,
} from "@/lib/bluetooth-printer";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Tombol "Cetak" struk. Bila browser mendukung Web Bluetooth (Chrome/Edge),
 * struk langsung dikirim ke printer thermal 58mm tanpa dialog. Bila tidak,
 * otomatis membuka halaman cetak browser sebagai cadangan.
 */
export function PrintReceiptButton({
  transactionId,
  label = "Cetak",
}: {
  transactionId: string;
  label?: string;
}) {
  const [loading, setLoading] = useState(false);

  function openBrowserPrint() {
    window.open(`/print/receipt/${transactionId}`, "_blank");
  }

  /** Ambil data lalu susun byte ESC/POS. */
  async function buildBytes() {
    const data = await getReceiptInvoice(transactionId);
    if (!data) throw new Error("Data struk tidak ditemukan.");
    return buildReceiptEscpos(data);
  }

  async function printDirect(pickFirst = false) {
    if (!isBluetoothPrintingSupported()) {
      toast.info(
        "Browser ini tidak mendukung cetak Bluetooth langsung. Membuka mode cetak browser.",
      );
      openBrowserPrint();
      return;
    }
    setLoading(true);
    try {
      if (pickFirst) await selectPrinter();
      const bytes = await buildBytes();
      await printEscpos(bytes);
      toast.success("Struk terkirim ke printer");
    } catch (err) {
      // Pengguna menutup dialog pemilihan perangkat.
      if (err instanceof DOMException && err.name === "NotFoundError") {
        toast.info("Pemilihan printer dibatalkan.");
        return;
      }
      const msg = err instanceof Error ? err.message : "Gagal mencetak.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function changePrinter() {
    forgetPrinter();
    await printDirect(true);
  }

  return (
    <div className="flex">
      <Button
        variant="outline"
        onClick={() => printDirect(false)}
        disabled={loading}
        className="rounded-r-none border-r-0"
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Printer className="size-4" />
        )}
        {label}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              className="rounded-l-none px-1"
              disabled={loading}
            />
          }
        >
          <ChevronDown className="size-4" />
          <span className="sr-only">Opsi cetak</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => printDirect(false)}>
            <Bluetooth className="size-4" /> Cetak ke printer Bluetooth
          </DropdownMenuItem>
          <DropdownMenuItem onClick={changePrinter}>
            <Bluetooth className="size-4" /> Ganti / sambungkan printer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openBrowserPrint}>
            <Globe className="size-4" /> Cetak via browser
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
