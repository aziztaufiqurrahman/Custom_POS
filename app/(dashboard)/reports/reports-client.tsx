"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Printer, TriangleAlert } from "lucide-react";

import type { ReportData } from "./page";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatRupiah, formatNumber } from "@/lib/format";
import { formatTanggalRingkas } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Pagination, usePagination } from "@/components/ui/pagination";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const CHART_COLORS = ["#9c6a44", "#7a9b5e", "#d99a55", "#c2704a", "#5aa9e6", "#b57edc"];

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_LABEL: Record<string, string> = {
  completed: "Selesai",
  void: "Void",
  refunded: "Refund",
};

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function ReportsClient({ data }: { data: ReportData }) {
  const router = useRouter();
  const [from, setFrom] = useState(data.filters.from);
  const [to, setTo] = useState(data.filters.to);
  const [branch, setBranch] = useState(data.filters.branch);
  const s = data.summary;

  function apply() {
    const q = new URLSearchParams({ from, to, branch });
    router.push(`/reports?${q.toString()}`);
  }

  function exportTransaksi() {
    downloadCsv(`transaksi-${from}_${to}.csv`, [
      ["Kode", "Waktu", "Cabang", "Kasir", "Total", "Status"],
      ...data.transactions.map((t) => [
        t.code,
        formatTanggalRingkas(t.created_at),
        t.branch_name,
        t.cashier_name,
        t.grand_total,
        STATUS_LABEL[t.status] ?? t.status,
      ]),
    ]);
  }

  function exportLedger() {
    downloadCsv(`stok-ledger-${from}_${to}.csv`, [
      ["Waktu", "Produk", "Tipe", "Perubahan", "Stok Akhir", "Catatan"],
      ...data.ledger.map((l) => [
        formatTanggalRingkas(l.created_at),
        l.product_name,
        l.type,
        l.qty_change,
        l.stock_after,
        l.note ?? "",
      ]),
    ]);
  }

  const methodData = Object.entries(s.byMethod).map(([k, v]) => ({
    name: PAYMENT_METHOD_LABELS[k as keyof typeof PAYMENT_METHOD_LABELS] ?? k,
    value: v,
  }));

  const txPg = usePagination(data.transactions, 15);
  const ledPg = usePagination(data.ledger, 15);

  return (
    <div className="space-y-4">
      <style>{`@media print { aside, header, .no-print { display:none !important } main { padding:0 !important } }`}</style>

      {/* Filter */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle>Laporan</CardTitle>
          <CardDescription>
            Ringkasan keuangan, transaksi, dan pergerakan stok. Ekspor CSV/Excel atau
            cetak PDF.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Dari</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Sampai</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </div>
            {data.branches.length > 1 && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Cabang</Label>
                <select
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="h-9 rounded-md border bg-transparent px-2 text-sm"
                >
                  <option value="all">Semua cabang</option>
                  {data.branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            )}
            <Button onClick={apply}>Terapkan</Button>
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" /> Cetak / PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pendapatan" value={formatRupiah(s.revenue)} sub={`${s.txCount} transaksi`} />
        <Kpi label="Rata-rata / transaksi" value={formatRupiah(s.avg)} />
        <Kpi label="Item terjual" value={formatNumber(s.itemsSold)} />
        <Kpi
          label="Laba kotor (est.)"
          value={s.grossProfit === null ? "—" : formatRupiah(s.grossProfit)}
          sub={s.grossProfit === null ? "khusus master admin" : "pendapatan − HPP"}
        />
      </div>

      {/* Grafik */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pendapatan Harian</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {data.trend.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Tidak ada data.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.trend}>
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(8)} fontSize={11} />
                    <YAxis tickFormatter={(v: number) => `${v / 1000}k`} fontSize={11} width={40} />
                    <Tooltip
                      formatter={(v) => formatRupiah(Number(v))}
                      labelFormatter={(l) => `Tanggal ${l}`}
                    />
                    <Bar dataKey="revenue" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metode Pembayaran</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {methodData.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Tidak ada data.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={methodData} dataKey="value" nameKey="name" outerRadius={90} label>
                      {methodData.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatRupiah(Number(v))} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exception */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TriangleAlert className="size-4 text-amber-500" /> Panel Pengecualian
          </CardTitle>
          <CardDescription>Indikator berisiko pada rentang ini.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Void" value={String(s.voidCount)} />
          <Kpi label="Refund" value={String(s.refundCount)} />
          <Kpi label="Shift selisih kas" value={String(data.variances.length)} />
          <Kpi label="Total selisih kas" value={formatRupiah(s.totalVariance)} />
        </CardContent>
      </Card>

      {/* Produk terlaris */}
      {data.topProducts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produk Terlaris</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.topProducts.map((p, i) => (
                <div key={i} className="flex items-center justify-between border-b pb-1.5 text-sm last:border-0">
                  <span className="flex items-center gap-2">
                    <span className="text-muted-foreground">{i + 1}.</span> {p.name}
                  </span>
                  <span className="text-muted-foreground">
                    {formatNumber(p.qty)} terjual · {formatRupiah(p.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transaksi */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Transaksi ({data.transactions.length})</CardTitle>
          <Button variant="outline" size="sm" className="no-print" onClick={exportTransaksi}>
            <Download className="size-4" /> CSV/Excel
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-2">Kode</th>
                  <th className="py-1.5 pr-2">Waktu</th>
                  <th className="py-1.5 pr-2">Kasir</th>
                  <th className="py-1.5 pr-2 text-right">Total</th>
                  <th className="py-1.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {txPg.pageItems.map((t, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1.5 pr-2 font-mono text-xs">{t.code}</td>
                    <td className="py-1.5 pr-2 text-xs">{formatTanggalRingkas(t.created_at)}</td>
                    <td className="py-1.5 pr-2">{t.cashier_name}</td>
                    <td className="py-1.5 pr-2 text-right">{formatRupiah(t.grand_total)}</td>
                    <td className="py-1.5">
                      <Badge variant={t.status === "completed" ? "outline" : "destructive"}>
                        {STATUS_LABEL[t.status] ?? t.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={txPg.page}
            totalPages={txPg.totalPages}
            from={txPg.from}
            to={txPg.to}
            total={txPg.total}
            onPage={txPg.setPage}
            unit="transaksi"
          />
        </CardContent>
      </Card>

      {/* Stock ledger */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Pergerakan Stok ({data.ledger.length})</CardTitle>
          <Button variant="outline" size="sm" className="no-print" onClick={exportLedger}>
            <Download className="size-4" /> CSV/Excel
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-2">Waktu</th>
                  <th className="py-1.5 pr-2">Produk</th>
                  <th className="py-1.5 pr-2">Tipe</th>
                  <th className="py-1.5 pr-2 text-right">Perubahan</th>
                  <th className="py-1.5 text-right">Stok akhir</th>
                </tr>
              </thead>
              <tbody>
                {ledPg.pageItems.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-1.5 pr-2 text-xs">{formatTanggalRingkas(l.created_at)}</td>
                    <td className="py-1.5 pr-2">{l.product_name}</td>
                    <td className="py-1.5 pr-2 text-xs">{l.type}</td>
                    <td
                      className={
                        "py-1.5 pr-2 text-right " +
                        (l.qty_change < 0 ? "text-destructive" : "text-emerald-600")
                      }
                    >
                      {l.qty_change > 0 ? "+" : ""}
                      {formatNumber(l.qty_change)}
                    </td>
                    <td className="py-1.5 text-right">{formatNumber(l.stock_after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={ledPg.page}
            totalPages={ledPg.totalPages}
            from={ledPg.from}
            to={ledPg.to}
            total={ledPg.total}
            onPage={ledPg.setPage}
            unit="baris"
          />
        </CardContent>
      </Card>
    </div>
  );
}
