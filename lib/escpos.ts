/**
 * Penyusun perintah ESC/POS untuk struk thermal 58mm (32 karakter/baris).
 * Menghasilkan Uint8Array byte mentah yang dikirim langsung ke printer
 * (via Web Bluetooth). Tidak bergantung pada DOM/browser API tertentu,
 * sehingga mudah diuji terpisah.
 */

import type { ReceiptInvoice } from "@/lib/invoice-actions";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatRupiah } from "@/lib/format";
import { formatTanggalWaktu } from "@/lib/date";

/** Lebar kolom untuk kertas 58mm dengan Font A (default). */
export const COLS_58 = 32;

// --- Perintah ESC/POS dasar ---
const ESC = 0x1b;
const GS = 0x1d;

/**
 * Buffer byte yang tumbuh dinamis; menampung perintah + teks lalu
 * dikeluarkan sebagai satu Uint8Array.
 */
class EscposBuilder {
  private chunks: number[] = [];

  raw(...bytes: number[]): this {
    for (const b of bytes) this.chunks.push(b & 0xff);
    return this;
  }

  /**
   * Tulis teks. Karakter non-ASCII (di luar 0x20–0x7e) diganti agar aman
   * pada code page default printer: mis. "×" → "x", "–" → "-", sisanya "?".
   */
  text(s: string): this {
    for (const ch of asciiFold(s)) this.chunks.push(ch.charCodeAt(0) & 0xff);
    return this;
  }

  line(s = ""): this {
    return this.text(s).raw(0x0a);
  }

  /** Inisialisasi printer (reset mode). */
  init(): this {
    return this.raw(ESC, 0x40);
  }

  /** Rataan: 0 kiri, 1 tengah, 2 kanan. */
  align(n: 0 | 1 | 2): this {
    return this.raw(ESC, 0x61, n);
  }

  bold(on: boolean): this {
    return this.raw(ESC, 0x45, on ? 1 : 0);
  }

  /** Ukuran: gandakan tinggi & lebar (GS ! n). double=lebih besar untuk judul. */
  size(double: boolean): this {
    return this.raw(GS, 0x21, double ? 0x11 : 0x00);
  }

  feed(n = 1): this {
    for (let i = 0; i < n; i++) this.chunks.push(0x0a);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.chunks);
  }
}

/** Ganti karakter non-ASCII yang umum agar tercetak rapi di printer thermal. */
function asciiFold(s: string): string {
  return s
    .replace(/[×✕]/g, "x")
    .replace(/[–—]/g, "-")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7e\n]/g, "?");
}

/** Baris garis putus-putus selebar kolom. */
function divider(cols = COLS_58): string {
  return "-".repeat(cols);
}

/**
 * Baris dua kolom: label di kiri, nilai rata kanan, dalam `cols` karakter.
 * Bila gabungan terlalu panjang, nilai dipaksa menempel di kanan pada baris
 * yang sama (label dipangkas seperlunya).
 */
function twoCol(left: string, right: string, cols = COLS_58): string {
  const l = asciiFold(left);
  const r = asciiFold(right);
  const space = cols - r.length;
  if (space <= 1) return `${l} ${r}`.slice(0, cols);
  const leftClipped = l.length > space - 1 ? l.slice(0, space - 1) : l;
  const pad = cols - leftClipped.length - r.length;
  return leftClipped + " ".repeat(Math.max(1, pad)) + r;
}

/** Pecah teks panjang menjadi beberapa baris <= cols (pemenggalan per kata). */
function wrap(text: string, cols = COLS_58): string[] {
  const words = asciiFold(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (w.length > cols) {
      if (cur) {
        lines.push(cur);
        cur = "";
      }
      for (let i = 0; i < w.length; i += cols) lines.push(w.slice(i, i + cols));
      continue;
    }
    if (!cur) cur = w;
    else if (cur.length + 1 + w.length <= cols) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/**
 * Susun byte ESC/POS untuk struk transaksi (58mm).
 * Layout dibuat menyerupai halaman cetak browser: identitas toko, meta,
 * rincian item, total, pembayaran, footer.
 */
export function buildReceiptEscpos(inv: ReceiptInvoice): Uint8Array {
  const b = new EscposBuilder();
  b.init().align(1);

  // Nama toko (bisa multi-baris via "\n" pada pengaturan).
  b.bold(true).size(true);
  for (const nameLine of inv.store.name.split(/\r?\n/)) {
    for (const l of wrap(nameLine, COLS_58 / 2 - 1)) b.line(l);
  }
  b.size(false).bold(false);

  if (inv.store.address) {
    for (const l of inv.store.address.split(/\r?\n/))
      for (const w of wrap(l)) b.line(w);
  }
  if (inv.store.phone) b.line(inv.store.phone);

  // Meta transaksi.
  b.align(0).line(divider());
  b.line(twoCol("No", inv.code));
  b.line(twoCol("Waktu", formatTanggalWaktu(inv.created_at)));
  b.line(twoCol("Kasir", inv.cashier_name));
  if (inv.customer_name) b.line(twoCol("Pelanggan", inv.customer_name));
  b.line(divider());

  // Item.
  for (const it of inv.items) {
    for (const l of wrap(it.name)) b.line(l);
    const qtyPrice = `${it.qty} x ${formatRupiah(it.unit_price)}${
      it.discount > 0 ? ` -${formatRupiah(it.discount)}` : ""
    }`;
    b.line(twoCol(qtyPrice, formatRupiah(it.line_total)));
  }
  b.line(divider());

  // Ringkasan nilai.
  b.line(twoCol("Subtotal", formatRupiah(inv.subtotal)));
  if (inv.discount_total > 0)
    b.line(twoCol("Diskon", `-${formatRupiah(inv.discount_total)}`));
  if (inv.tax_total > 0) b.line(twoCol("Pajak", formatRupiah(inv.tax_total)));
  if (inv.shipping_cost > 0)
    b.line(twoCol("Ongkos kirim", formatRupiah(inv.shipping_cost)));

  b.bold(true).line(twoCol("TOTAL", formatRupiah(inv.grand_total))).bold(false);
  b.line(divider());

  // Pembayaran.
  for (const p of inv.payments) {
    const label = `${PAYMENT_METHOD_LABELS[p.method]}${p.bank ? " " + p.bank : ""}`;
    b.line(twoCol(label, formatRupiah(p.cash_received ?? p.amount)));
    if (p.method === "cash" && p.change_given != null)
      b.line(twoCol("Kembalian", formatRupiah(p.change_given)));
    if (p.reference) b.line(twoCol("Ref", p.reference));
  }

  // Status lunas (untuk transaksi selesai).
  if (inv.status === "completed") {
    b.align(1).feed(1).bold(true).line("*** LUNAS ***").bold(false);
  } else {
    b.align(1).feed(1).bold(true).line(`*** ${inv.status.toUpperCase()} ***`).bold(false);
  }

  // Footer.
  if (inv.store.footer) {
    b.align(1).feed(1);
    for (const l of inv.store.footer.split(/\r?\n/))
      for (const w of wrap(l)) b.line(w);
  }

  b.feed(4);
  return b.build();
}

// Ekspor helper untuk pengujian unit.
export const _internals = { twoCol, wrap, divider, asciiFold };
