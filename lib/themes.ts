/**
 * Sistem tema POS. Admin memilih salah satu template + (opsional) warna utama
 * kustom + kelengkungan sudut. Nilai diterjemahkan menjadi CSS custom
 * properties yang menimpa token desain di globals.css — TANPA mengubah satu
 * pun komponen/logika, hanya tampilannya.
 *
 * Modul murni (aman dipakai di server maupun klien).
 */

import { fontFamily } from "@/lib/fonts";

export type ThemeSpec = {
  key: string;
  name: string;
  description: string;
  dark: boolean;
  bg: string;
  fg: string;
  surface: string;
  primary: string;
  soft: string; // secondary/muted/accent background
  softFg: string;
  border: string;
  destructive: string;
  sidebar: string;
  sidebarFg: string;
  sidebarActive: string;
  sidebarActiveFg: string;
  sidebarPrimary: string;
  charts: [string, string, string, string, string];
};

/** Daftar template siap pakai (Gen Z friendly). Urutan = urutan tampil. */
export const PRESETS: ThemeSpec[] = [
  {
    key: "classic",
    name: "Krem Cokelat",
    description: "Hangat & klasik (bawaan)",
    dark: false,
    bg: "#f7f1e6", fg: "#3a2c1d", surface: "#fffdf8",
    primary: "#9c6a44", soft: "#efe3d2", softFg: "#6b4f36",
    border: "#e7dcc9", destructive: "#b3261e",
    sidebar: "#3a2b20", sidebarFg: "#d8c7b3", sidebarActive: "#4c3a2b",
    sidebarActiveFg: "#ffffff", sidebarPrimary: "#c98a5a",
    charts: ["#9c6a44", "#7a9b5e", "#d99a55", "#b5835a", "#c2704a"],
  },
  {
    key: "peachy",
    name: "Pink Peachy",
    description: "Manis & playful",
    dark: false,
    bg: "#fff5f7", fg: "#4a2c39", surface: "#fffafb",
    primary: "#ec4f7c", soft: "#ffe1e9", softFg: "#a15070",
    border: "#ffd6e0", destructive: "#d1345b",
    sidebar: "#3d1f2c", sidebarFg: "#f3c9d6", sidebarActive: "#542c3d",
    sidebarActiveFg: "#ffffff", sidebarPrimary: "#ff7aa2",
    charts: ["#ec4f7c", "#f7a072", "#ffd166", "#8ac6d1", "#b57edc"],
  },
  {
    key: "ocean",
    name: "Ocean Fresh",
    description: "Sejuk & bersih",
    dark: false,
    bg: "#eef7fb", fg: "#10323f", surface: "#f8fdff",
    primary: "#0e9aa8", soft: "#d5eef1", softFg: "#266b74",
    border: "#c7e6ea", destructive: "#c0392b",
    sidebar: "#0d2b33", sidebarFg: "#b7dbe0", sidebarActive: "#12414b",
    sidebarActiveFg: "#ffffff", sidebarPrimary: "#2bc3cf",
    charts: ["#0e9aa8", "#3ec6c0", "#7bd389", "#f6c453", "#5aa9e6"],
  },
  {
    key: "grape",
    name: "Ungu Grape",
    description: "Modern & bold",
    dark: false,
    bg: "#f6f2fd", fg: "#2f2545", surface: "#fdfcff",
    primary: "#7c3aed", soft: "#e9e0fb", softFg: "#5b3ea0",
    border: "#ded2f6", destructive: "#d1345b",
    sidebar: "#241a3d", sidebarFg: "#cabce9", sidebarActive: "#362a56",
    sidebarActiveFg: "#ffffff", sidebarPrimary: "#a374f9",
    charts: ["#7c3aed", "#a78bfa", "#f472b6", "#38bdf8", "#facc15"],
  },
  {
    key: "matcha",
    name: "Matcha",
    description: "Segar & natural",
    dark: false,
    bg: "#f2f8ee", fg: "#223020", surface: "#fbfef8",
    primary: "#5a9e3f", soft: "#dfeed3", softFg: "#46703a",
    border: "#d3e6c4", destructive: "#b3261e",
    sidebar: "#22331c", sidebarFg: "#c8dab8", sidebarActive: "#33482a",
    sidebarActiveFg: "#ffffff", sidebarPrimary: "#82c05e",
    charts: ["#5a9e3f", "#9ccb6a", "#e2b04a", "#57a08a", "#c27b4a"],
  },
  {
    key: "sunset",
    name: "Sunset",
    description: "Ceria & hangat",
    dark: false,
    bg: "#fff4ec", fg: "#43281c", surface: "#fffbf7",
    primary: "#f5772f", soft: "#ffe1cf", softFg: "#a85a2e",
    border: "#ffd6bf", destructive: "#c0392b",
    sidebar: "#3a2016", sidebarFg: "#f0cbb2", sidebarActive: "#522e1f",
    sidebarActiveFg: "#ffffff", sidebarPrimary: "#ff9a5a",
    charts: ["#f5772f", "#ffb257", "#ffd166", "#ef6f6c", "#8ac6d1"],
  },
  {
    key: "midnight",
    name: "Midnight Neon",
    description: "Gelap & futuristik",
    dark: true,
    bg: "#0f1420", fg: "#e6ecf5", surface: "#171d2b",
    primary: "#7c83ff", soft: "#212a3d", softFg: "#aab6cf",
    border: "#263149", destructive: "#ff5470",
    sidebar: "#0b0f1a", sidebarFg: "#aab6cf", sidebarActive: "#1b2436",
    sidebarActiveFg: "#ffffff", sidebarPrimary: "#7c83ff",
    charts: ["#7c83ff", "#22d3ee", "#f472b6", "#4ade80", "#facc15"],
  },
  {
    key: "galaxy",
    name: "Galaxy",
    description: "Gelap ungu misterius",
    dark: true,
    bg: "#14101f", fg: "#ece7f5", surface: "#1e1830",
    primary: "#a970ff", soft: "#2a2140", softFg: "#c3b4e0",
    border: "#342a4d", destructive: "#ff5470",
    sidebar: "#100b1a", sidebarFg: "#c3b4e0", sidebarActive: "#241a38",
    sidebarActiveFg: "#ffffff", sidebarPrimary: "#a970ff",
    charts: ["#a970ff", "#f472b6", "#22d3ee", "#4ade80", "#facc15"],
  },
  {
    key: "mint-noir",
    name: "Mint Noir",
    description: "Gelap dengan aksen mint",
    dark: true,
    bg: "#0e1512", fg: "#e4f0ea", surface: "#16201b",
    primary: "#2ee6a6", soft: "#1e2b25", softFg: "#9fc4b5",
    border: "#26362e", destructive: "#ff5470",
    sidebar: "#0a110d", sidebarFg: "#9fc4b5", sidebarActive: "#17231c",
    sidebarActiveFg: "#ffffff", sidebarPrimary: "#2ee6a6",
    charts: ["#2ee6a6", "#38bdf8", "#f472b6", "#facc15", "#a78bfa"],
  },
];

