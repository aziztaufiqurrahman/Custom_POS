"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Scale, TrendingUp } from "lucide-react";

import type {
  DashAnalytics,
  DashKpis,
  LowStockItem,
  VarianceItem,
} from "./page";
import { formatNumber, formatRupiah } from "@/lib/format";
import { formatTanggalRingkas } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

// Palet kategorikal urutan tetap (biru/amber/teal) — divalidasi CVD.
const METHOD_META = [
  { key: "cash", label: "Tunai", color: "#3b82f6" },
  { key: "qris", label: "QRIS", color: "#f59e0b" },
  { key: "transfer", label: "Transfer", color: "#14b8a6" },
] as const;
const PRIMARY = "#3b82f6";

function compactIdr(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}rb`;
  return String(v);
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function DashboardClient({
  kpis,
  analytics,
  lowStock,
  variances,
  range,
}: {
  kpis: DashKpis;
  analytics: DashAnalytics;
  lowStock: LowStockItem[];
  variances: VarianceItem[];
  range: { from: string; to: string; bucket: string };
}) {
  const router = useRouter();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [bucket, setBucket] = useState(range.bucket);

  function apply() {
    const p = new URLSearchParams({ from, to, bucket });
    router.push(`/dashboard?${p.toString()}`);
  }

  const methodData = METHOD_META.map((m) => ({
    ...m,
    value: analytics.by_method?.[m.key] ?? 0,
  })).filter((m) => m.value > 0);

  const maxProductRev = Math.max(1, ...analytics.top_products.map((p) => p.revenue));

  return (
    <div className="space-y-4">
      {/* KPI periode tetap */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Pendapatan Hari Ini"
          value={formatRupiah(kpis.today.revenue)}
          sub={`${formatNumber(kpis.today.count)} transaksi`}
        />
        <Kpi
          label="Minggu Ini"
          value={formatRupiah(kpis.week.revenue)}
          sub={`${formatNumber(kpis.week.count)} transaksi`}
        />
        <Kpi
          label="Bulan Ini"
          value={formatRupiah(kpis.month.revenue)}
          sub={`${formatNumber(kpis.month.count)} transaksi`}
        />
        <Kpi
          label="Laba Kotor (bulan)"
          value={formatRupiah(kpis.gross_profit_month)}
          sub={`Rata-rata transaksi ${formatRupiah(Math.round(kpis.avg_month))}`}
        />
      </div>

      {/* Filter rentang */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="grid gap-1.5">
            <Label className="text-xs">Dari</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Sampai</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Kelompokkan</Label>
            <Select value={bucket} onValueChange={(v) => setBucket(v ?? "day")}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Harian</SelectItem>
                <SelectItem value="week">Mingguan</SelectItem>
                <SelectItem value="month">Bulanan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={apply}>Terapkan</Button>
        </CardContent>
      </Card>

      {/* Ringkasan rentang terpilih */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Pendapatan (rentang)" value={formatRupiah(analytics.revenue)} />
        <Kpi label="Transaksi" value={formatNumber(analytics.tx_count)} />
        <Kpi label="Item Terjual" value={formatNumber(analytics.items_sold)} />
        <Kpi label="Laba Kotor (rentang)" value={formatRupiah(analytics.gross_profit)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Tren penjualan */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4" /> Tren Penjualan
            </CardTitle>
            <CardDescription>
              {range.bucket === "day" ? "Harian" : range.bucket === "week" ? "Mingguan" : "Bulanan"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.trend.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Belum ada data pada rentang ini.
              </p>
            ) : (
              <div className="h-64 w-full text-muted-foreground">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.trend} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#8888881f" vertical={false} />
                    <XAxis
                      dataKey="bucket"
                      tickFormatter={(v) => formatTanggalRingkas(v).slice(0, 5)}
                      tick={{ fill: "currentColor", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tickFormatter={(v) => compactIdr(Number(v))}
                      tick={{ fill: "currentColor", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                    />
                    <Tooltip
                      formatter={(v) => [formatRupiah(Number(v)), "Pendapatan"]}
                      labelFormatter={(l) => formatTanggalRingkas(String(l)).slice(0, 10)}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke={PRIMARY}
                      strokeWidth={2}
                      fill="url(#rev)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Breakdown metode */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Metode Pembayaran</CardTitle>
            <CardDescription>Distribusi nilai transaksi</CardDescription>
          </CardHeader>
          <CardContent>
            {methodData.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Belum ada data.
              </p>
            ) : (
              <>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={methodData}
                        dataKey="value"
                        nameKey="label"
                        innerRadius={45}
                        outerRadius={75}
                        paddingAngle={2}
                        stroke="var(--card)"
                        strokeWidth={2}
                      >
                        {methodData.map((m) => (
                          <Cell key={m.key} fill={m.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v) => formatRupiah(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                      <Legend
                        formatter={(val) => <span className="text-xs text-muted-foreground">{val}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {(analytics.by_bank?.BNI || analytics.by_bank?.BCA || analytics.by_bank?.BSI) ? (
                  <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                    <p>Transfer per bank:</p>
                    <div className="flex justify-between"><span>BNI</span><span>{formatRupiah(analytics.by_bank.BNI ?? 0)}</span></div>
                    <div className="flex justify-between"><span>BCA</span><span>{formatRupiah(analytics.by_bank.BCA ?? 0)}</span></div>
                    <div className="flex justify-between"><span>BSI</span><span>{formatRupiah(analytics.by_bank.BSI ?? 0)}</span></div>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Produk terlaris */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Produk Terlaris</CardTitle>
            <CardDescription>Top 10 berdasarkan nilai</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.top_products.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Belum ada data.</p>
            ) : (
              <div className="space-y-2">
                {analytics.top_products.map((p, i) => (
                  <div key={i} className="relative rounded-md border p-2">
                    <div
                      className="absolute inset-y-0 left-0 rounded-md bg-primary/10"
                      style={{ width: `${(p.revenue / maxProductRev) * 100}%` }}
                    />
                    <div className="relative flex items-center justify-between text-sm">
                      <span className="truncate font-medium">
                        {i + 1}. {p.name}
                      </span>
                      <span className="ml-2 whitespace-nowrap">
                        {formatRupiah(p.revenue)}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({formatNumber(p.qty)})
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Per kategori & kasir */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Penjualan per Kategori</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.by_category.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Belum ada data.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kategori</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Nilai</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.by_category.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell>{c.category}</TableCell>
                        <TableCell className="text-right">{formatNumber(c.qty)}</TableCell>
                        <TableCell className="text-right">{formatRupiah(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performa Kasir</CardTitle>
            </CardHeader>
            <CardContent>
              {analytics.by_cashier.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">Belum ada data.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kasir</TableHead>
                      <TableHead className="text-right">Transaksi</TableHead>
                      <TableHead className="text-right">Nilai</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.by_cashier.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell>{c.cashier}</TableCell>
                        <TableCell className="text-right">{formatNumber(c.tx_count)}</TableCell>
                        <TableCell className="text-right">{formatRupiah(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Alerts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-amber-500" /> Stok Menipis
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Semua stok aman.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lowStock.map((p, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{p.name}</span>
                    <span className="text-muted-foreground">
                      {formatNumber(p.stock)} / min {formatNumber(p.min_stock)} {p.unit}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Scale className="size-4" /> Selisih Kas Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent>
            {variances.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Tidak ada selisih kas.
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {variances.map((v, i) => (
                  <li key={i} className="flex justify-between">
                    <span>
                      {v.cashier_name}
                      <span className="ml-1 text-xs text-muted-foreground">
                        {v.closed_at ? formatTanggalRingkas(v.closed_at) : ""}
                      </span>
                    </span>
                    <span className={v.variance < 0 ? "text-destructive" : "text-emerald-600"}>
                      {v.variance > 0 ? "+" : ""}
                      {formatRupiah(v.variance)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
