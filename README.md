# Aplikasi POS / Kasir — 8am Business

Sistem Point of Sale berbasis web: transaksi penjualan, manajemen produk & stok,
pembayaran (Cash/QRIS/Transfer), rekonsiliasi kas per shift, rekap penjualan, dan
dashboard pendapatan.

Spesifikasi lengkap: lihat [`PRD-POS-Kasir.md`](./PRD-POS-Kasir.md).
Panduan kerja untuk Claude Code: lihat [`CLAUDE.md`](./CLAUDE.md).

## Tech Stack
Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui ·
Supabase (Postgres + Auth + Storage + RLS) · TanStack Query · Recharts · Vitest · Vercel.

## Persiapan

1. **Buat project Supabase** (gunakan instance staging untuk pengembangan).
2. Salin environment:
   ```bash
   cp .env.example .env.local
   ```
   Isi `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, dan
   `SUPABASE_SERVICE_ROLE_KEY` (rahasia, hanya server).
3. Install dependensi & jalankan:
   ```bash
   npm install
   npm run dev
   ```

## Perintah
| Perintah | Fungsi |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Build production |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |

## MCP (opsional, untuk Claude Code)
Konfigurasi ada di `.mcp.json` (Context7 + Supabase). Sebelum dipakai:
- Ganti `YOUR_PROJECT_REF` dengan project ref Supabase Anda.
- Set environment variable `SUPABASE_ACCESS_TOKEN` (Personal Access Token Supabase) —
  JANGAN tulis token langsung di file yang di-commit.
- Di Windows, bila MCP gagal start, jalankan Claude Code dan biarkan ia memverifikasi
  perintah `npx` (kadang perlu `cmd /c npx`).

## Menetapkan Admin Pertama (manual via DB)
Tidak ada UI untuk "promosi diri menjadi admin" (sesuai PRD §2.1). Admin pertama
ditetapkan langsung di database:

1. Daftarkan user lewat halaman login (atau Supabase Auth → Add user).
2. Buka **Supabase → SQL Editor**, jalankan (ganti email sesuai akun Anda):
   ```sql
   update public.profiles
   set role = 'admin', is_active = true
   where id = (select id from auth.users where email = 'admin@contoh.com');
   ```
3. Setelah jadi admin, kelola karyawan & hak akses lain lewat halaman **/employees**.

> Catatan: tabel `profiles` & trigger pembuatannya dibuat pada Tahap 1 (skema DB).

## Mengisi Rekening Bank & QRIS
Lewat halaman **/settings** (admin):
- **Rekening bank** (BNI/BCA/BSI): nomor rekening + nama pemilik.
- **QRIS**: upload gambar QRIS statis (disimpan di Supabase Storage).
- **Profil toko**, **pajak (PPN)**, **kategori**, dan **format nomor transaksi**.
