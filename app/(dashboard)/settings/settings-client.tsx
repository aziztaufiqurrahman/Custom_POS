"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  createCategory,
  deleteCategory,
  renameCategory,
  saveBankAccount,
  updateStoreProfile,
  updateTaxSettings,
} from "./actions";
import type { BankData, CategoryData, StoreSettingsData } from "./page";
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
      <ProfileCard store={store} />
      <QrisCard qris={store.qris_image_url} />
      <BankCard banks={banks} />
      <TaxCard store={store} />
      <CategoryCard categories={categories} />
    </div>
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
