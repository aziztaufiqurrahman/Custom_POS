"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Lock, Search, Send, Store } from "lucide-react";

import { requestPriceChange, setBranchPrice } from "./actions";
import type { BranchProductRow } from "./page";
import { formatNumber, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Pagination, usePagination } from "@/components/ui/pagination";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Draft = {
  price: number;
  min_stock: string;
  is_active: boolean;
};

export function HargaCabangClient({
  isMaster,
  branches,
  selectedBranchId,
  rows,
  pendingPrice,
}: {
  isMaster: boolean;
  branches: { id: string; name: string }[];
  selectedBranchId: string | null;
  rows: BranchProductRow[];
  pendingPrice: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  function buildDrafts(list: BranchProductRow[]): Record<string, Draft> {
    return Object.fromEntries(
      list.map((r) => [
        r.product_id,
        {
          price: r.price,
          min_stock: String(r.min_stock),
          is_active: r.is_active,
        },
      ]),
    );
  }
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    buildDrafts(rows),
  );
  // Saat ganti cabang / data di-refresh, rows berubah → bangun ulang draft agar
  // tidak mengakses produk cabang lama (penyebab crash "cannot read price").
  useEffect(() => {
    setDrafts(buildDrafts(rows));
  }, [rows]);

  // Dialog pengajuan harga (mode manajer).
  const [proposeFor, setProposeFor] = useState<BranchProductRow | null>(null);
  const [proposePrice, setProposePrice] = useState(0);
  const [proposeReason, setProposeReason] = useState("");

  const branchName =
    branches.find((b) => b.id === selectedBranchId)?.name ?? "Cabang";

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      r.sku.toLowerCase().includes(query.toLowerCase()),
  );
  const pg = usePagination(filtered, 12);

  function onBranchChange(id: string) {
    router.push(`/harga-cabang?branch=${id}`);
  }

  function dirty(r: BranchProductRow): boolean {
    const d = drafts[r.product_id];
    if (!d) return false;
    return (
      d.price !== r.price ||
      Number(d.min_stock) !== r.min_stock ||
      d.is_active !== r.is_active
    );
  }

  function patch(id: string, p: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  function save(r: BranchProductRow) {
    if (!selectedBranchId) return;
    const d = drafts[r.product_id];
    setSavingId(r.product_id);
    start(async () => {
      const res = await setBranchPrice({
        branch_id: selectedBranchId,
        product_id: r.product_id,
        price: d.price,
        min_stock: Number(d.min_stock) || 0,
        is_active: d.is_active,
      });
      setSavingId(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(`${r.name} disimpan`);
      router.refresh();
    });
  }

  function openPropose(r: BranchProductRow) {
    setProposeFor(r);
    setProposePrice(r.price);
    setProposeReason("");
  }

  function submitPropose() {
    if (!proposeFor || !selectedBranchId) return;
    start(async () => {
      const res = await requestPriceChange({
        branch_id: selectedBranchId,
        product_id: proposeFor.product_id,
        new_price: proposePrice,
        reason: proposeReason,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Pengajuan harga dikirim, menunggu persetujuan pusat");
      setProposeFor(null);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="size-5 text-primary" /> Harga &amp; Stok Cabang
        </CardTitle>
        <CardDescription>
          {isMaster
            ? "Pilih cabang, lalu atur harga jual, stok minimum & status per produk. Stok (kolom Stok) terkunci — keluar/masuk lewat Gudang & Inventory."
            : "Harga berjalan terkunci. Ajukan perubahan harga; berlaku setelah disetujui pusat."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Selektor cabang eksplisit */}
          <div className="flex items-center gap-2">
            <Store className="size-4 text-muted-foreground" />
            <Select
              value={selectedBranchId ?? undefined}
              onValueChange={(v) => {
                if (v) onBranchChange(v);
              }}
            >
              <SelectTrigger className="w-56">
                <SelectValue>
                  {() => branchName}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari produk / SKU"
              className="pl-8"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">Produk</th>
                <th className="py-2 pr-2">Harga jual</th>
                <th className="py-2 pr-2">Stok</th>
                <th className="py-2 pr-2">Stok min.</th>
                <th className="py-2 pr-2">Aktif</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((r) => {
                const d = drafts[r.product_id] ?? {
                  price: r.price,
                  min_stock: String(r.min_stock),
                  is_active: r.is_active,
                };
                const isDirty = dirty(r);
                const proposed = pendingPrice[r.product_id];
                return (
                  <tr key={r.product_id} className="border-t align-top">
                    <td className="py-2 pr-2">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.sku}</p>
                    </td>

                    {isMaster ? (
                      <>
                        <td className="py-2 pr-2">
                          <RupiahInput
                            value={d.price}
                            onValueChange={(v) => patch(r.product_id, { price: v })}
                            className="h-8 w-32"
                          />
                        </td>
                        <td className="py-2 pr-2 text-muted-foreground">
                          {formatNumber(r.stock)} {r.unit}
                        </td>
                        <td className="py-2 pr-2">
                          <Input
                            type="number"
                            min={0}
                            value={d.min_stock}
                            onChange={(e) =>
                              patch(r.product_id, { min_stock: e.target.value })
                            }
                            className="h-8 w-20"
                          />
                        </td>
                        <td className="py-2 pr-2">
                          <Switch
                            checked={d.is_active}
                            onCheckedChange={(v) =>
                              patch(r.product_id, { is_active: v })
                            }
                          />
                        </td>
                        <td className="py-2">
                          <Button
                            size="sm"
                            variant={isDirty ? "default" : "outline"}
                            disabled={
                              !isDirty || (pending && savingId === r.product_id)
                            }
                            onClick={() => save(r)}
                            className={cn(!isDirty && "opacity-50")}
                          >
                            <Check className="size-3.5" />
                            {pending && savingId === r.product_id ? "…" : "Simpan"}
                          </Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-2 pr-2">
                          <span className="inline-flex items-center gap-1 font-medium">
                            <Lock className="size-3 text-muted-foreground" />
                            {formatRupiah(r.price)}
                          </span>
                          {proposed != null && (
                            <p className="text-xs text-amber-600">
                              Diajukan: {formatRupiah(proposed)}
                            </p>
                          )}
                        </td>
                        <td className="py-2 pr-2 text-muted-foreground">
                          {formatNumber(r.stock)} {r.unit}
                        </td>
                        <td className="py-2 pr-2 text-muted-foreground">
                          {formatNumber(r.min_stock)}
                        </td>
                        <td className="py-2 pr-2">
                          {r.is_active ? (
                            <Badge variant="outline">Aktif</Badge>
                          ) : (
                            <Badge variant="secondary">Nonaktif</Badge>
                          )}
                        </td>
                        <td className="py-2">
                          {proposed != null ? (
                            <Badge variant="secondary" className="text-amber-600">
                              Menunggu
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openPropose(r)}
                            >
                              <Send className="size-3.5" /> Ajukan
                            </Button>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada produk di cabang ini.
            </p>
          )}
        </div>
        <Pagination
          page={pg.page}
          totalPages={pg.totalPages}
          from={pg.from}
          to={pg.to}
          total={pg.total}
          onPage={pg.setPage}
          unit="produk"
        />
      </CardContent>

      {/* Dialog pengajuan harga (manajer) */}
      <Dialog
        open={!!proposeFor}
        onOpenChange={(o) => !o && setProposeFor(null)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajukan Perubahan Harga</DialogTitle>
            <DialogDescription>
              {proposeFor?.name} — harga berjalan {formatRupiah(proposeFor?.price ?? 0)}.
              Perubahan berlaku setelah disetujui pusat.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Harga usulan (Rp)</Label>
              <RupiahInput value={proposePrice} onValueChange={setProposePrice} />
            </div>
            <div className="grid gap-2">
              <Label>Alasan (opsional)</Label>
              <Textarea
                rows={2}
                value={proposeReason}
                onChange={(e) => setProposeReason(e.target.value)}
                placeholder="mis. penyesuaian harga bahan"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setProposeFor(null)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button onClick={submitPropose} disabled={pending}>
              <Send className="size-4" /> Kirim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
