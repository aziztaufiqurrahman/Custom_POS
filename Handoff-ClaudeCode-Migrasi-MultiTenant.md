# Panduan Handoff ke Claude Code
## Migrasi Kasir Unggul (produksi berjalan) → Multi-Tenant SaaS

**Konteks:** Aplikasi POS (Kasir Unggul) sudah dibangun & berjalan (kode + database Supabase produksi). Tujuan: membungkusnya jadi multi-tenant SaaS **tanpa mengubah fungsi** (lihat `PRD-UMKM-Unggul-ClaudeCode.md` §4C & Fase 1B). Panduan ini memberi tahu **apa yang harus Anda serahkan ke Claude Code** dan **cara kerja yang aman**.

---

## 1. Yang HARUS Anda berikan ke Claude Code

Claude Code sudah bisa membaca repo, tapi **kode saja tidak cukup** — database produksi bisa "drift" dari migrasi. Berikan tujuh hal berikut:

1. **Repo Kasir Unggul** (Claude Code baca langsung).
2. **Dump skema database PRODUKSI saat ini** — *ground truth*. Struktur tabel/kolom/enum/FK **+ RLS policies + functions (RPC) + triggers**. (Cara ekstrak di §2.) Ini WAJIB agar Claude Code tidak menebak.
3. **Dua PRD**:
   - `PRD-POS-Multi-Cabang-v2.md` → definisi fitur POS = "yang TIDAK boleh berubah".
   - `PRD-UMKM-Unggul-ClaudeCode.md` (v1.1) → target arsitektur (§4A–§4D) + langkah migrasi (Fase 1B).
4. **`CLAUDE.md` saat ini** + minta Claude Code menambahkan prinsip multi-tenant (blok di §3).
5. **Info environment**: mana proyek Supabase **PROD** vs **STAGING**, env vars, dan apakah Anda memakai folder `supabase/migrations` (dan apakah isinya benar-benar mencerminkan prod).
6. **Daftar modul/route untuk uji regresi** (agar Claude Code tahu apa yang harus tetap sama): Kasir, Produk, Harga Cabang, Inventory, Gudang, Shift, Penjualan, Persetujuan, Dashboard, Laporan, Keamanan, Audit Log, Pengaturan.
7. **Keputusan yang sudah dikunci** (§6): limit tiap paket, siapa owner workspace existing, daftar tabel high-volume untuk denormalisasi `workspace_id`, dan strategi domain (mulai Opsi A).

---

## 2. Cara mengekstrak "ground truth" database (perintah konkret)

> ⚠️ **Ini perintah TERMINAL (PowerShell), BUKAN SQL.** Jangan ditempel ke Supabase SQL Editor —
> parser Postgres akan menolaknya dengan `syntax error at or near "supabase"`.

Pakai **Supabase CLI** (paling akurat karena mengambil dari DB nyata, bukan dari migrasi yang mungkin sudah drift).
Tidak perlu instalasi — `npx` sudah cukup. Jalankan dari folder repo `Aplikasi POS`:

```powershell
# 1) Token dari .env.local — supaya tidak perlu login lewat browser
$env:SUPABASE_ACCESS_TOKEN = "<isi SUPABASE_ACCESS_TOKEN dari .env.local>"

# 2) Hubungkan ke proyek (akan meminta password database)
npx -y supabase@latest link --project-ref <PROJECT_REF>

# 3) Dump struktur — SERTAKAN auth & storage, bukan hanya public
npx -y supabase@latest db dump --schema public,auth,storage --file current_schema.sql
```

**Kenapa `public,auth,storage` dan bukan `public` saja:** trigger `on_auth_user_created` ada di
`auth.users`, dan 3 policy foto produk/QRIS ada di `storage.objects`. Keduanya krusial untuk
KEP-002 dan KEP-007, dan **tidak akan ikut** bila hanya men-dump `public`.

> 🛑 **JANGAN** jalankan `supabase db push`, `db reset`, atau `db remote commit` — ketiganya
> **mengubah** database. Untuk ekstraksi, hanya `link` dan `db dump` yang boleh.

