"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ClipboardList, PackagePlus, Plus, Search, SlidersHorizontal } from "lucide-react";

import { adjustStock, createOpname, restockProduct } from "./actions";
import type { InvMovement, InvOpname, InvProduct } from "./page";
import { formatNumber } from "@/lib/format";
import { formatTanggalRingkas } from "@/lib/date";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const MOVEMENT_LABELS: Record<string, string> = {
  initial: "Stok awal",
  sale: "Penjualan",
  void: "Void",
  refund: "Refund",
  opname: "Opname",
  adjustment: "Koreksi",
  restock: "Barang masuk",
};

type Tab = "stok" | "riwayat" | "opname";

function stockStatus(p: InvProduct): "in" | "low" | "out" {
  if (p.stock <= 0) return "out";
  if (p.stock <= p.min_stock) return "low";
  return "in";
}

export function InventoryClient({
  products,
  movements,
  opnames,
  isAdmin,
  canOpname,
}: {
  products: InvProduct[];
  movements: InvMovement[];
  opnames: InvOpname[];
  isAdmin: boolean;
  canOpname: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("stok");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [restockTarget, setRestockTarget] = useState<InvProduct | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<InvProduct | null>(null);
  const [pending, start] = useTransition();

  const lowStock = products.filter((p) => stockStatus(p) !== "in");

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      `${p.name} ${p.sku}`.toLowerCase().includes(q),
    );
  }, [products, search]);

  const filteredMovements = useMemo(
    () =>
      typeFilter === "all"
        ? movements
        : movements.filter((m) => m.type === typeFilter),
    [movements, typeFilter],
  );

  function startOpname() {
    start(async () => {
      const res = await createOpname();
      if (res.error || !res.id) {
        toast.error(res.error ?? "Gagal memulai opname");
        return;
      }
      router.push(`/inventory/opname/${res.id}`);
    });
  }

  return (
    <div className="space-y-4">
      {lowStock.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4" />
          {lowStock.length} produk stoknya menipis/habis.
        </div>
      )}

      <div className="flex gap-1.5">
        <TabButton active={tab === "stok"} onClick={() => setTab("stok")}>
          Stok Produk
        </TabButton>
        <TabButton active={tab === "riwayat"} onClick={() => setTab("riwayat")}>
          Riwayat
        </TabButton>
        <TabButton active={tab === "opname"} onClick={() => setTab("opname")}>
          Stock Opname
        </TabButton>
      </div>

      {tab === "stok" && (
        <Card>
          <CardHeader>
            <CardTitle>Stok Produk</CardTitle>
            <CardDescription>Pantau & kelola stok.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative max-w-sm">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari produk…"
                className="pl-8"
              />
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead className="text-right">Min</TableHead>
                    <TableHead>Status</TableHead>
                    {isAdmin && <TableHead className="w-40">Aksi</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((p) => {
                    const s = stockStatus(p);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {p.sku}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(p.stock)} {p.unit}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatNumber(p.min_stock)}
                        </TableCell>
                        <TableCell>
                          {s === "out" ? (
                            <Badge variant="destructive">Habis</Badge>
                          ) : s === "low" ? (
                            <Badge variant="secondary" className="text-amber-600">
                              Menipis
                            </Badge>
                          ) : (
                            <Badge variant="outline">Tersedia</Badge>
                          )}
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRestockTarget(p)}
                              >
                                <PackagePlus className="size-3.5" /> Masuk
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAdjustTarget(p)}
                              >
                                <SlidersHorizontal className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "riwayat" && (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat Pergerakan Stok</CardTitle>
            <CardDescription>200 pergerakan terakhir.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v ?? "all")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua tipe</SelectItem>
                {Object.entries(MOVEMENT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Produk</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead className="text-right">Perubahan</TableHead>
                    <TableHead className="text-right">Stok Akhir</TableHead>
                    <TableHead>Catatan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMovements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatTanggalRingkas(m.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">{m.product_name}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {MOVEMENT_LABELS[m.type] ?? m.type}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium",
                          m.qty_change >= 0 ? "text-emerald-600" : "text-destructive",
                        )}
                      >
                        {m.qty_change >= 0 ? "+" : ""}
                        {formatNumber(m.qty_change)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(m.stock_after)}
                      </TableCell>
                      <TableCell className="max-w-40 truncate text-muted-foreground">
                        {m.note ?? "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "opname" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle>Stock Opname</CardTitle>
              <CardDescription>
                Penghitungan fisik & penyesuaian stok.
              </CardDescription>
            </div>
            {canOpname && (
              <Button onClick={startOpname} disabled={pending}>
                <Plus className="size-4" /> Mulai Opname
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {opnames.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Belum ada sesi opname.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kode</TableHead>
                      <TableHead>Dibuat</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {opnames.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.code}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatTanggalRingkas(o.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={o.status === "completed" ? "outline" : "secondary"}
                          >
                            {o.status === "completed" ? "Selesai" : "Draft"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            render={
                              <Link href={`/inventory/opname/${o.id}`}>
                                <ClipboardList className="size-4" />{" "}
                                {o.status === "completed" ? "Lihat" : "Lanjut"}
                              </Link>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {restockTarget && (
        <RestockDialog
          product={restockTarget}
          onOpenChange={(o) => !o && setRestockTarget(null)}
          onDone={() => {
            setRestockTarget(null);
            router.refresh();
          }}
        />
      )}
      {adjustTarget && (
        <AdjustDialog
          product={adjustTarget}
          onOpenChange={(o) => !o && setAdjustTarget(null)}
          onDone={() => {
            setAdjustTarget(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm font-medium transition",
        active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function RestockDialog({
  product,
  onOpenChange,
  onDone,
}: {
  product: InvProduct;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await restockProduct({
        product_id: product.id,
        qty: Number(qty) || 0,
        new_cost: cost === "" ? null : Number(cost),
        note,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Stok bertambah");
      onDone();
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Barang Masuk</DialogTitle>
          <DialogDescription>
            {product.name} · stok saat ini {formatNumber(product.stock)} {product.unit}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="rq">Jumlah masuk</Label>
            <Input id="rq" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rc">Harga modal baru (opsional)</Label>
            <Input id="rc" type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Biarkan kosong jika tetap" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="rn">Catatan</Label>
            <Input id="rn" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. dari supplier X" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending || !qty}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({
  product,
  onOpenChange,
  onDone,
}: {
  product: InvProduct;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState(String(product.stock));
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      const res = await adjustStock({
        product_id: product.id,
        new_qty: Number(qty) || 0,
        note,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Stok disesuaikan");
      onDone();
    });
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Koreksi Stok</DialogTitle>
          <DialogDescription>
            {product.name} · stok saat ini {formatNumber(product.stock)} {product.unit}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-2">
            <Label htmlFor="aq">Stok baru (nilai akhir)</Label>
            <Input id="aq" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="an">Catatan</Label>
            <Input id="an" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. barang rusak" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