export type RadiusKey = "sharp" | "md" | "round";

export const RADIUS_OPTIONS: { key: RadiusKey; label: string }[] = [
  { key: "sharp", label: "Tajam" },
  { key: "md", label: "Normal" },
  { key: "round", label: "Membulat" },
];

const RADIUS_VALUE: Record<RadiusKey, string> = {
  sharp: "0.2rem",
  md: "0.625rem",
  round: "1.1rem",
};

export const DEFAULT_PRESET = "classic";
export const DEFAULT_RADIUS: RadiusKey = "md";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Luminansi relatif (untuk memilih warna teks kontras di atas warna utama). */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const r = toLin(parseInt(h.slice(0, 2), 16));
  const g = toLin(parseInt(h.slice(2, 4), 16));
  const b = toLin(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Teks yang terbaca di atas warna solid: gelap untuk warna terang, putih untuk gelap. */
function contrastText(hex: string): string {
  return luminance(hex) > 0.5 ? "#1b1b1f" : "#ffffff";
}

export function getPreset(key: string | null | undefined): ThemeSpec {
  return PRESETS.find((p) => p.key === key) ?? PRESETS[0];
}

/**
 * Bangun peta CSS custom properties untuk sebuah konfigurasi tema.
 * Dipakai sebagai `style` inline pada pembungkus dashboard (menimpa token
 * globals.css hanya untuk area aplikasi).
 */
export function themeVars(opts: {
  presetKey?: string | null;
  primary?: string | null;
  radius?: string | null;
  font?: string | null;
}): Record<string, string> {
  const p = getPreset(opts.presetKey);
  const primary =
    opts.primary && HEX.test(opts.primary) ? opts.primary : p.primary;
  const primaryFg = contrastText(primary);
  const radius = RADIUS_VALUE[(opts.radius as RadiusKey) ?? "md"] ?? RADIUS_VALUE.md;
  const family = fontFamily(opts.font);

  return {
    // Tailwind v4 memakai `@theme inline`, sehingga utility .font-sans/.font-heading
    // ter-compile menjadi var(--font-inter)/var(--font-manrope) — BUKAN
    // var(--font-sans). Jadi override harus pada dua variabel itu agar font
    // benar-benar berganti di seluruh aplikasi. (--font-sans/heading disetel juga
    // untuk jaga-jaga bila token diubah ke non-inline di kemudian hari.)
    ...(family
      ? {
          "--font-inter": family,
          "--font-manrope": family,
          "--font-sans": family,
          "--font-heading": family,
        }
      : {}),
    "--background": p.bg,
    "--foreground": p.fg,
    "--card": p.surface,
    "--card-foreground": p.fg,
    "--popover": p.surface,
    "--popover-foreground": p.fg,
    "--primary": primary,
    "--primary-foreground": primaryFg,
    "--secondary": p.soft,
    "--secondary-foreground": p.softFg,
    "--muted": p.soft,
    "--muted-foreground": p.softFg,
    "--accent": p.soft,
    "--accent-foreground": p.softFg,
    "--destructive": p.destructive,
    "--border": p.border,
    "--input": p.border,
    "--ring": primary,
    "--chart-1": p.charts[0],
    "--chart-2": p.charts[1],
    "--chart-3": p.charts[2],
    "--chart-4": p.charts[3],
    "--chart-5": p.charts[4],
    "--sidebar": p.sidebar,
    "--sidebar-foreground": p.sidebarFg,
    "--sidebar-primary": p.sidebarPrimary,
    "--sidebar-primary-foreground": contrastText(p.sidebarPrimary),
    "--sidebar-accent": p.sidebarActive,
    "--sidebar-accent-foreground": p.sidebarActiveFg,
    "--sidebar-border": "rgba(255,255,255,0.08)",
    "--sidebar-ring": p.sidebarPrimary,
    "--radius": radius,
  };
}

/**
 * CSS untuk menimpa token di `:root`. Dipakai lewat <style> pada layout
 * dashboard sehingga tema berlaku menyeluruh — TERMASUK elemen yang di-portal
 * (dropdown, dialog, toast) yang berada di luar pohon komponen dashboard.
 * Hanya ter-render di area dashboard, jadi login/struk tetap default.
 */
export function themeCss(opts: {
  presetKey?: string | null;
  primary?: string | null;
  radius?: string | null;
  font?: string | null;
}): string {
  const vars = themeVars(opts);
  const body = Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  return `:root{${body}}`;
}
