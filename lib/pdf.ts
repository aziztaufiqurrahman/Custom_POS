import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatTanggalWaktu } from "@/lib/date";
import { formatNumber, formatRupiah } from "@/lib/format";
import type { ReceiptInvoice, ShiftInvoice } from "@/lib/invoice-actions";

// Ukuran halaman A4 (mm). Margin kiri/kanan 15mm.
const L = 15;
const R = 195;
const BOTTOM = 285;

const STATUS_LABEL: Record<ReceiptInvoice["status"], string> = {
  completed: "LUNAS",
  void: "VOID",
  refunded: "REFUND",
};

const EXPENSE_LABEL: Record<string, string> = {
  ongkir: "Ongkos kirim",
  operasional: "Operasional",
  bahan: "Bahan",
  lainnya: "Lainnya",
};

type Doc = import("jspdf").jsPDF;

function newDoc(): Promise<Doc> {
  return import("jspdf").then(({ jsPDF }) => new jsPDF({ unit: "mm", format: "a4" }));
}

function footerLines(doc: Doc, text: string) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  const lines = doc.splitTextToSize(text, R - L);
  doc.text(lines, (L + R) / 2, BOTTOM, { align: "center" });
  doc.setTextColor(0);
}

/** Unduh invoice transaksi sebagai PDF (A4, rinci untuk pengecekan). */
export async function downloadReceiptInvoicePdf(inv: ReceiptInvoice): Promise<void> {
  const doc = await newDoc();
  let y = 18;

  // Identitas toko (dukung nama multi-baris).
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  for (const line of inv.store.name.split("\n")) {
    doc.text(line.trim(), L, y);
    y += 6;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  if (inv.store.address) {
    for (const line of doc.splitTextToSize(inv.store.address, 110)) {
      doc.text(line, L, y);
      y += 4;
    }
  }
  if (inv.store.phone) {
    doc.text(`Telp: ${inv.store.phone}`, L, y);
    y += 4;
  }
  doc.setTextColor(0);

  // Header kanan.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("INVOICE", R, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`No: ${inv.code}`, R, 27, { align: "right" });
  doc.text(formatTanggalWaktu(inv.created_at), R, 32, { align: "right" });
  doc.text(`Status: ${STATUS_LABEL[inv.status]}`, R, 37, { align: "right" });

  y = Math.max(y, 42);
  doc.setDrawColor(200);
  doc.line(L, y, R, y);
  y += 6;

  // Kasir & pelanggan.
  doc.setFontSize(10);
  doc.text(`Kasir: ${inv.cashier_name}`, L, y);
  if (inv.customer_name) {
    doc.text(`Pelanggan: ${inv.customer_name}`, R, y, { align: "right" });
  }
  y += 8;

  // Header tabel.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Produk", L, y);
  doc.text("Qty", 120, y, { align: "right" });
  doc.text("Harga", 152, y, { align: "right" });
  doc.text("Jumlah", R, y, { align: "right" });
  y += 2;
  doc.setDrawColor(220);
  doc.line(L, y, R, y);
  y += 5;

  doc.setFont("helvetica", "normal");
  for (const it of inv.items) {
    if (y > BOTTOM - 40) {
      doc.addPage();
      y = 20;
    }
    const nameLines = doc.splitTextToSize(it.name, 95) as string[];
    doc.text(nameLines, L, y);
    doc.text(formatNumber(it.qty), 120, y, { align: "right" });
    doc.text(formatRupiah(it.unit_price), 152, y, { align: "right" });
    doc.text(formatRupiah(it.line_total), R, y, { align: "right" });
    y += 5 * nameLines.length;
    if (it.discount > 0) {
      doc.setFontSize(8);
      doc.setTextColor(130);
      doc.text(`Diskon -${formatRupiah(it.discount)}`, L, y);
      doc.setTextColor(0);
      doc.setFontSize(9);
      y += 4.5;
    }
    y += 1.5;
  }

  doc.setDrawColor(200);
  doc.line(L, y, R, y);
  y += 6;

  // Ringkasan total.
  const totalRow = (label: string, value: string, bold = false, big = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(big ? 12 : 10);
    doc.text(label, 130, y);
    doc.text(value, R, y, { align: "right" });
    y += big ? 8 : 5.5;
  };
  totalRow("Subtotal", formatRupiah(inv.subtotal));
  if (inv.discount_total > 0) totalRow("Diskon", `-${formatRupiah(inv.discount_total)}`);
  if (inv.tax_total > 0) totalRow("Pajak", formatRupiah(inv.tax_total));
  if (inv.shipping_cost > 0) totalRow("Ongkos kirim", formatRupiah(inv.shipping_cost));
  doc.setDrawColor(180);
  doc.line(130, y - 2, R, y - 2);
  totalRow("TOTAL", formatRupiah(inv.grand_total), true, true);

  y += 2;

  // Pembayaran.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Pembayaran", L, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const p of inv.payments) {
    const label = `${PAYMENT_METHOD_LABELS[p.method]}${p.bank ? " " + p.bank : ""}`;
    doc.text(label, L, y);
    doc.text(formatRupiah(p.cash_received ?? p.amount), R, y, { align: "right" });
    y += 5.5;
    if (p.method === "cash" && p.change_given != null) {
      doc.setTextColor(110);
      doc.text("Kembalian", L + 4, y);
      doc.text(formatRupiah(p.change_given), R, y, { align: "right" });
      doc.setTextColor(0);
      y += 5.5;
    }
    if (p.reference) {
      doc.setTextColor(110);
      doc.setFontSize(9);
      doc.text(`Ref: ${p.reference}`, L + 4, y);
      doc.setFontSize(10);
      doc.setTextColor(0);
      y += 5;
    }
  }

  if (inv.note) {
    y += 2;
    doc.setTextColor(110);
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(`Catatan: ${inv.note}`, R - L), L, y);
    doc.setTextColor(0);
  }

  footerLines(doc, inv.store.footer ?? "Terima kasih telah berbelanja!");
  doc.save(`Invoice-${inv.code}.pdf`);
}

