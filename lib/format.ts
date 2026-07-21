/**
 * Util format mata uang Rupiah.
 * Uang diperlakukan sebagai number rupiah penuh (tanpa sen / desimal).
 */

/** Format angka biasa dengan pemisah ribuan lokal Indonesia, mis. "1.234.567". */
export function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat("id-ID").format(Number(value ?? 0));
}

/**
 * Format angka menjadi "Rp1.234.567".
 * Dibangun dari pemisah ribuan + prefix "Rp" agar output konsisten lintas
 * lingkungan (simbol mata uang IDR pada Intl bisa menyisipkan spasi).
 */
export function formatRupiah(value: number | null | undefined): string {
  return `Rp ${formatNumber(Math.round(Number(value ?? 0)))}`;
}

/**
 * Parse input teks rupiah (mis. "Rp1.234.567" atau "1.234.567") menjadi number.
 * Mengabaikan semua karakter non-digit.
 */
export function parseRupiah(input: string): number {
  const digits = input.replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}
