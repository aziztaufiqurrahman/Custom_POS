"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save, Search } from "lucide-react";

import { completeOpname, saveOpnameDraft } from "../../actions";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type OpnameRow = {
  product_id: string;
  name: string;
  sku: string;
  unit: string;
  system_qty: number;
  physical_qty: number;
  reason: string;
};

type EditRow = OpnameRow & { physical: string };

export function OpnameClient({
  opnameId,
  code,
  status,
  canEdit,
  initialRows,
}: {
  opnameId: string;
  code: string;
  status: "draft" | "completed";
  canEdit: boolean;
  initialRows: OpnameRow[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<EditRow[]>(
    initialRows.map((r) => ({ ...r, physical: String(r.physical_qty) })),
  );
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, start] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => `${r.name} ${r.sku}`.toLowerCase().includes(q));
  }, [rows, search]);

  function diffOf(r: EditRow): number {
    return (Number(r.physical) || 0) - r.system_qty;
  }

  function setPhysical(id: string, val: string) {
    setRows((prev) =>
      prev.map((r) => (r.product_id === id ? { ...r, physical: val } : r)),
    );
  }
  function setReason(id: string, val: string) {
    setRows((prev) =>
      prev.map((r) => (r.product_id === id ? { ...r, reason: val } : r)),
    );
  }

  const changedCount = rows.filter((r) => diffOf(r) !== 0).length;
  const missingReason = rows.some(
    (r) => diffOf(r) !== 0 && r.reason.trim() === "",
  );

  function toItems() {
    return rows.map((r) => ({
      product_id: r.product_id,
      physical_qty: Number(r.physical) || 0,
      reason: r.reason,
    }));
  }

  function saveDraft() {
    start(async () => {
      const res = await saveOpnameDraft({
        opname_id: opnameId,
        items: rows.map((r) => ({
          product_id: r.product_id,
          physical_qty: Number(r.physical) || 0,
          difference: diffOf(r),
          system_qty: r.system_qty,
          reason: r.reason,
        })),
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Draft tersimpan");
    });
  }

  function finish() {
    if (missingReason) {
      toast.error("Isi alasan untuk setiap selisih");
      return;
    }
    start(async () => {
      const res = await completeOpname({ opname_id: opnameId, items: toItems() });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Opname selesai & stok disesuaikan");
      router.push("/inventory");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              render={
                <Link href="/inventory">
                  <ArrowLeft className="size-4" />
                </Link>
              }
            />
            <div>
              <CardTitle className="flex items-center gap-2">
                {code}
                <Badge variant={status === "completed" ? "outline" : "secondary"}>
                  {status === "completed" ? "Selesai" : "Draft"}
                </Badge>
              </CardTitle>
              <CardDescription>
                {canEdit
                  ? "Masukkan hasil hitung fisik. Selisih wajib beralasan."
                  : "Ringkasan hasil opname."}
              </CardDescription>
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={saveDraft} disabled={pending}>
                <Save className="size-4" /> Simpan Draft
              </Button>
              <Button onClick={() => setConfirmOpen(true)} disabled={pending}>
                Selesaikan ({changedCount})
              </Button>
            </div>
          )}
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
                  <TableHead>Produk</TableHead>
                  <TableHead className="text-right">Sistem</TableHead>
                  <TableHead className="text-right">Fisik</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                  <TableHead>Alasan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const diff = diffOf(r);
                  return (
                    <TableRow key={r.product_id}>
                      <TableCell className="font-medium">
                        {r.name}
                        {r.sku && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            {r.sku}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(r.system_qty)}
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit ? (
                          <Input
                            type="number"
                            min={0}
                            value={r.physical}
                            onChange={(e) =>
                              setPhysical(r.product_id, e.target.value)
                            }
                            className="ml-auto h-8 w-24 text-right"
                          />
                        ) : (
                          formatNumber(r.physical_qty)
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-medium",
                          diff === 0
                            ? "text-muted-foreground"
                            : diff > 0
                              ? "text-emerald-600"
                              : "text-destructive",
                        )}
                      >
                        {diff > 0 ? "+" : ""}
                        {formatNumber(diff)}
                      </TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Input
                            value={r.reason}
                            onChange={(e) => setReason(r.product_id, e.target.value)}
                            placeholder={diff !== 0 ? "Wajib diisi" : "-"}
                            className={cn(
                              "h-8",
                              diff !== 0 && r.reason.trim() === "" && "border-destructive",
                            )}
                          />
                        ) : (
                          <span className="text-muted-foreground">
                            {r.reason || "-"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Selesaikan opname?</DialogTitle>
            <DialogDescription>
              {changedCount} produk akan disesuaikan stoknya sesuai hitungan fisik
              dan tercatat permanen. Lanjutkan?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={pending}
            >
              Batal
            </Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                finish();
              }}
              disabled={pending}
            >
              Ya, Selesaikan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