function varianceText(v: number | null): string {
  const n = v ?? 0;
  if (n === 0) return "Sesuai";
  return n > 0 ? `Lebih ${formatRupiah(n)}` : `Kurang ${formatRupiah(-n)}`;
}

/** Unduh ringkasan shift sebagai PDF. */
export async function downloadShiftInvoicePdf(s: ShiftInvoice): Promise<void> {
  const doc = await newDoc();
  let y = 18;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  for (const line of s.store.name.split("\n")) {
    doc.text(line.trim(), L, y);
    y += 6;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("RINGKASAN SHIFT", R, 20, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Kasir: ${s.cashier_name}`, R, 27, { align: "right" });

  y = Math.max(y, 34);
  doc.setDrawColor(200);
  doc.line(L, y, R, y);
  y += 6;

  const row = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(10);
    doc.text(label, L, y);
    doc.text(value, R, y, { align: "right" });
    y += 6;
  };

  row("Dibuka", formatTanggalWaktu(s.opened_at));
  row("Ditutup", s.closed_at ? formatTanggalWaktu(s.closed_at) : "-");
  y += 2;

  doc.setFont("helvetica", "bold");
  doc.text("Rekonsiliasi Kas", L, y);
  y += 6;
  row("Uang awal", formatRupiah(s.opening_balance));
  row("Penjualan tunai", formatRupiah(s.cash));
  if (s.total_expenses > 0) row("Pengeluaran kas", `-${formatRupiah(s.total_expenses)}`);
  row("Kas seharusnya", formatRupiah(s.expected_cash ?? 0), true);
  row("Hitungan fisik", formatRupiah(s.counted_cash ?? 0));
  row("Selisih", varianceText(s.variance), true);
  y += 2;

  doc.setFont("helvetica", "bold");
  doc.text("Rincian Metode Bayar", L, y);
  y += 6;
  row("Tunai", formatRupiah(s.cash));
  row("QRIS", formatRupiah(s.qris));
  row("Transfer BNI", formatRupiah(s.transferByBank.BNI));
  row("Transfer BCA", formatRupiah(s.transferByBank.BCA));
  row("Transfer BSI", formatRupiah(s.transferByBank.BSI));
  row("GoFood", formatRupiah(s.gofood));
  row("ShopeeFood", formatRupiah(s.shopeefood));
  row(
    `Total (${s.count} transaksi)`,
    formatRupiah(s.cash + s.qris + s.transfer + s.gofood + s.shopeefood),
    true,
  );

  if (s.expenses.length > 0) {
    y += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Pengeluaran (kas keluar)", L, y);
    y += 6;
    for (const e of s.expenses) {
      if (y > BOTTOM - 10) {
        doc.addPage();
        y = 20;
      }
      const label = `${EXPENSE_LABEL[e.category] ?? e.category}${e.note ? " · " + e.note : ""}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(doc.splitTextToSize(label, 140) as string[], L, y);
      doc.text(formatRupiah(e.amount), R, y, { align: "right" });
      y += 6;
    }
    row("Total pengeluaran", formatRupiah(s.total_expenses), true);
  }

  const dateTag = (s.closed_at ?? s.opened_at).slice(0, 10);
  doc.save(`Shift-${s.cashier_name.replace(/\s+/g, "_")}-${dateTag}.pdf`);
}
