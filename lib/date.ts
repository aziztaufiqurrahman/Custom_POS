import { format } from "date-fns";
import { id } from "date-fns/locale";

/** Tanggal lokal Indonesia, mis. "28 Juni 2026". */
export function formatTanggal(value: string | number | Date): string {
  return format(new Date(value), "d MMMM yyyy", { locale: id });
}

/** Tanggal + jam, mis. "28 Juni 2026, 14:30". */
export function formatTanggalWaktu(value: string | number | Date): string {
  return format(new Date(value), "d MMMM yyyy, HH:mm", { locale: id });
}

/** Format ringkas untuk tabel, mis. "28/06/2026 14:30". */
export function formatTanggalRingkas(value: string | number | Date): string {
  return format(new Date(value), "dd/MM/yyyy HH:mm", { locale: id });
}
