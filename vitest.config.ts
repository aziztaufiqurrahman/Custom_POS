import { fileURLToPath } from "node:url";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  // Override PostCSS dengan config inline kosong agar Vite tidak me-resolve
  // postcss.config.mjs (format plugin string Tailwind v4 yang tak dikenali Vite 5).
  css: {
    postcss: {},
  },
  test: {
    // Default "node": test logika murni (perhitungan total/kembalian/rekonsiliasi).
    // Untuk test komponen, tambahkan "// @vitest-environment jsdom" di atas file
    // (perlu Node 20.19+ / 22 LTS agar jsdom termuat).
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
});
