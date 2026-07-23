"use client";

import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Palette, Pencil, Plus, Trash2 } from "lucide-react";

import {
  createCategory,
  deleteCategory,
  renameCategory,
  saveBankAccount,
  updateStoreProfile,
  updateTaxSettings,
  updateThemeSettings,
} from "./actions";
import type { BankData, CategoryData, StoreSettingsData } from "./page";
import {
  PRESETS,
  RADIUS_OPTIONS,
  getPreset,
  themeVars,
  type RadiusKey,
} from "@/lib/themes";
import { cn } from "@/lib/utils";
import { StoreImageUploader } from "@/components/domain/store-image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

export function SettingsClient({
  store,
  banks,
  categories,
}: {
  store: StoreSettingsData;
  banks: BankData[];
  categories: CategoryData[];
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <AppearanceCard store={store} />
      <ProfileCard store={store} />
      <QrisCard qris={store.qris_image_url} />
      <BankCard banks={banks} />
      <TaxCard store={store} />
      <CategoryCard categories={categories} />
    </div>
  );
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function AppearanceCard({ store }: { store: StoreSettingsData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [presetKey, setPresetKey] = useState(store.theme_preset || "classic");
  const [useCustom, setUseCustom] = useState(!!store.theme_primary);
  const [primary, setPrimary] = useState(
    store.theme_primary ?? getPreset(store.theme_preset).primary,
  );
  const [radius, setRadius] = useState<RadiusKey>(
    (store.theme_radius as RadiusKey) || "md",
  );

  const activePrimary = useCustom && HEX_RE.test(primary) ? primary : null;
  const previewStyle = themeVars({
    presetKey,
    primary: activePrimary,
    radius,
  }) as CSSProperties;

  function toggleCustom(on: boolean) {
    setUseCustom(on);
    if (on && !HEX_RE.test(primary)) setPrimary(getPreset(presetKey).primary);
  }

  function submit() {
    start(async () => {
      const res = await updateThemeSettings({
        theme_preset: presetKey,
        theme_primary: useCustom ? primary : "",
        theme_radius: radius,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Tampilan disimpan");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-5 text-primary" /> Tampilan &amp; Tema
        </CardTitle>
        <CardDescription>
          Sesuaikan warna &amp; gaya kasir. Hanya mengubah tampilan — semua
          fitur tetap sama.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Template */}
        <div className="space-y-2">
          <Label>Template</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PRESETS.map((p) => {
              const active = presetKey === p.key;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPresetKey(p.key)}
                  className={cn(
                    "relative rounded-lg border p-2 text-left transition hover:border-primary/60",
                    active && "border-primary ring-2 ring-primary",
                  )}
                >
                  <div
                    className="flex h-12 overflow-hidden rounded-md"
                    style={{ background: p.bg }}
                  >
                    <div style={{ background: p.sidebar }} className="w-3" />
                    <div className="flex flex-1 items-center gap-1.5 p-1.5">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-bold"
                        style={{
                          background: p.primary,
                          color: p.dark ? "#10131a" : "#fff",
                        }}
                      >
                        Aa
                      </span>
                      <span
                        className="h-4 flex-1 rounded"
                        style={{
                          background: p.surface,
                          border: `1px solid ${p.border}`,
                        }}
                      />
                    </div>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1 text-xs font-medium">
                    {p.name}
                    {p.dark && (
                      <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">
                        Gelap
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.description}
                  </p>
                  {active && (
                    <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="size-3" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Warna utama kustom */}
        <div className="space-y-2 rounded-lg border p-3">
          <label className="flex items-center justify-between">
            <span className="text-sm font-medium">Warna utama kustom</span>
            <Switch checked={useCustom} onCheckedChange={toggleCustom} />
          </label>
          {useCustom && (
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={HEX_RE.test(primary) ? primary : "#000000"}
                onChange={(e) => setPrimary(e.target.value)}
                className="size-10 shrink-0 cursor-pointer rounded-md border bg-transparent"
                aria-label="Pilih warna utama"
              />
              <Input
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                placeholder="#9c6a44"
                className="max-w-[140px] font-mono"
              />
              <span className="text-xs text-muted-foreground">
                Warna tombol &amp; aksen brand.
              </span>
            </div>
          )}
          {!useCustom && (
            <p className="text-xs text-muted-foreground">
              Memakai warna bawaan template. Aktifkan untuk memakai warna brand
              Anda sendiri.
            </p>
          )}
        </div>

        {/* Sudut */}
        <div className="space-y-2">
          <Label>Kelengkungan sudut</Label>
          <div className="flex gap-2">
            {RADIUS_OPTIONS.map((o) => (
              <Button
                key={o.key}
                type="button"
                size="sm"
                variant={radius === o.key ? "default" : "outline"}
                onClick={() => setRadius(o.key)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Pratinjau langsung */}
        <div className="space-y-2">
          <Label>Pratinjau</Label>
          <div style={previewStyle} className="rounded-xl border bg-background p-4">
            <div className="rounded-lg border bg-card p-3 text-card-foreground shadow-sm">
              <p className="font-heading font-semibold">Pudingkuu Lucky</p>
              <p className="text-sm text-muted-foreground">
                Beginilah tampilan layar kasir.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button size="sm">Bayar</Button>
                <Button size="sm" variant="outline">
                  Tahan
                </Button>
                <Badge>Baru</Badge>
              </div>
            </div>
          </div>
        </div>

        <Button onClick={submit} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan Tampilan"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ProfileCard({ store }: { store: StoreSettingsData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [logo, setLogo] = useState(store.logo_url);
  const [form, setForm] = useState({
    store_name: store.store_name,
    address: store.address ?? "",
    phone: store.phone ?? "",
    receipt_footer: store.receipt_footer ?? "",
    trx_prefix: store.trx_prefix,
  });

  function submit() {
    start(async () => {
      const res = await updateStoreProfile(form);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Profil toko disimpan");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil Toko</CardTitle>
        <CardDescription>Identitas toko & footer struk.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label>Logo</Label>
          <StoreImageUploader kind="logo" value={logo} onUploaded={setLogo} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="sn">Nama toko *</Label>
          <Textarea
            id="sn"
            rows={2}
            value={form.store_name}
            onChange={(e) => setForm({ ...form, store_name: e.target.value })}
            placeholder={"Pudingkuu Lucky\nPudingna Urang Bandung"}
          />
          <p className="text-xs text-muted-foreground">
            Boleh beberapa baris (tekan Enter). Semua baris tampil di struk.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="ph">No. HP</Label>
            <Input
              id="ph"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pfx">Prefix No. Transaksi</Label>
            <Input
              id="pfx"
              value={form.trx_prefix}
              onChange={(e) => setForm({ ...form, trx_prefix: e.target.value })}
              placeholder="TRX"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="addr">Alamat</Label>
          <Textarea
            id="addr"
            rows={2}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ft">Footer struk</Label>
          <Textarea
            id="ft"
            rows={2}
            value={form.receipt_footer}
            onChange={(e) => setForm({ ...form, receipt_footer: e.target.value })}
            placeholder={"Terima kasih telah berbelanja!\nTersedia di GoFood & ShopeeFood"}
          />
          <p className="text-xs text-muted-foreground">
            Boleh beberapa baris (tekan Enter).
          </p>
        </div>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan Profil"}
        </Button>
      </CardContent>
    </Card>
  );
}

function QrisCard({ qris }: { qris: string | null }) {
  const [url, setUrl] = useState(qris);
  return (
    <Card>
      <CardHeader>
        <CardTitle>QRIS</CardTitle>
        <CardDescription>
          Gambar QRIS statis yang ditampilkan saat pembayaran QRIS di kasir.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StoreImageUploader kind="qris" value={url} onUploaded={setUrl} />
      </CardContent>
    </Card>
  );
}

function BankCard({ banks }: { banks: BankData[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(banks);

  function update(i: number, patch: Partial<BankData>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function save(row: BankData) {
    start(async () => {
      const res = await saveBankAccount(row);
      if (res.error) { toast.error(res.error); return; }
      toast.success(`Rekening ${row.bank} disimpan`);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rekening Bank</CardTitle>
        <CardDescription>
          Ditampilkan saat pembayaran Transfer (BNI/BCA/BSI).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((row, i) => (
          <div key={row.bank} className="rounded-md border p-3">
            <div className="mb-2 flex items-center justify-between">
              <Badge>{row.bank}</Badge>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Aktif
                <Switch
                  checked={row.is_active}
                  onCheckedChange={(v) => update(i, { is_active: v })}
                />
              </label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label className="text-xs">No. Rekening</Label>
                <Input
                  value={row.account_number}
                  onChange={(e) => update(i, { account_number: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Nama Pemilik</Label>
                <Input
                  value={row.account_name}
                  onChange={(e) => update(i, { account_name: e.target.value })}
                />
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={pending}
              onClick={() => save(row)}
            >
              Simpan {row.bank}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function TaxCard({ store }: { store: StoreSettingsData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [enabled, setEnabled] = useState(store.tax_enabled);
  const [percent, setPercent] = useState(String(store.tax_percent));
  const [inclusive, setInclusive] = useState(store.tax_inclusive);

  function submit() {
    start(async () => {
      const res = await updateTaxSettings({
        tax_enabled: enabled,
        tax_percent: Number(percent) || 0,
        tax_inclusive: inclusive,
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success("Pengaturan pajak disimpan");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pajak (PPN)</CardTitle>
        <CardDescription>Default non-aktif. Aktifkan bila perlu.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center justify-between rounded-md border p-3">
          <span className="text-sm font-medium">Aktifkan PPN</span>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Persentase (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              disabled={!enabled}
            />
          </div>
          <label className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">Harga sudah termasuk pajak (inklusif)</span>
            <Switch
              checked={inclusive}
              onCheckedChange={setInclusive}
              disabled={!enabled}
            />
          </label>
        </div>
        <Button onClick={submit} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan Pajak"}
        </Button>
      </CardContent>
    </Card>
  );
}

function CategoryCard({ categories }: { categories: CategoryData[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<{ mode: "add" | "edit"; id?: string; name: string } | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState<CategoryData | null>(null);

  function submitDialog() {
    if (!dialog) return;
    start(async () => {
      const res =
        dialog.mode === "add"
          ? await createCategory({ name: dialog.name })
          : await renameCategory(dialog.id!, { name: dialog.name });
      if (res.error) { toast.error(res.error); return; }
      toast.success("Kategori disimpan");
      setDialog(null);
      router.refresh();
    });
  }

  function doDelete() {
    if (!confirmDelete) return;
    start(async () => {
      const res = await deleteCategory(confirmDelete.id);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Kategori dihapus");
      setConfirmDelete(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Kategori Produk</CardTitle>
          <CardDescription>Kelola kategori produk.</CardDescription>
        </div>
        <Button onClick={() => setDialog({ mode: "add", name: "" })}>
          <Plus className="size-4" /> Tambah
        </Button>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Belum ada kategori.
          </p>
        ) : (
          <Table>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDialog({ mode: "edit", id: c.id, name: c.name })}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setConfirmDelete(c)}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "add" ? "Tambah Kategori" : "Ubah Kategori"}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={dialog?.name ?? ""}
            onChange={(e) => setDialog((d) => (d ? { ...d, name: e.target.value } : d))}
            placeholder="Nama kategori"
            onKeyDown={(e) => e.key === "Enter" && submitDialog()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)} disabled={pending}>
              Batal
            </Button>
            <Button onClick={submitDialog} disabled={pending || !dialog?.name.trim()}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus kategori “{confirmDelete?.name}”?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Produk pada kategori ini akan menjadi tanpa kategori.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={pending}>
              Batal
            </Button>
            <Button variant="destructive" onClick={doDelete} disabled={pending}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
