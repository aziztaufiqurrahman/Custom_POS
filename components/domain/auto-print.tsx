"use client";

import { useEffect } from "react";

/** Memicu dialog cetak browser sekali saat halaman termuat. */
export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return null;
}
