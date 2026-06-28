# CLAUDE.md — Aplikasi POS / Kasir (8am Business)

## Tentang Proyek
Aplikasi Point of Sale berbasis web untuk transaksi penjualan, manajemen produk & stok,
pembayaran (Cash/QRIS/Transfer), rekonsiliasi kas per shift, rekap penjualan, dan dashboard
pendapatan. Spesifikasi lengkap ada di `PRD-POS-Kasir.md` — SELALU rujuk file itu sebagai
sumber kebenaran fitur. Bila ada konflik antara permintaan ad-hoc dan PRD, konfirmasi dulu.

## Tech Stack (jangan ganti tanpa persetujuan)
- Next.js 15 (App Router) + React Server Components sebagai default
- TypeScript (strict mode, tanpa `any` kecuali sangat terpaksa + komentar alasan)
- Tailwind CSS v4 + shadcn/ui (komponen UI)
- Supabase: Postgres + Auth + Storage + RLS (+ Realtime opsional)
- react-hook-form + zod untuk form & validasi
- TanStack Query untuk data fetching/caching di client
- Recharts untuk grafik dashboard
- Vitest untuk unit test
- Deploy: Vercel

## Status & Keputusan Proyek (konfirmasi pemilik)
- PPN: NON-AKTIF dulu (skema & logika tetap dibuat; aktifkan via Pengaturan kapan saja).
- Migrasi DB diterapkan via MCP Supabase ke instance STAGING (bukan production).
- Struk: dukung DUA mode — cetak via browser + export PDF, DAN layout thermal printer 58/80mm.
- Single store (satu toko); multi-cabang = fase lanjutan.
- Split payment & varian produk = fase lanjutan (bukan MVP).

## Prinsip Arsitektur
1. RLS-FIRST: setiap tabel WAJIB punya Row Level Security. Tidak ada tabel terbuka.
   Keamanan ditegakkan di database, bukan hanya di UI.
2. Server Components default; pakai Client Component hanya bila perlu interaktivitas.
3. Operasi stok HARUS atomik: pengurangan stok + pencatatan stock_movements + pembuatan
   transaksi dilakukan dalam SATU Postgres function (RPC) / transaksi DB. Jangan pernah
   memutakhirkan stok lewat beberapa query terpisah dari client.
4. Snapshot data: simpan nama & harga produk pada transaction_items saat transaksi terjadi,
   agar rekap historis tidak berubah meski produk diedit/dihapus.
5. Soft delete (deleted_at) untuk produk; jangan hard delete data yang punya histori.

## Aturan Keamanan (TIDAK BOLEH dilanggar)
- JANGAN PERNAH mengirim `cost_price` (harga modal) ke klien peran "kasir".
- JANGAN PERNAH menaruh SERVICE_ROLE_KEY atau rahasia di kode sisi klien / NEXT_PUBLIC_*.
- Validasi SEMUA input di sisi server (zod) selain di client.
- Hak akses: peran `admin` & `kasir`. Admin pertama di-set langsung di DB. Permission
  granular kasir disimpan di `profiles.permissions` (text[]). Tegakkan via RLS + helper
  `is_admin()` dan `has_permission(perm)`.

## Konvensi Kode
- Penamaan file: kebab-case untuk folder/route, PascalCase untuk komponen.
- Tipe data uang: gunakan `numeric` di Postgres; di TS perlakukan sebagai number rupiah
  (tanpa desimal sen, IDR). Format tampilan: `Rp1.234.567` (helper `formatRupiah` di `lib/format.ts`).
- Bahasa antarmuka: Indonesia. Tanggal: format lokal Indonesia (`lib/date.ts`).
- Komponen UI: gunakan shadcn/ui; jangan buat ulang komponen yang sudah ada di registry.
- Tulis komentar singkat hanya untuk logika non-obvious (mis. rumus rekonsiliasi kas).
- Path alias `@/*` menunjuk ke root proyek.

## Struktur Folder
- `app/(auth)/login`, `app/(dashboard)/{pos,products,inventory,shifts,sales,dashboard,settings,employees}`
- `components/ui` (shadcn), `components/domain` (komponen domain)
- `lib/supabase` (client.ts browser, server.ts RSC, admin.ts service-role, middleware.ts)
- `lib/validations` (skema zod), `lib/format.ts`, `lib/date.ts`, `lib/constants.ts`
- `supabase/migrations` (SQL skema + RLS), `types/database.ts` (generated)

## Definition of Done (tiap fitur)
- Tipe TypeScript lengkap, lolos `npm run typecheck` (tsc --noEmit) & `npm run lint`.
- RLS aktif & teruji untuk tabel terkait.
- Empty state, loading skeleton, error handling tersedia.
- Responsif (layar kasir optimal di tablet/desktop).
- Tidak ada kebocoran data sensitif ke peran kasir.

## Protokol Testing
- Unit/logic: Vitest untuk fungsi perhitungan (total, pajak, kembalian, rekonsiliasi).
- E2E penting (checkout, buka/tutup shift): Playwright (opsional, fase lanjut).
- Sebelum commit: jalankan lint + typecheck + test (lihat .claude/hooks).

## Git
- Commit kecil & bermakna (conventional commits: feat:, fix:, chore:, refactor:).
- Jangan commit .env*, kunci, atau file build.

## Cara Kerja yang Diharapkan
- Sebelum menulis kode untuk fitur baru, ringkas rencana singkat & tunggu konfirmasi bila
  fitur kompleks atau menyentuh skema DB / RLS.
- Gunakan Context7 MCP untuk memastikan API library terbaru (Next.js 15, Supabase).
- Untuk komponen shadcn, gunakan registry shadcn (jangan menebak API komponen).

## Perintah Penting
- `npm run dev` — jalankan dev server
- `npm run build` — build production
- `npm run typecheck` — tsc --noEmit
- `npm run lint` — eslint
- `npm run test` — vitest run

## Catatan Lingkungan
- Node terpasang: v20.5.1. Beberapa paket ESLint menyarankan Node >= 20.9/20.19.
  Disarankan upgrade Node ke 20.19+ atau 22 LTS untuk menghindari peringatan EBADENGINE.
