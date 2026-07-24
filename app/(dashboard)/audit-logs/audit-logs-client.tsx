"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { AuditRow } from "./page";
import { formatRupiah } from "@/lib/format";
import { formatTanggalRingkas } from "@/lib/date";

const META_LABELS: Record<string, string> = {
  code: "Kode",
  grand_total: "Total",
  method: "Metode",
  reason: "Alasan",
  email: "Email",
  role: "Peran",
  qty: "Jumlah",
  new_cost: "HPP baru",
  from: "Dari",
  to: "Ke",
  changed: "Produk berubah",
  opening_balance: "Uang awal",
  expected_cash: "Kas seharusnya",
  counted_cash: "Dihitung",
  variance: "Selisih",
  sku: "SKU",
  name: "Nama",
  permissions: "Izin",
  bank: "Bank",
};

const MONEY_KEYS = new Set([
  "grand_total",
  "new_cost",
  "opening_balance",
  "expected_cash",
  "counted_cash",
  "variance",
]);

/** Ubah metadata (jsonb) menjadi teks terbaca, mis. "Kode: TRX-…, Total: Rp10.000". */
function formatMetadata(meta: Record<string, unknown> | null): string {
  if (!meta) return "-";
  const entries = Object.entries(meta).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return "-";
  return entries
    .map(([k, v]) => {
      const label = META_LABELS[k] ?? k;
      let val: string;
      if (Array.isArray(v)) val = v.length ? v.join(", ") : "-";
      else if (MONEY_KEYS.has(k) && typeof v === "number") val = formatRupiah(v);
      else val = String(v);
      return `${label}: ${val}`;
    })
    .join(" · ");
}
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pagination, usePagination } from "@/components/ui/pagination";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Login",
  "employee.create": "Tambah karyawan",
  "employee.update": "Ubah karyawan",
  "employee.activate": "Aktifkan karyawan",
  "employee.deactivate": "Nonaktifkan karyawan",
  "product.create": "Tambah produk",
  "product.update": "Ubah produk",
  "product.delete": "Hapus produk",
  "stock.restock": "Barang masuk",
  "stock.adjust": "Koreksi stok",
  "stock.opname_complete": "Opname selesai",
  "shift.open": "Buka shift",
  "shift.close": "Tutup shift",
  "sale.create": "Penjualan",
  "sale.void": "Void transaksi",
  "sale.refund": "Refund transaksi",
  "settings.profile_update": "Ubah profil toko",
  "settings.tax_update": "Ubah pajak",
  "settings.bank_update": "Ubah rekening",
  "settings.qris_update": "Ubah QRIS",
};

export function AuditLogsClient({
  rows,
  filters,
}: {
  rows: AuditRow[];
  filters: { from: string; to: string; action: string };
}) {
  const router = useRouter();
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [action, setAction] = useState(filters.action);
  const pg = usePagination(rows, 20);

  function apply() {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (action) p.set("action", action);
    router.push(`/audit-logs?${p.toString()}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label className="text-xs">Dari</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Sampai</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Aksi</Label>
            <Input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
              placeholder="mis. sale / product"
            />
          </div>
          <Button onClick={apply}>Terapkan</Button>
          <Button variant="outline" onClick={() => router.push("/audit-logs")}>
            Reset
          </Button>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Waktu</TableHead>
                <TableHead>Aktor</TableHead>
                <TableHead>Aksi</TableHead>
                <TableHead>Entitas</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Tidak ada catatan.
                  </TableCell>
                </TableRow>
              ) : (
                pg.pageItems.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatTanggalRingkas(r.created_at)}
                    </TableCell>
                    <TableCell>{r.actor_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{ACTION_LABELS[r.action] ?? r.action}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.entity ?? "-"}</TableCell>
                    <TableCell className="max-w-80 text-xs text-muted-foreground">
                      {formatMetadata(r.metadata)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <Pagination
          page={pg.page}
          totalPages={pg.totalPages}
          from={pg.from}
          to={pg.to}
          total={pg.total}
          onPage={pg.setPage}
          unit="catatan"
        />
      </CardContent>
    </Card>
  );
}
