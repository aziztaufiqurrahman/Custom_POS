/**
 * Pemuatan font via next/font (self-hosted). Font default (Inter + Manrope)
 * di-preload; font pilihan tambahan TIDAK di-preload — browser hanya mengunduh
 * font yang benar-benar dipakai saat dirender. `variable` harus sama dengan
 * `cssVar` di lib/fonts.ts.
 */
import {
  Inter,
  Lato,
  Manrope,
  Montserrat,
  Nunito,
  Plus_Jakarta_Sans,
  Poppins,
  Work_Sans,
} from "next/font/google";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Font pilihan tambahan — tidak di-preload agar tidak membebani load awal.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  preload: false,
});
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});
const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});
const workSans = Work_Sans({
  variable: "--font-worksans",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

/** Gabungan className semua variable font untuk ditempel di <body>. */
export const fontVariables = [
  inter,
  manrope,
  poppins,
  jakarta,
  montserrat,
  nunito,
  lato,
  workSans,
]
  .map((f) => f.variable)
  .join(" ");
