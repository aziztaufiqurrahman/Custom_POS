"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Search, Store } from "lucide-react";

import { updateBranchProduct } from "./actions";
import type { BranchProductRow } from "./page";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Pagination, usePagination } from "@/components/ui/pagination";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Draft = { price: number; min_stock: string; is_active: boolean };

export function HargaCabangClient({
  branchName,
  rows,
}: {
  branchName: string;
  rows: BranchProductRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      rows.map((r) => [
        r.product_id,
        { price: r.price, min_stock: String(r.min_stock), is_active: r.is_active },
      ]),
    ),
  );

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      r.sku.toLowerCase().includes(query.toLowerCase()),
  );
  const pg = usePagination(filtered, 12);

  function dirty(r: BranchProductRow): boolean {
    const d = drafts[r.product_id];
    return (
      d.price !== r.price ||
      Number(d.min_stock) !== r.min_stock ||
      d.is_active !== r.is_active
    );
  }

  function save(r: BranchProductRow) {
    const d = drafts[r.product_id];
    setSavingId(r.product_id);
    start(async () => {
      const res = await updateBranchProduct({
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

  function patch(id: string, p: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="size-5 text-primary" /> Harga &amp; Stok per Cabang
        </CardTitle>
        <CardDescription>
          Atur harga jual, stok minimum, dan status aktif produk untuk cabang{" "}
          <b>{branchName}</b>. Stok diubah lewat menu Gudang/Inventory.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-xs">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari produk / SKU"
            className="pl-8"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-2">Produk</th>
                <th className="py-2 pr-2">Stok</th>
                <th className="py-2 pr-2">Harga jual</th>
                <th className="py-2 pr-2">Stok min.</th>
                <th className="py-2 pr-2">Aktif</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.map((r) => {
                const d = drafts[r.product_id];
                const isDirty = dirty(r);
                return (
                  <tr key={r.product_id} className="border-t">
                    <td className="py-2 pr-2">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">{r.sku}</p>
                    </td>
                    <td className="py-2 pr-2 text-muted-foreground">
                      {formatNumber(r.stock)} {r.unit}
                    </td>
                    <td className="py-2 pr-2">
                      <RupiahInput
                        value={d.price}
                        onValueChange={(v) => patch(r.product_id, { price: v })}
                        className="h-8 w-32"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Input
                        type="number"
                        min={0}
                        value={d.min_stock}
                        onChange={(e) => patch(r.product_id, { min_stock: e.target.value })}
                        className="h-8 w-20"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <Switch
                        checked={d.is_active}
                        onCheckedChange={(v) => patch(r.product_id, { is_active: v })}
                      />
                    </td>
                    <td className="py-2">
                      <Button
                        size="sm"
                        variant={isDirty ? "default" : "outline"}
                        disabled={!isDirty || (pending && savingId === r.product_id)}
                        onClick={() => save(r)}
                        className={cn(!isDirty && "opacity-50")}
                      >
                        <Check className="size-3.5" />
                        {pending && savingId === r.product_id ? "…" : "Simpan"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada produk.
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
    </Card>
  );
}
