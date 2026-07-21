"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ImageIcon,
  LayoutGrid,
  List,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { deleteProduct } from "./actions";
import type { ProductListItem } from "./page";
import { ProductFormDialog } from "./product-form";
import { formatNumber, formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type StockStatus = "in" | "low" | "out";

function stockStatus(p: ProductListItem): StockStatus {
  if (p.stock <= 0) return "out";
  if (p.stock <= p.min_stock) return "low";
  return "in";
}

function StockBadge({ p }: { p: ProductListItem }) {
  const s = stockStatus(p);
  if (s === "out") return <Badge variant="destructive">Habis</Badge>;
  if (s === "low")
    return (
      <Badge variant="secondary" className="text-amber-600">
        Menipis
      </Badge>
    );
  return <Badge variant="outline">Tersedia</Badge>;
}

export function ProductsClient({
  products,
  categories,
  isAdmin,
  canCreate,
  canEdit,
  canDelete,
}: {
  products: ProductListItem[];
  categories: { id: string; name: string }[];
  isAdmin: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [stock, setStock] = useState("all");
  const [view, setView] = useState<"grid" | "table">("grid");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProductListItem | undefined>(undefined);
  const [deleting, setDeleting] = useState<ProductListItem | null>(null);

  const categoryName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const hay = `${p.name} ${p.sku} ${p.barcode ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (category !== "all" && p.category_id !== category) return false;
      if (stock !== "all" && stockStatus(p) !== stock) return false;
      return true;
    });
  }, [products, query, category, stock]);

  function refresh() {
    router.refresh();
  }

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }
  function openEdit(p: ProductListItem) {
    setEditing(p);
    setFormOpen(true);
  }

  function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    startTransition(async () => {
      const res = await deleteProduct(target.id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Produk dihapus");
      setDeleting(null);
      refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Produk</CardTitle>
            <CardDescription>
              {products.length} produk terdaftar
            </CardDescription>
          </div>
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="size-4" /> Tambah Produk
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama, SKU, atau barcode…"
                className="pl-8"
              />
            </div>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v ?? "all")}
            >
              <SelectTrigger className="sm:w-44">
                <SelectValue>
                  {(val: string | null) =>
                    !val || val === "all"
                      ? "Semua kategori"
                      : (categories.find((c) => c.id === val)?.name ??
                        "Kategori")
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua kategori</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stock} onValueChange={(v) => setStock(v ?? "all")}>
              <SelectTrigger className="sm:w-40">
                <SelectValue>
                  {(val: string | null) =>
                    val === "in"
                      ? "Tersedia"
                      : val === "low"
                        ? "Menipis"
                        : val === "out"
                          ? "Habis"
                          : "Semua stok"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua stok</SelectItem>
                <SelectItem value="in">Tersedia</SelectItem>
                <SelectItem value="low">Menipis</SelectItem>
                <SelectItem value="out">Habis</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button
                variant={view === "grid" ? "default" : "outline"}
                size="icon"
                onClick={() => setView("grid")}
              >
                <LayoutGrid className="size-4" />
              </Button>
              <Button
                variant={view === "table" ? "default" : "outline"}
                size="icon"
                onClick={() => setView("table")}
              >
                <List className="size-4" />
              </Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <Package className="size-10" />
              <p>Tidak ada produk yang cocok.</p>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((p) => (
                <div
                  key={p.id}
                  className="flex flex-col overflow-hidden rounded-lg border bg-card"
                >
                  <div className="relative aspect-square bg-muted">
                    {p.image_url ? (
                      <Image
                        src={p.image_url}
                        alt={p.name}
                        fill
                        sizes="(max-width:640px) 50vw, 25vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <ImageIcon className="size-8" />
                      </div>
                    )}
                    {!p.is_active && (
                      <Badge
                        variant="secondary"
                        className="absolute top-1.5 left-1.5"
                      >
                        Nonaktif
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                    <p className="mt-1 font-semibold">
                      {formatRupiah(p.sell_price)}
                    </p>
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        Stok {formatNumber(p.stock)} {p.unit}
                      </span>
                      <StockBadge p={p} />
                    </div>
                    {(canEdit || canDelete) && (
                      <div className="mt-2 flex gap-1">
                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => openEdit(p)}
                          >
                            <Pencil className="size-3.5" /> Edit
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => setDeleting(p)}
                          >
                            <Trash2 className="size-3.5 text-destructive" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead>Nama</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Kategori</TableHead>
                    <TableHead className="text-right">Harga</TableHead>
                    <TableHead className="text-right">Stok</TableHead>
                    <TableHead>Status</TableHead>
                    {(canEdit || canDelete) && (
                      <TableHead className="w-24">Aksi</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="relative size-10 overflow-hidden rounded bg-muted">
                          {p.image_url ? (
                            <Image
                              src={p.image_url}
                              alt={p.name}
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-muted-foreground">
                              <ImageIcon className="size-4" />
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.sku}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.category_id
                          ? (categoryName.get(p.category_id) ?? "-")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatRupiah(p.sell_price)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(p.stock)}
                      </TableCell>
                      <TableCell>
                        <StockBadge p={p} />
                      </TableCell>
                      {(canEdit || canDelete) && (
                        <TableCell>
                          <div className="flex gap-1">
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => openEdit(p)}
                              >
                                <Pencil className="size-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => setDeleting(p)}
                              >
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {formOpen && (
        <ProductFormDialog
          key={editing?.id ?? "create"}
          mode={editing ? "edit" : "create"}
          product={editing}
          categories={categories}
          isAdmin={isAdmin}
          open={formOpen}
          onOpenChange={setFormOpen}
          onSaved={refresh}
        />
      )}

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus produk?</DialogTitle>
            <DialogDescription>
              Produk “{deleting?.name}” akan disembunyikan dari kasir. Histori
              transaksi tetap tersimpan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? "Menghapus…" : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
