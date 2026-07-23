import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatRupiah } from "@/lib/format";
import { formatTanggalWaktu } from "@/lib/date";
import { PrintButton } from "./print-button";

/**
 * Halaman struk PUBLIK (tanpa login) — dibuka konsumen lewat tautan WhatsApp.
 * Dikunci ke ID transaksi berupa UUID acak (tidak bisa ditebak). Membaca lewat
 * service role, TAPI hanya kolom aman untuk pelanggan (tanpa harga modal / data
 * internal). Jangan pernah menambah kolom sensitif di query ini.
 */

export const metadata: Metadata = {
  title: "Struk Pembelian",
  robots: { index: false, follow: false },
};

type Status = "completed" | "void" | "refunded";

const STATUS_LABEL: Record<Status, string> = {
  completed: "LUNAS",
  void: "DIBATALKAN",
  refunded: "REFUND",
};

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Validasi bentuk UUID untuk mencegah query sia-sia.
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (!isUuid) notFound();

  const supabase = createAdminClient();

  const { data: trx } = await supabase
    .from("transactions")
    .select(
      "code, created_at, customer_name, subtotal, discount_total, tax_total, shipping_cost, grand_total, status, transaction_items(product_name_snapshot, qty, unit_price, discount, line_total), payments(method, bank, amount, cash_received, change_given, reference)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!trx) notFound();

  const { data: store } = await supabase
    .from("store_settings")
    .select("store_name, address, phone, receipt_footer")
    .limit(1)
    .maybeSingle();

  const status = trx.status as Status;
  const items = trx.transaction_items ?? [];
  const payments = trx.payments ?? [];

  return (
    <div className="min-h-screen bg-neutral-100 px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto max-w-md">
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 print:rounded-none print:shadow-none print:ring-0">
          {/* Header toko */}
          <div className="bg-gradient-to-br from-amber-50 to-white px-6 pt-6 pb-4 text-center">
            <p className="whitespace-pre-line text-lg font-bold text-neutral-900">
              {store?.store_name ?? "Toko"}
            </p>
            {store?.address && (
              <p className="mt-1 whitespace-pre-line text-xs text-neutral-500">
                {store.address}
              </p>
            )}
            {store?.phone && (
              <p className="text-xs text-neutral-500">{store.phone}</p>
            )}
          </div>

          <div className="px-6 pb-6">
            {/* Meta */}
            <div className="flex items-start justify-between border-y border-dashed py-3 text-sm">
              <div className="space-y-0.5 text-neutral-500">
                <p>No. Struk</p>
                <p>Waktu</p>
                {trx.customer_name && <p>Pelanggan</p>}
              </div>
              <div className="space-y-0.5 text-right font-medium text-neutral-800">
                <p>{trx.code}</p>
                <p>{formatTanggalWaktu(trx.created_at)}</p>
                {trx.customer_name && <p>{trx.customer_name}</p>}
              </div>
            </div>

            {/* Item */}
            <div className="divide-y">
              {items.map((it, i) => (
                <div key={i} className="py-2.5">
                  <div className="flex justify-between gap-3">
                    <span className="text-sm text-neutral-800">
                      {it.product_name_snapshot}
                    </span>
                    <span className="shrink-0 text-sm font-medium text-neutral-900">
                      {formatRupiah(it.line_total)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {it.qty} × {formatRupiah(it.unit_price)}
                    {it.discount > 0 && ` − diskon ${formatRupiah(it.discount)}`}
                  </p>
                </div>
              ))}
            </div>

            {/* Ringkasan */}
            <div className="space-y-1 border-t pt-3 text-sm">
              <Row label="Subtotal" value={formatRupiah(trx.subtotal)} />
              {trx.discount_total > 0 && (
                <Row
                  label="Diskon"
                  value={`− ${formatRupiah(trx.discount_total)}`}
                />
              )}
              {trx.tax_total > 0 && (
                <Row label="Pajak" value={formatRupiah(trx.tax_total)} />
              )}
              {trx.shipping_cost > 0 && (
                <Row
                  label="Ongkos kirim"
                  value={formatRupiah(trx.shipping_cost)}
                />
              )}
              <div className="flex justify-between border-t pt-2 text-base font-bold text-neutral-900">
                <span>TOTAL</span>
                <span>{formatRupiah(trx.grand_total)}</span>
              </div>
            </div>

            {/* Status */}
            <div className="mt-4 flex justify-center">
              <span
                className={
                  "rounded-full px-4 py-1 text-sm font-bold " +
                  (status === "completed"
                    ? "bg-emerald-100 text-emerald-700"
                    : status === "refunded"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700")
                }
              >
                {STATUS_LABEL[status]}
              </span>
            </div>

            {/* Pembayaran */}
            {payments.length > 0 && (
              <div className="mt-4 space-y-1 border-t pt-3 text-sm">
                <p className="font-semibold text-neutral-800">Pembayaran</p>
                {payments.map((p, i) => (
                  <div key={i}>
                    <Row
                      label={`${PAYMENT_METHOD_LABELS[p.method]}${p.bank ? " " + p.bank : ""}`}
                      value={formatRupiah(p.cash_received ?? p.amount)}
                    />
                    {p.method === "cash" && p.change_given != null && (
                      <Row
                        label="Kembalian"
                        value={formatRupiah(p.change_given)}
                        muted
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Footer toko */}
            {store?.receipt_footer && (
              <p className="mt-5 whitespace-pre-line text-center text-xs text-neutral-500">
                {store.receipt_footer}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex justify-center print:hidden">
          <PrintButton />
        </div>
        <p className="mt-3 text-center text-[11px] text-neutral-400 print:hidden">
          Struk digital · {store?.store_name?.replace(/\s*\n\s*/g, " ") ?? "Toko"}
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={
        "flex justify-between " +
        (muted ? "text-neutral-500" : "text-neutral-700")
      }
    >
      <span>{label}</span>
      <span className={muted ? "" : "font-medium text-neutral-900"}>
        {value}
      </span>
    </div>
  );
}
