/**
 * Util WhatsApp "click-to-chat" (wa.me).
 * Tidak mengirim otomatis; menyiapkan URL yang membuka chat ke nomor tujuan
 * dengan pesan siap kirim. Cocok untuk pengiriman invoice semi-otomatis.
 */

/**
 * Normalisasi nomor Indonesia ke format internasional tanpa tanda "+",
 * mis. "0812-3456-7890" atau "+62 812..." -> "62812...".
 * Mengembalikan null bila jelas bukan nomor valid.
 */
export function normalizeWaNumber(input: string): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return null;

  let n = digits;
  if (n.startsWith("0")) n = "62" + n.slice(1);
  else if (n.startsWith("62")) {
    // sudah format internasional
  } else if (n.startsWith("8")) n = "62" + n; // ditulis tanpa 0 di depan

  // Nomor Indonesia yang wajar: 62 + 8–13 digit.
  if (n.length < 10 || n.length > 15) return null;
  return n;
}

/** Apakah teks nomor bisa dipakai untuk kirim WhatsApp. */
export function isValidWaNumber(input: string): boolean {
  return normalizeWaNumber(input) !== null;
}

/** Susun URL wa.me dengan pesan ter-encode. */
export function waMeUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** Nama paket aplikasi WhatsApp di Android. */
const WA_BUSINESS_PACKAGE = "com.whatsapp.w4b";

/**
 * Android intent URL yang MEMAKSA membuka WhatsApp Business (bukan personal).
 * Bila Business belum terpasang, browser jatuh ke `browser_fallback_url`
 * (wa.me) sehingga pesan tetap bisa dikirim.
 * Hanya berlaku di Android (Chrome/Edge).
 */
export function waBusinessIntentUrl(number: string, text: string): string {
  const encodedText = encodeURIComponent(text);
  const fallback = encodeURIComponent(waMeUrl(number, text));
  return (
    `intent://send?phone=${number}&text=${encodedText}` +
    `#Intent;scheme=whatsapp;package=${WA_BUSINESS_PACKAGE};` +
    `S.browser_fallback_url=${fallback};end`
  );
}

/** Deteksi perangkat Android (untuk memilih intent WhatsApp Business). */
export function isAndroid(): boolean {
  return (
    typeof navigator !== "undefined" && /android/i.test(navigator.userAgent)
  );
}

/**
 * URL kirim WhatsApp terbaik untuk perangkat saat ini:
 * di Android -> paksa WhatsApp Business; selain itu -> wa.me biasa.
 */
export function waSendUrl(number: string, text: string): string {
  return isAndroid()
    ? waBusinessIntentUrl(number, text)
    : waMeUrl(number, text);
}

/** Susun pesan invoice yang rapi & profesional untuk dikirim ke konsumen. */
export function buildInvoiceWaMessage(opts: {
  storeName: string;
  code: string;
  total: string; // sudah diformat (mis. "Rp 9.000")
  url: string;
  customerName?: string | null;
}): string {
  const store = opts.storeName.replace(/\s*\r?\n\s*/g, " ").trim();
  const name = opts.customerName?.trim();
  const greet = name ? `Halo ${name},` : "Halo,";
  return [
    `${greet} terima kasih telah berbelanja di ${store}.`,
    "",
    "Berikut struk pembelian Anda:",
    `No: ${opts.code}`,
    `Total: ${opts.total}`,
    "Status: LUNAS",
    "",
    "Lihat invoice lengkap di sini:",
    opts.url,
  ].join("\n");
}
