"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  PackagePlus,
  Plus,
  Send,
  Trash2,
  TriangleAlert,
  Download,
} from "lucide-react";

import {
  createSupplier,
  createTransfer,
  dispatchTransfer,
  receiveGoods,
  receiveTransfer,
  recordWastage,
} from "./actions";
import type {
  BranchOpt,
  ReceiptRow,
  SupplierOpt,
  TransferRow,
  WastageRow,
  WhProduct,
} from "./page";
import { formatTanggalWaktu } from "@/lib/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Line = { product_id: string; qty: string; cost_price?: string };

const TABS = [
  { key: "receipt", label: "Penerimaan", icon: PackagePlus },
  { key: "wastage", label: "Barang Rusak", icon: TriangleAlert },
  { key: "transfer", label: "Transfer", icon: ArrowRightLeft },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function ProductSelect({
  products,
  value,
  onChange,
}: {
  products: WhProduct[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <option value="">Pilih produk…</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} (stok {p.stock} {p.unit})
        </option>
      ))}
    </select>
  );
}

function LineRows({
  products,
  lines,
  setLines,
  withCost,
}: {
  products: WhProduct[];
  lines: Line[];
  setLines: (l: Line[]) => void;
  withCost?: boolean;
}) {
  function update(i: number, patch: Partial<Line>) {
    setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  return (
    <div className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <ProductSelect
              products={products}
              value={l.product_id}
              onChange={(v) => update(i, { product_id: v })}
            />
          </div>
          <div className="w-20">
            <Input
              type="number"
              min={0}
              placeholder="Qty"
              value={l.qty}
              onChange={(e) => update(i, { qty: e.target.value })}
            />
          </div>
          {withCost && (
            <div className="w-28">
              <Input
                type="number"
                min={0}
                placeholder="HPP/unit"
                value={l.cost_price ?? ""}
                onChange={(e) => update(i, { cost_price: e.target.value })}
              />
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
            disabled={lines.length === 1}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setLines([...lines, { product_id: "", qty: "" }])}
      >
        <Plus className="size-4" /> Tambah item
      </Button>
    </div>
  );
}

/** Ubah baris UI → payload item; buang baris tak lengkap. */
function toItems(lines: Line[], withCost?: boolean) {
  return lines
    .filter((l) => l.product_id && Number(l.qty) > 0)
    .map((l) => ({
      product_id: l.product_id,
      qty: Number(l.qty),
      ...(withCost
        ? { cost_price: l.cost_price && l.cost_price !== "" ? Number(l.cost_price) : null }
        : {}),
    }));
}

const STATUS_BADGE: Record<string, { label: string; variant: "outline" | "default" | "secondary" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  dispatched: { label: "Dikirim", variant: "default" },
  received: { label: "Diterima", variant: "outline" },
  cancelled: { label: "Batal", variant: "destructive" },
  approved: { label: "Selesai", variant: "outline" },
};

export function GudangClient({
  activeBranchId,
  activeBranchName,
  products,
  suppliers,
  otherBranches,
  receipts,
  wastages,
  transfers,
}: {
  activeBranchId: string | null;
  activeBranchName: string;
  products: WhProduct[];
  suppliers: SupplierOpt[];
  otherBranches: BranchOpt[];
  receipts: ReceiptRow[];
  wastages: WastageRow[];
  transfers: TransferRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("receipt");
  const [pending, start] = useTransition();

  // Penerimaan
  const [supplierId, setSupplierId] = useState("");
  const [newSupplier, setNewSupplier] = useState("");
  const [rNote, setRNote] = useState("");
  const [rLines, setRLines] = useState<Line[]>([{ product_id: "", qty: "", cost_price: "" }]);

  // Wastage
  const [reason, setReason] = useState("");
  const [wLines, setWLines] = useState<Line[]>([{ product_id: "", qty: "" }]);

  // Transfer
  const [toBranch, setToBranch] = useState("");
  const [tNote, setTNote] = useState("");
  const [tLines, setTLines] = useState<Line[]>([{ product_id: "", qty: "" }]);

  function submitReceipt() {
    const items = toItems(rLines, true);
    if (items.length === 0) return toast.error("Tambahkan item yang valid");
    start(async () => {
      const res = await receiveGoods({ supplier_id: supplierId || "", note: rNote, items });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Penerimaan tersimpan (${res.code})`);
      setRLines([{ product_id: "", qty: "", cost_price: "" }]);
      setRNote("");
      router.refresh();
    });
  }

  function addSupplier() {
    if (!newSupplier.trim()) return;
    start(async () => {
      const res = await createSupplier({ name: newSupplier });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Supplier ditambahkan");
      setNewSupplier("");
      if (res.id) setSupplierId(res.id);
      router.refresh();
    });
  }

  function submitWastage() {
    const items = toItems(wLines);
    if (items.length === 0) return toast.error("Tambahkan item yang valid");
    if (!reason.trim()) return toast.error("Alasan wajib diisi");
    start(async () => {
      const res = await recordWastage({ reason, items });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Barang rusak tercatat (${res.code})`);
      setWLines([{ product_id: "", qty: "" }]);
      setReason("");
      router.refresh();
    });
  }

  function submitTransfer() {
    const items = toItems(tLines);
    if (!toBranch) return toast.error("Pilih cabang tujuan");
    if (items.length === 0) return toast.error("Tambahkan item yang valid");
    start(async () => {
      const res = await createTransfer({ to_branch_id: toBranch, note: tNote, items });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`Transfer dibuat (${res.code})`);
      setTLines([{ product_id: "", qty: "" }]);
      setTNote("");
      router.refresh();
    });
  }

  function doDispatch(id: string) {
    start(async () => {
      const res = await dispatchTransfer(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Transfer dikirim");
      router.refresh();
    });
  }
  function doReceive(id: string) {
    start(async () => {
      const res = await receiveTransfer(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Transfer diterima");
      router.refresh();
    });
  }

  if (!activeBranchId) {
    return <p className="text-sm text-muted-foreground">Cabang aktif tidak ditemukan.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <Button
              key={t.key}
              variant={tab === t.key ? "default" : "outline"}
              size="sm"
              onClick={() => setTab(t.key)}
            >
              <Icon className="size-4" /> {t.label}
            </Button>
          );
        })}
      </div>

      {/* PENERIMAAN */}
      {tab === "receipt" && (
        <Card>
          <CardHeader>
            <CardTitle>Penerimaan Barang — {activeBranchName}</CardTitle>
            <CardDescription>
              Barang masuk dari supplier. Stok bertambah; HPP diperbarui bila diisi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Supplier (opsional)</Label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="">— tanpa supplier —</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label>Tambah supplier baru</Label>
                <div className="flex gap-2">
                  <Input
                    value={newSupplier}
                    onChange={(e) => setNewSupplier(e.target.value)}
                    placeholder="Nama supplier"
                  />
                  <Button type="button" variant="outline" onClick={addSupplier} disabled={pending}>
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Item diterima</Label>
              <LineRows products={products} lines={rLines} setLines={setRLines} withCost />
            </div>
            <div className="grid gap-1.5">
              <Label>Catatan (opsional)</Label>
              <Input value={rNote} onChange={(e) => setRNote(e.target.value)} />
            </div>
            <Button onClick={submitReceipt} disabled={pending}>
              <PackagePlus className="size-4" /> {pending ? "Menyimpan…" : "Terima Barang"}
            </Button>

            <RecentList
              title="Penerimaan terbaru"
              rows={receipts.map((r) => ({
                code: r.code,
                status: r.status,
                meta: r.received_at ? formatTanggalWaktu(r.received_at) : "-",
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* BARANG RUSAK */}
      {tab === "wastage" && (
        <Card>
          <CardHeader>
            <CardTitle>Barang Rusak — {activeBranchName}</CardTitle>
            <CardDescription>
              Catat barang rusak/hilang. Stok berkurang sesuai jumlah.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-1.5">
              <Label>Alasan</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="mis. kadaluarsa, tumpah, rusak"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Item</Label>
              <LineRows products={products} lines={wLines} setLines={setWLines} />
            </div>
            <Button onClick={submitWastage} disabled={pending} variant="destructive">
              <TriangleAlert className="size-4" /> {pending ? "Menyimpan…" : "Catat Barang Rusak"}
            </Button>

            <RecentList
              title="Barang rusak terbaru"
              rows={wastages.map((w) => ({
                code: w.code,
                status: w.status,
                meta: `${w.reason ?? ""} · ${formatTanggalWaktu(w.created_at)}`,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {/* TRANSFER */}
      {tab === "transfer" && (
        <Card>
          <CardHeader>
            <CardTitle>Transfer Stok Antar Cabang</CardTitle>
            <CardDescription>
              Kirim stok dari {activeBranchName} ke cabang lain. Stok keluar saat
              dikirim, masuk saat diterima cabang tujuan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {otherBranches.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Belum ada cabang lain. Tambah cabang di menu Cabang untuk memakai transfer.
              </p>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <Label>Cabang tujuan</Label>
                  <select
                    value={toBranch}
                    onChange={(e) => setToBranch(e.target.value)}
                    className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                  >
                    <option value="">Pilih cabang…</option>
                    {otherBranches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label>Item</Label>
                  <LineRows products={products} lines={tLines} setLines={setTLines} />
                </div>
                <div className="grid gap-1.5">
                  <Label>Catatan (opsional)</Label>
                  <Input value={tNote} onChange={(e) => setTNote(e.target.value)} />
                </div>
                <Button onClick={submitTransfer} disabled={pending}>
                  <ArrowRightLeft className="size-4" /> {pending ? "Menyimpan…" : "Buat Transfer"}
                </Button>
              </>
            )}

            {transfers.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-semibold">Daftar transfer</p>
                {transfers.map((t) => (
                  <div
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={STATUS_BADGE[t.status]?.variant ?? "secondary"}>
                        {STATUS_BADGE[t.status]?.label ?? t.status}
                      </Badge>
                      <span className="font-mono text-xs">{t.code}</span>
                      <span className="text-muted-foreground">
                        {t.from_name} → {t.to_name}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {t.status === "draft" && t.from_branch_id === activeBranchId && (
                        <Button size="sm" variant="outline" onClick={() => doDispatch(t.id)} disabled={pending}>
                          <Send className="size-3.5" /> Kirim
                        </Button>
                      )}
                      {t.status === "dispatched" && t.to_branch_id === activeBranchId && (
                        <Button size="sm" onClick={() => doReceive(t.id)} disabled={pending}>
                          <Download className="size-3.5" /> Terima
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RecentList({
  title,
  rows,
}: {
  title: string;
  rows: { code: string; status: string; meta: string }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="space-y-1.5 border-t pt-3">
      <p className="text-sm font-semibold">{title}</p>
      {rows.map((r, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center justify-between gap-2 border-b pb-1.5 text-sm last:border-0",
          )}
        >
          <span className="font-mono text-xs">{r.code}</span>
          <span className="flex-1 truncate px-2 text-xs text-muted-foreground">{r.meta}</span>
          <Badge variant={STATUS_BADGE[r.status]?.variant ?? "outline"}>
            {STATUS_BADGE[r.status]?.label ?? r.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}
