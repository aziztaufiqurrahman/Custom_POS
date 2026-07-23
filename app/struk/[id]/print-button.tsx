"use client";

import { Printer } from "lucide-react";

/** Tombol cetak/simpan PDF via dialog browser (untuk halaman struk publik). */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100 print:hidden"
    >
      <Printer className="size-4" /> Cetak / Simpan PDF
    </button>
  );
}