**Bila CLI bermasalah:** pakai `docs/introspeksi-skema.sql` — 9 blok query baca-saja yang
dijalankan satu per satu di SQL Editor, hasilnya diunduh sebagai CSV.

Serahkan `current_schema.sql` (atau berkas CSV hasil introspeksi) ke Claude Code sebagai konteks.

---

## 3. Tambahan untuk `CLAUDE.md` (tempel)

```markdown
## Multi-Tenant SaaS (WAJIB)
- Tenant induk = `workspaces`; setiap `branch` milik satu workspace (branches.workspace_id).
- Migrasi bersifat ADITIF: JANGAN mengubah/menghapus tabel, kolom fungsional, atau
  logika fitur POS yang sudah ada. Semua fitur harus berperilaku SAMA.
- Master Admin POS di-scope ke workspace (owner UMKM masing-masing). Super admin global
  = staff internal (profiles.is_staff), bukan pelanggan.
- Akses tool digerbangi `entitlements` (aktif + limits), dicek server-side/RLS.
- RLS: guard induk workspace_id = ANY(user_workspace_ids()) OR is_staff(), DI ATAS
  policy cabang yang sudah ada. Isolasi: workspace -> cabang.
- Kerjakan migrasi di STAGING dulu; backup + PITR; uji regresi sebelum prod.
```

---

## 4. Prompt Kickoff untuk Claude Code (tinggal paste)

```
Konteks: Kasir Unggul sudah berjalan (kode di repo ini + database produksi Supabase).
Aku melampirkan `current_schema.sql` (ground truth skema+RLS+function+trigger produksi),
`PRD-POS-Multi-Cabang-v2.md` (fitur yang TIDAK boleh berubah), dan
`PRD-UMKM-Unggul-ClaudeCode.md` (§4C + Fase 1B = target multi-tenant).

Tugas: bungkus aplikasi ini menjadi multi-tenant SaaS SESUAI Fase 1B, dengan ATURAN EMAS
= hanya perubahan ADITIF; JANGAN mengubah/menghapus tabel, kolom fungsional, atau logika
fitur POS. Semua fitur harus berperilaku sama.

Sebelum menulis kode:
1. Baca repo + current_schema.sql + kedua PRD. Petakan skema NYATA saat ini (tabel, RLS,
   RPC, trigger) dan bandingkan dengan target §4C.
2. Identifikasi tabel high-volume yang perlu denormalisasi workspace_id.
3. Sajikan RENCANA MIGRASI bertahap: (a) tabel/kolom baru (workspaces, workspace_members,
   subscriptions, entitlements; branches.workspace_id + denormalisasi), (b) perubahan RLS
   (guard workspace di atas policy cabang), (c) re-scope Master Admin -> workspace,
   (d) gerbang entitlement, (e) skrip migrasi data existing (1 workspace untuk data lama +
   entitlement active), (f) daftar UJI REGRESI per modul.
4. Konfirmasi hal yang ambigu. JANGAN mulai eksekusi sampai kusetujui rencananya.
5. Semua dikerjakan di STAGING dulu (jangan sentuh PROD). Gunakan Context7 MCP untuk API
   Supabase terbaru.

Tampilkan rencananya sekarang.
```

> Gunakan **Opus** untuk tahap ini (perubahan skema + RLS = paling berisiko).

---

## 5. Alur kerja aman (WAJIB diikuti)

1. **Branch git** khusus: `feat/multi-tenant` (jangan di `main`).
2. **Siapkan STAGING** yang mereplikasi prod: buat proyek Supabase kedua **atau** pakai fitur **Supabase Branching**, lalu **restore salinan data prod** ke staging agar uji realistis. **Jangan** jalankan migrasi di prod lebih dulu.
3. **Backup + aktifkan PITR** di prod sebelum apa pun.
4. Claude Code menulis **migrasi SQL berversi** di `supabase/migrations` (bukan ubah langsung via dashboard) → jalankan di **staging**.
5. **Uji regresi** (checklist §6) di staging sampai semua fitur identik.
6. Baru terapkan ke **prod** dengan jendela pemeliharaan singkat; pantau; siapkan rollback (PITR).

---

## 6. Checklist Uji Regresi (harus SAMA sebelum & sesudah)

