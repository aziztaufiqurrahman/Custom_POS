import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { grandTotal } from "@/lib/shift";
import { formatRupiah } from "@/lib/format";
import { formatTanggalWaktu } from "@/lib/date";
import { getSessionBreakdown } from "@/app/(dashboard)/shifts/queries";
import { AutoPrint } from "@/components/domain/auto-print";

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex justify-between py-0.5 text-sm">
      <span>{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

export default async function ShiftPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAuth();
  const supabase = await createClient();

  const { data: s } = await supabase
    .from("cash_sessions")
    .select("*, cashier:profiles(full_name)")
    .eq("id", id)
    .maybeSingle();

  if (!s) notFound();

  const { data: settings } = await supabase
    .from("store_settings")
    .select("store_name")
    .maybeSingle();

  const b = await getSessionBreakdown(supabase, id);
  const cashier = s.cashier as { full_name: string } | { full_name: string }[] | null;
  const cashierName = Array.isArray(cashier)
    ? (cashier[0]?.full_name ?? "-")
    : (cashier?.full_name ?? "-");
  const variance = s.variance ?? 0;

  return (
    <div className="mx-auto max-w-sm p-6 text-foreground">
      <AutoPrint />
      <div className="mb-3 text-center">
        <h1 className="whitespace-pre-line text-lg font-semibold">
          {settings?.store_name ?? "Toko"}
        </h1>
        <p className="text-sm text-muted-foreground">Ringkasan Shift Kasir</p>
      </div>

      <div className="border-y py-2">
        <Line label="Kasir" value={cashierName} />
        <Line label="Dibuka" value={formatTanggalWaktu(s.opened_at)} />
        <Line
          label="Ditutup"
          value={s.closed_at ? formatTanggalWaktu(s.closed_at) : "-"}
        />
      </div>

      <div className="border-b py-2">
        <Line label="Uang awal" value={formatRupiah(s.opening_balance)} />
        <Line label="Penjualan tunai" value={formatRupiah(b.cash)} />
        {(s.total_expenses ?? 0) > 0 && (
          <Line label="Pengeluaran kas" value={formatRupiah(s.total_expenses)} />
        )}
        <Line
          label="Kas seharusnya"
          value={formatRupiah(
            s.expected_cash ?? s.opening_balance + b.cash - (s.total_expenses ?? 0),
          )}
          strong
        />
        <Line label="Hitungan fisik" value={formatRupiah(s.counted_cash ?? 0)} />
        <Line
          label="Selisih"
          value={
            variance === 0
              ? "Sesuai"
              : variance > 0
                ? `Lebih ${formatRupiah(variance)}`
                : `Kurang ${formatRupiah(-variance)}`
          }
          strong
        />
      </div>

      <div className="py-2">
        <Line label="Tunai" value={formatRupiah(b.cash)} />
        <Line label="QRIS" value={formatRupiah(b.qris)} />
        <Line label="Transfer BNI" value={formatRupiah(b.transferByBank.BNI)} />
        <Line label="Transfer BCA" value={formatRupiah(b.transferByBank.BCA)} />
        <Line label="Transfer BSI" value={formatRupiah(b.transferByBank.BSI)} />
        <Line label="GoFood" value={formatRupiah(b.gofood)} />
        <Line label="ShopeeFood" value={formatRupiah(b.shopeefood)} />
        <Line
          label={`Total (${b.count} transaksi)`}
          value={formatRupiah(grandTotal(b))}
          strong
        />
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Dicetak {formatTanggalWaktu(new Date())}
      </p>
    </div>
  );
}
