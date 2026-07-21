import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatRupiah } from "@/lib/format";
import { formatTanggalWaktu } from "@/lib/date";
import { AutoPrint } from "@/components/domain/auto-print";

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={strong ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}

export default async function ReceiptPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAuth();
  const supabase = await createClient();

  const { data: trx } = await supabase
    .from("transactions")
    .select("*, cashier:profiles!transactions_cashier_id_fkey(full_name)")
    .eq("id", id)
    .maybeSingle();
  if (!trx) notFound();

  const [{ data: items }, { data: payments }, { data: settings }] =
    await Promise.all([
      supabase
        .from("transaction_items")
        .select("product_name_snapshot, qty, unit_price, discount, line_total")
        .eq("transaction_id", id),
      supabase
        .from("payments")
        .select("method, bank, amount, cash_received, change_given, reference")
        .eq("transaction_id", id),
      supabase
        .from("store_settings")
        .select("store_name, address, phone, receipt_footer")
        .limit(1)
        .maybeSingle(),
    ]);

  const cashier = trx.cashier as { full_name: string } | { full_name: string }[] | null;
  const cashierName = Array.isArray(cashier)
    ? (cashier[0]?.full_name ?? "-")
    : (cashier?.full_name ?? "-");

  return (
    <div className="mx-auto max-w-[320px] p-4 font-mono text-[13px] leading-tight text-foreground">
      <AutoPrint />

      <div className="text-center">
        <p className="text-sm font-bold">{settings?.store_name ?? "Toko"}</p>
        {settings?.address && <p className="text-[11px]">{settings.address}</p>}
        {settings?.phone && <p className="text-[11px]">{settings.phone}</p>}
      </div>

      <div className="my-2 border-y border-dashed py-1 text-[11px]">
        <Line label="No" value={trx.code} />
        <Line label="Waktu" value={formatTanggalWaktu(trx.created_at)} />
        <Line label="Kasir" value={cashierName} />
        {trx.customer_name && <Line label="Pelanggan" value={trx.customer_name} />}
      </div>

      <div className="border-b border-dashed pb-1">
        {(items ?? []).map((it, i) => (
          <div key={i} className="mb-1">
            <p>{it.product_name_snapshot}</p>
            <div className="flex justify-between text-[12px]">
              <span>
                {it.qty} x {formatRupiah(it.unit_price)}
                {it.discount > 0 ? ` -${formatRupiah(it.discount)}` : ""}
              </span>
              <span>{formatRupiah(it.line_total)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-1 space-y-0.5">
        <Line label="Subtotal" value={formatRupiah(trx.subtotal)} />
        {trx.discount_total > 0 && (
          <Line label="Diskon" value={`-${formatRupiah(trx.discount_total)}`} />
        )}
        {trx.tax_total > 0 && <Line label="Pajak" value={formatRupiah(trx.tax_total)} />}
        <Line label="TOTAL" value={formatRupiah(trx.grand_total)} strong />
        {trx.shipping_cost > 0 && (
          <Line label="Ongkos kirim" value={formatRupiah(trx.shipping_cost)} />
        )}
      </div>

      <div className="mt-1 border-t border-dashed pt-1">
        {(payments ?? []).map((p, i) => (
          <div key={i}>
            <Line
              label={`${PAYMENT_METHOD_LABELS[p.method]}${p.bank ? " " + p.bank : ""}`}
              value={formatRupiah(p.cash_received ?? p.amount)}
            />
            {p.method === "cash" && p.change_given != null && (
              <Line label="Kembalian" value={formatRupiah(p.change_given)} />
            )}
            {p.reference && <Line label="Ref" value={p.reference} />}
          </div>
        ))}
      </div>

      <p className="mt-3 text-center text-[11px]">
        {settings?.receipt_footer ?? "Terima kasih"}
      </p>
    </div>
  );
}