Untuk workspace hasil migrasi, verifikasi tiap modul berperilaku identik:
- [ ] **Kasir**: checkout, hold, void (approval), struk, nomor transaksi berurutan.
- [ ] **Produk & Harga Cabang**: CRUD, foto, harga/min-stock per cabang.
- [ ] **Inventory & Gudang**: ledger, opname (approval), transfer dua sisi, penerimaan, wastage.
- [ ] **Shift**: buka/tutup, blind count, rekonsiliasi, cash movements.
- [ ] **Penjualan / Dashboard / Laporan**: angka & diagram sama; ekspor jalan.
- [ ] **Persetujuan**: pemicu & alur approval sama.
- [ ] **Keamanan & Audit Log**: hash-chain/append-only utuh; anomali terdeteksi.
- [ ] **Pengaturan**: pajak, rekening, QRIS per cabang.
- [ ] **Isolasi**: workspace A TIDAK bisa akses data workspace B (uji query langsung).
- [ ] **Entitlement**: akses & limit (max_branches/max_users) dihormati; expired → grace 7 hari,
      lalu **turun ke limit tier Gratis** (KEP-008), BUKAN read-only. Kasir tetap jalan;
      cabang ke-2..N read-only; bayar kembali → semuanya pulih utuh.
- [ ] **Storage**: workspace A tidak bisa menimpa/menghapus foto produk & QRIS workspace B (KEP-007).
- [ ] **Transfer stok**: mustahil transfer antar-cabang beda workspace (KEP-005).

---

## 7. Keputusan yang harus Anda kunci SEBELUM mulai
1. **Limit tiap paket** (dibaca entitlement): **sudah ditetapkan final di §8** — tinggal dijadikan seed.
2. **Owner workspace existing**: akun mana yang jadi Master Admin workspace untuk data POS lama.
3. **Tabel high-volume** untuk denormalisasi `workspace_id` (biasanya: transactions, transaction_items, payments, stock_movements, branch_products, cash_sessions).
4. **Strategi domain**: mulai `app.umkmunggul.com` (Opsi A); siapkan wildcard subdomain (Opsi B) menyusul.
5. **PROD vs STAGING**: sediakan proyek staging + salinan data untuk uji.

---

---

## 8. Paket, Harga & Limit FINAL (siap jadi seed `plans` + `entitlements`)

### 8.1 Filosofi penetapan (ringkas)
- **Biaya marginal per tenant sangat kecil** (arsitektur pooled): pada skala ~1.000 tenant, biaya infra ≈ **jauh di bawah Rp5.000/tenant/bulan**. Maka tier berbayar tetap bermargin kotor **±85–95%** (bahkan Basic Rp30rb masih sangat sehat).
- **Funnel gratis → berbayar:** tier **Gratis** menarik massa UMKM mikro (adopsi), lalu di-upsell. Tenant gratis yang menganggur nyaris nol biaya (pooled), jadi aman.
- **Batasi pada pemicu biaya nyata**, bukan sekadar headcount: **cabang + seat (batas keras + add-on)** dan **fair-use transaksi + storage** (soft cap + alert). Ini menjawab kekhawatiran "1 UMKM bikin 100 user": mereka boleh, tapi **bayar per kelebihan** → pendapatan Anda naik seiring beban.
- **Kompetitif:** dibandingkan pasar (Kasir Pintar ~Rp66rb, Majoo Rp129–249rb, Pawoon Rp299rb/outlet), harga di bawah ini **lebih terjangkau** dan menang di multi-cabang (harga per cabang jauh lebih murah).
- **Tahunan = bayar 10 bulan** (2 bulan gratis, ±17% hemat) → retensi & arus kas lebih baik.

### 8.2 Tabel Paket (angka final — bisa Anda ubah bila mau)

