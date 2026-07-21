import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatTanggalWaktu } from "@/lib/date";
import { formatNumber, formatRupiah } from "@/lib/format";
import type { ReceiptInvoice, ShiftInvoice } from "@/lib/invoice-actions";

// Render invoice/struk sebagai gambar PNG rapi & modern lewat Canvas 2D.
// Tanpa dependency eksternal, teks tajam (skala retina), watermark tipis.

const W = 720; // lebar logis (px)
const M = 48; // margin
const S = 2; // skala retina
const valR = W - M - 10; // tepi kanan bersama untuk semua nilai/angka (rata)

const COL = {
  ink: "#2f241c",
  brown: "#9c6a44",
  muted: "#8a7a6c",
  faint: "#b7a998",
  line: "#e7dcc8",
  head: "#f5efe4",
  green: "#2e7d32",
  danger: "#c0392b",
  white: "#ffffff",
};

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
const SOURCE_LABEL: Record<string, string> = {
  cash: "Tunai",
  BNI: "BNI",
  BCA: "BCA",
  BSI: "BSI",
};

type Ctx = CanvasRenderingContext2D;

function font(ctx: Ctx, weight: number, size: number) {
  ctx.font = `${weight} ${size}px Arial, Helvetica, sans-serif`;
}

function wrap(ctx: Ctx, text: string, maxW: number): string[] {
  const words = String(text).split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

function watermark(ctx: Ctx, h: number) {
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = COL.brown;
  font(ctx, 700, 30);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.translate(W / 2, h / 2);
  ctx.rotate((-28 * Math.PI) / 180);
  for (let yy = -h; yy < h; yy += 150) {
    for (let xx = -W - 120; xx < W; xx += 360) {
      ctx.fillText("Pudingkuu Lucky", xx, yy);
    }
  }
  ctx.restore();
}

async function exportPng(render: (ctx: Ctx) => number, filename: string) {
  // Pass 1: ukur tinggi.
  const measure = document.createElement("canvas");
  const mctx = measure.getContext("2d");
  if (!mctx) throw new Error("Canvas tidak didukung");
  const h = Math.ceil(render(mctx));

  // Pass 2: gambar sebenarnya (retina).
  const canvas = document.createElement("canvas");
  canvas.width = W * S;
  canvas.height = h * S;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung");
  ctx.scale(S, S);
  ctx.fillStyle = COL.white;
  ctx.fillRect(0, 0, W, h);
  watermark(ctx, h);
  render(ctx);

  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("Gagal membuat PNG");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Unduh invoice transaksi sebagai PNG. */
export async function downloadReceiptInvoicePng(inv: ReceiptInvoice): Promise<void> {
  const isPaid = inv.status === "completed";
  await exportPng((ctx) => {
    const drawing = ctx.canvas.width > 10; // pass 2 sudah di-scale & di-size
    ctx.textBaseline = "alphabetic";

    // Aksen atas.
    ctx.fillStyle = COL.brown;
    ctx.fillRect(0, 0, W, 6);

    // Header kiri: identitas toko.
    let y = 52;
    ctx.textAlign = "left";
    ctx.fillStyle = COL.ink;
    for (const raw of inv.store.name.split("\n")) {
      font(ctx, 800, 22);
      ctx.fillText(raw.trim(), M, y);
      y += 27;
    }
    ctx.fillStyle = COL.muted;
    font(ctx, 400, 12);
    if (inv.store.address) {
      for (const l of wrap(ctx, inv.store.address, 330)) {
        ctx.fillText(l, M, y);
        y += 17;
      }
    }
    if (inv.store.phone) {
      ctx.fillText(`Telp: ${inv.store.phone}`, M, y);
      y += 17;
    }
    const leftBottom = y;

    // Header kanan.
    ctx.textAlign = "right";
    ctx.fillStyle = COL.ink;
    font(ctx, 800, 30);
    ctx.fillText("INVOICE", valR, 56);
    ctx.fillStyle = COL.muted;
    font(ctx, 400, 12);
    ctx.fillText(`No: ${inv.code}`, valR, 78);
    ctx.fillText(formatTanggalWaktu(inv.created_at), valR, 96);
    ctx.fillText(`Status: ${STATUS_LABEL[inv.status]}`, valR, 114);
    const rightBottom = 120;

    y = Math.max(leftBottom, rightBottom) + 14;
    ctx.strokeStyle = COL.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(W - M, y);
    ctx.stroke();
    y += 24;

    // Kasir & pelanggan.
    ctx.textAlign = "left";
    ctx.fillStyle = COL.ink;
    font(ctx, 400, 13);
    ctx.fillText(`Kasir: ${inv.cashier_name}`, M, y);
    if (inv.customer_name) {
      ctx.textAlign = "right";
      ctx.fillText(`Pelanggan: ${inv.customer_name}`, valR, y);
    }
    y += 22;

    // Kolom tabel.
    const cJumlah = W - M;
    const cHarga = cJumlah - 120;
    const cQty = cHarga - 90;
    const nameMaxW = cQty - M - 60;

    // Header tabel.
    ctx.fillStyle = COL.head;
    if (drawing) ctx.fillRect(M, y, W - 2 * M, 28);
    y += 19;
    ctx.fillStyle = COL.ink;
    font(ctx, 700, 12);
    ctx.textAlign = "left";
    ctx.fillText("Produk", M + 10, y);
    ctx.textAlign = "right";
    ctx.fillText("Qty", cQty, y);
    ctx.fillText("Harga", cHarga, y);
    ctx.fillText("Jumlah", cJumlah - 10, y);
    y += 18;

    // Baris item.
    font(ctx, 400, 13);
    for (const it of inv.items) {
      ctx.fillStyle = COL.ink;
      const nameLines = wrap(ctx, it.name, nameMaxW);
      const top = y;
      ctx.textAlign = "left";
      let ny = y + 4;
      for (const l of nameLines) {
        ctx.fillText(l, M + 10, ny);
        ny += 17;
      }
      ctx.textAlign = "right";
      ctx.fillText(formatNumber(it.qty), cQty, y + 4);
      ctx.fillText(formatRupiah(it.unit_price), cHarga, y + 4);
      ctx.fillText(formatRupiah(it.line_total), cJumlah - 10, y + 4);
      let rowH = Math.max(nameLines.length * 17, 17) + 8;
      if (it.discount > 0) {
        ctx.textAlign = "left";
        ctx.fillStyle = COL.muted;
        font(ctx, 400, 11);
        ctx.fillText(`Diskon -${formatRupiah(it.discount)}`, M + 10, top + nameLines.length * 17 + 6);
        font(ctx, 400, 13);
        rowH += 14;
      }
      y = top + rowH;
      ctx.strokeStyle = COL.line;
      ctx.beginPath();
      ctx.moveTo(M, y);
      ctx.lineTo(W - M, y);
      ctx.stroke();
      y += 8;
    }

    y += 12;

    // Ringkasan total: dua kolom rata-kanan (label & nilai) dengan lebar nilai
    // dihitung dinamis agar TIDAK pernah bertabrakan berapa pun nominalnya.
    const valX = valR;
    const subRows: [string, string][] = [["Subtotal", formatRupiah(inv.subtotal)]];
    if (inv.discount_total > 0) subRows.push(["Diskon", `-${formatRupiah(inv.discount_total)}`]);
    if (inv.tax_total > 0) subRows.push(["Pajak", formatRupiah(inv.tax_total)]);
    if (inv.shipping_cost > 0) subRows.push(["Ongkos kirim", formatRupiah(inv.shipping_cost)]);
    const grandStr = formatRupiah(inv.grand_total);

    // Lebar maksimum kolom nilai (termasuk TOTAL besar) → tentukan posisi label.
    let maxValW = 0;
    font(ctx, 400, 13);
    for (const [, v] of subRows) maxValW = Math.max(maxValW, ctx.measureText(v).width);
    font(ctx, 800, 20);
    maxValW = Math.max(maxValW, ctx.measureText(grandStr).width);
    const gap = 32;
    const labelRightX = valX - maxValW - gap;

    const totalRow = (label: string, value: string, big = false) => {
      font(ctx, big ? 800 : 400, big ? 20 : 13);
      ctx.fillStyle = COL.ink;
      ctx.textAlign = "right";
      ctx.fillText(label, labelRightX, y);
      ctx.fillText(value, valX, y);
      y += big ? 34 : 24;
    };
    for (const [l, v] of subRows) totalRow(l, v);

    // Garis pemisah sebelum TOTAL (beri jarak cukup agar tidak menyentuh teks).
    y += 8;
    ctx.strokeStyle = COL.brown;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(labelRightX - 110, y);
    ctx.lineTo(valX, y);
    ctx.stroke();
    y += 30;
    totalRow("TOTAL", grandStr, true);

    // Badge status (Lunas) di bawah nominal.
    const bw = 96;
    const bh = 30;
    const bx = valX - bw;
    ctx.fillStyle = isPaid ? COL.green : COL.danger;
    if (drawing) {
      ctx.beginPath();
      ctx.roundRect(bx, y, bw, bh, 8);
      ctx.fill();
    }
    ctx.fillStyle = COL.white;
    font(ctx, 800, 14);
    ctx.textAlign = "center";
    ctx.fillText(STATUS_LABEL[inv.status] === "LUNAS" ? "LUNAS" : STATUS_LABEL[inv.status], bx + bw / 2, y + 20);
    y += bh + 22;

    // Pembayaran.
    ctx.fillStyle = COL.ink;
    ctx.textAlign = "left";
    font(ctx, 700, 13);
    ctx.fillText("Pembayaran", M, y);
    y += 22;
    font(ctx, 400, 13);
    for (const p of inv.payments) {
      const label = `${PAYMENT_METHOD_LABELS[p.method]}${p.bank ? " " + p.bank : ""}`;
      ctx.fillStyle = COL.ink;
      ctx.textAlign = "left";
      ctx.fillText(label, M, y);
      ctx.textAlign = "right";
      ctx.fillText(formatRupiah(p.cash_received ?? p.amount), valR, y);
      y += 20;
      if (p.method === "cash" && p.change_given != null) {
        ctx.fillStyle = COL.muted;
        ctx.textAlign = "left";
        ctx.fillText("Kembalian", M + 14, y);
        ctx.textAlign = "right";
        ctx.fillText(formatRupiah(p.change_given), valR, y);
        y += 20;
      }
      if (p.reference) {
        ctx.fillStyle = COL.muted;
        ctx.textAlign = "left";
        font(ctx, 400, 11);
        ctx.fillText(`Ref: ${p.reference}`, M + 14, y);
        font(ctx, 400, 13);
        y += 18;
      }
    }

    if (inv.note) {
      y += 4;
      ctx.fillStyle = COL.muted;
      ctx.textAlign = "left";
      font(ctx, 400, 11);
      for (const l of wrap(ctx, `Catatan: ${inv.note}`, W - 2 * M)) {
        ctx.fillText(l, M, y);
        y += 16;
      }
    }

    // Footer.
    y += 18;
    ctx.strokeStyle = COL.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(W - M, y);
    ctx.stroke();
    y += 22;
    ctx.fillStyle = COL.muted;
    ctx.textAlign = "center";
    font(ctx, 400, 12);
    const footer = inv.store.footer ?? "Terima kasih telah berbelanja!";
    for (const l of footer.split("\n")) {
      ctx.fillText(l.trim(), W / 2, y);
      y += 17;
    }
    y += 18;
    return y;
  }, `Invoice-${inv.code}.png`);
}

function varianceText(v: number | null): string {
  const n = v ?? 0;
  if (n === 0) return "Sesuai";
  return n > 0 ? `Lebih ${formatRupiah(n)}` : `Kurang ${formatRupiah(-n)}`;
}

/** Unduh ringkasan shift sebagai PNG. */
export async function downloadShiftInvoicePng(s: ShiftInvoice): Promise<void> {
  await exportPng((ctx) => {
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = COL.brown;
    ctx.fillRect(0, 0, W, 6);

    let y = 52;
    ctx.textAlign = "left";
    ctx.fillStyle = COL.ink;
    for (const raw of s.store.name.split("\n")) {
      font(ctx, 800, 22);
      ctx.fillText(raw.trim(), M, y);
      y += 27;
    }
    ctx.textAlign = "right";
    font(ctx, 800, 24);
    ctx.fillText("RINGKASAN SHIFT", W - M, 56);
    ctx.fillStyle = COL.muted;
    font(ctx, 400, 12);
    ctx.fillText(`Kasir: ${s.cashier_name}`, W - M, 78);
    const leftBottom = y;

    y = Math.max(leftBottom, 96) + 8;
    ctx.strokeStyle = COL.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(W - M, y);
    ctx.stroke();
    y += 22;

    const row = (label: string, value: string, bold = false) => {
      font(ctx, bold ? 700 : 400, 13);
      ctx.fillStyle = COL.ink;
      ctx.textAlign = "left";
      ctx.fillText(label, M, y);
      ctx.textAlign = "right";
      ctx.fillText(value, W - M, y);
      y += 22;
    };
    const heading = (t: string) => {
      ctx.fillStyle = COL.brown;
      ctx.textAlign = "left";
      font(ctx, 700, 14);
      ctx.fillText(t, M, y);
      y += 22;
    };

    row("Dibuka", formatTanggalWaktu(s.opened_at));
    row("Ditutup", s.closed_at ? formatTanggalWaktu(s.closed_at) : "-");
    y += 6;

    heading("Rekonsiliasi Kas (Tunai)");
    row("Uang awal", formatRupiah(s.opening_balance));
    row("Penjualan tunai", formatRupiah(s.cash));
    if (s.expensesBySource.cash > 0)
      row("Pengeluaran tunai", `-${formatRupiah(s.expensesBySource.cash)}`);
    row("Kas seharusnya", formatRupiah(s.expected_cash ?? 0), true);
    row("Hitungan fisik", formatRupiah(s.counted_cash ?? 0));
    row("Selisih", varianceText(s.variance), true);
    y += 6;

    heading("Arus Masuk vs Keluar per Kanal");
    const chan: { label: string; in: number; out: number }[] = [
      { label: "Tunai", in: s.cash, out: s.expensesBySource.cash },
      { label: "BNI", in: s.transferByBank.BNI, out: s.expensesBySource.BNI },
      { label: "BCA", in: s.transferByBank.BCA, out: s.expensesBySource.BCA },
      { label: "BSI", in: s.transferByBank.BSI, out: s.expensesBySource.BSI },
    ];
    font(ctx, 700, 11);
    ctx.fillStyle = COL.muted;
    ctx.textAlign = "left";
    ctx.fillText("Kanal", M, y);
    ctx.textAlign = "right";
    ctx.fillText("Masuk", M + 300, y);
    ctx.fillText("Keluar", M + 440, y);
    ctx.fillText("Net", W - M, y);
    y += 18;
    font(ctx, 400, 13);
    for (const c of chan) {
      ctx.fillStyle = COL.ink;
      ctx.textAlign = "left";
      ctx.fillText(c.label, M, y);
      ctx.textAlign = "right";
      ctx.fillText(formatRupiah(c.in), M + 300, y);
      ctx.fillText(c.out > 0 ? `-${formatRupiah(c.out)}` : formatRupiah(0), M + 440, y);
      font(ctx, 700, 13);
      ctx.fillText(formatRupiah(c.in - c.out), W - M, y);
      font(ctx, 400, 13);
      y += 20;
    }
    y += 6;

    heading("Rincian Metode Bayar");
    row("QRIS", formatRupiah(s.qris));
    row("GoFood", formatRupiah(s.gofood));
    row("ShopeeFood", formatRupiah(s.shopeefood));
    row(
      `Total (${s.count} transaksi)`,
      formatRupiah(s.cash + s.qris + s.transfer + s.gofood + s.shopeefood),
      true,
    );

    if (s.expenses.length > 0) {
      y += 6;
      heading("Pengeluaran (Kas Keluar)");
      font(ctx, 400, 12);
      for (const e of s.expenses) {
        ctx.fillStyle = COL.ink;
        ctx.textAlign = "left";
        const label = `${EXPENSE_LABEL[e.category] ?? e.category} (${SOURCE_LABEL[e.source] ?? e.source})${e.note ? " · " + e.note : ""}`;
        const l = wrap(ctx, label, W - 2 * M - 120)[0];
        ctx.fillText(l, M, y);
        ctx.textAlign = "right";
        ctx.fillText(formatRupiah(e.amount), W - M, y);
        y += 19;
      }
      row("Total pengeluaran", formatRupiah(s.total_expenses), true);
    }

    y += 18;
    ctx.strokeStyle = COL.line;
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(W - M, y);
    ctx.stroke();
    y += 22;
    ctx.fillStyle = COL.muted;
    ctx.textAlign = "center";
    font(ctx, 400, 12);
    ctx.fillText("Pudingkuu Lucky · Pudingna Urang Bandung", W / 2, y);
    y += 22;
    return y;
  }, `Shift-${s.cashier_name.replace(/\s+/g, "_")}-${(s.closed_at ?? s.opened_at).slice(0, 10)}.png`);
}
