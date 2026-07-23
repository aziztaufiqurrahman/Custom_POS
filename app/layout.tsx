import type { Metadata } from "next";
import "./globals.css";

import { fontVariables } from "./fonts";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Pudingkuu Lucky — POS",
  description: "Aplikasi kasir: transaksi, stok, pembayaran, dan laporan penjualan.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className={`${fontVariables} antialiased`}>
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