| Parameter | **Gratis** | **Basic** | **Pro** ⭐ | **Bisnis** | **Enterprise** |
|---|---|---|---|---|---|
| Harga / bulan | Rp0 | **Rp30.000** | **Rp99.000** | **Rp299.000** | Custom (quote) |
| Harga / tahun (2 bln gratis) | Rp0 | Rp300.000 | Rp990.000 | Rp2.990.000 | Custom |
| `max_branches` | 1 | 1 | 3 | 10 | custom |
| `max_users` | 2 | 4 | 12 | 40 | custom |
| `monthly_tx_cap` (fair-use) | 300 | 3.000 | 20.000 | 75.000 | custom |
| `storage_mb` | 200 | 1.000 | 5.000 | 20.000 | custom |
| Multi-cabang, Harga Cabang, Gudang/Transfer, Persetujuan, Dashboard konsolidasi, Audit lanjutan | ❌ | ❌ | ✅ | ✅ | ✅ |
| Fitur inti (Kasir, Produk, Stok/Opname, Shift, Penjualan, Laporan dasar, Pengaturan) | ✅ (dibatasi) | ✅ | ✅ | ✅ | ✅ |
| Prioritas support / custom domain / ekspor terjadwal | ❌ | ❌ | opsional | ✅ | ✅ + SLA/dedicated |

> **Positioning fitur:** semua fitur **multi-cabang & gudang/transfer/persetujuan mulai dari Pro** (nilai jual utama + pengguna berat). Gratis & Basic = 1 cabang untuk akuisisi massal.

### 8.3 Add-on (untuk yang melewati batas → biaya tetap proporsional)
- **+1 cabang:** Rp39.000/bulan (Pro & Bisnis)
- **+1 user/seat:** Rp15.000/bulan
- **+5 GB storage:** Rp19.000/bulan
- **Kelebihan transaksi:** soft cap → alert di ~80% & 100%, tawarkan naik tier/beli blok (jangan langsung blokir kasir saat toko ramai).

> Contoh kasus "100 user": harus di **Bisnis** (40 seat) + 60 add-on seat × Rp15.000 = Rp900.000 + base Rp299.000 ≈ **Rp1,2 juta/bulan** → beban besar = pendapatan besar. Kekhawatiran teratasi.

### 8.4 Format `limits` (jsonb) untuk seed `plans.limits` & `entitlements.limits`
```json
// Gratis
{ "max_branches": 1,  "max_users": 2,  "monthly_tx_cap": 300,   "storage_mb": 200,   "features": ["core"] }
// Basic
{ "max_branches": 1,  "max_users": 4,  "monthly_tx_cap": 3000,  "storage_mb": 1000,  "features": ["core"] }
// Pro
{ "max_branches": 3,  "max_users": 12, "monthly_tx_cap": 20000, "storage_mb": 5000,  "features": ["core","multi_branch","warehouse","approval","consolidated_dashboard","audit_plus"] }
// Bisnis
{ "max_branches": 10, "max_users": 40, "monthly_tx_cap": 75000, "storage_mb": 20000, "features": ["core","multi_branch","warehouse","approval","consolidated_dashboard","audit_plus","priority_support","custom_domain","scheduled_export"] }
// Enterprise (null = tak terbatas wajar; tetap ada guard anti-abuse)
{ "max_branches": null, "max_users": null, "monthly_tx_cap": null, "storage_mb": null, "features": ["all"] }
```

### 8.5 Penegakan (untuk Claude Code)
- **Batas keras** `max_branches` & `max_users`: dicek entitlement **saat menambah** cabang/user; bila penuh → tawarkan upgrade/add-on (bukan error mentah).
- **Fair-use** `monthly_tx_cap` & `storage_mb`: **soft cap** — hitung pemakaian per workspace, kirim alert 80%/100%, jangan hentikan transaksi mendadak; tawarkan upgrade.
- **Add-on** menaikkan angka efektif di `entitlements.limits` (base plan + add-on).
- Semua limit **dibaca dari `entitlements`**, bukan hardcode di aplikasi.

---

*Ringkas: beri Claude Code (1) dump skema prod, (2) kedua PRD, (3) aturan aditif di CLAUDE.md, (4) prompt kickoff §4, (5) paket/limit final §8 sebagai seed — lalu kerjakan di branch + staging, uji regresi, baru prod. Setelah migrasi lolos, lanjut ke Fase 3 (checkout) untuk komersialisasi, dan Fase 6 untuk website marketing.*
