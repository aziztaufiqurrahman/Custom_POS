/**
 * Daftar font profesional yang bisa dipilih admin untuk seluruh aplikasi.
 * Modul murni (tanpa next/font) agar aman dipakai di server & klien. Font
 * sebenarnya dimuat di `app/fonts.ts`; di sini hanya pemetaan key -> CSS var.
 * `cssVar` HARUS sama persis dengan yang didaftarkan di app/fonts.ts.
 */

export const DEFAULT_FONT = "default";

export type FontOption = {
  key: string;
  name: string;
  /** Contoh kesan font untuk membantu admin memilih. */
  vibe: string;
  /** Nama CSS variable dari next/font. Kosong untuk 'default'. */
  cssVar?: string;
};

export const FONT_OPTIONS: FontOption[] = [
  { key: "default", name: "Default (Inter + Manrope)", vibe: "Bawaan, bersih" },
  { key: "inter", name: "Inter", vibe: "Netral & modern", cssVar: "--font-inter" },
  { key: "manrope", name: "Manrope", vibe: "Geometris rapi", cssVar: "--font-manrope" },
  { key: "poppins", name: "Poppins", vibe: "Bulat & ramah", cssVar: "--font-poppins" },
  { key: "jakarta", name: "Plus Jakarta Sans", vibe: "Profesional lokal", cssVar: "--font-jakarta" },
  { key: "montserrat", name: "Montserrat", vibe: "Tegas & elegan", cssVar: "--font-montserrat" },
  { key: "nunito", name: "Nunito", vibe: "Lembut & hangat", cssVar: "--font-nunito" },
  { key: "lato", name: "Lato", vibe: "Klasik & serius", cssVar: "--font-lato" },
  { key: "worksans", name: "Work Sans", vibe: "Minimalis kerja", cssVar: "--font-worksans" },
];

/**
 * Font-family stack untuk sebuah key. Mengembalikan null untuk 'default'
 * (biarkan token bawaan globals.css yang berlaku).
 */
export function fontFamily(key: string | null | undefined): string | null {
  const f = FONT_OPTIONS.find((o) => o.key === key);
  if (!f || !f.cssVar) return null;
  return `var(${f.cssVar}), ui-sans-serif, system-ui, sans-serif`;
}
