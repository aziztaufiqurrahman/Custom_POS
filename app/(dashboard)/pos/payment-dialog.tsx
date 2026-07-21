"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { Banknote, QrCode, Landmark } from "lucide-react";

import { createSale } from "./actions";
import type { PosBank, PosSettings } from "./page";
import type { CartItem, CompletedSale } from "./types";
import { lineTotal, type CartTotals } from "@/lib/cart";
import { formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { QrisUploader } from "@/components/domain/qris-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Method = "cash" | "qris" | "transfer";
const QUICK = [50000, 100000, 150000, 200000];

export function PaymentDialog({
  open,
  onOpenChange,
  cart,
  totals,
  settings,
  banks,
  isAdmin,
  cashSessionId,
  customerName,
  note,
  onCompleted,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  cart: CartItem[];
  totals: CartTotals;
  settings: PosSettings;
  banks: PosBank[];
  isAdmin: boolean;
  cashSessionId: string;
  customerName: string;
  note: string;
  onCompleted: (sale: CompletedSale) => void;
}) {
  const [method, setMethod] = useState<Method>("cash");
  const [received, setReceived] = useState(0);
  const [reference, setReference] = useState("");
  const [bank, setBank] = useState<PosBank["bank"] | null>(banks[0]?.bank ?? null);
  const [qrisUrl, setQrisUrl] = useState(settings.qris_image_url);
  const [pending, start] = useTransition();

  const total = totals.grandTotal;
  const receivedNum = received;
  const change = Math.max(0, receivedNum - total);
  const selectedBank = banks.find((b) => b.bank === bank) ?? null;

  const canConfirm =
    !pending &&
    (method !== "cash" || receivedNum >= total) &&
    (method !== "transfer" || !!bank);

  function confirm() {
    start(async () => {
      const res = await createSale({
        cash_session_id: cashSessionId,
        items: cart.map((c) => ({
          product_id: c.product.id,
          qty: c.qty,
          discount: c.discount,
        })),
        order_discount:
          totals.discountTotal -
          cart.reduce((s, c) => s + c.discount, 0), // sisa = diskon order
        customer_name: customerName,
        customer_phone: "",
        note,
        payment: {
          method,
          bank: method === "transfer" ? bank : null,
          cash_received: method === "cash" ? receivedNum : null,
          reference,
        },
      });

      if (res.error || !res.receipt) {
        toast.error(res.error ?? "Gagal memproses pembayaran");
        return;
      }

      const sale: CompletedSale = {
        receipt: res.receipt,
        items: cart.map((c) => ({
          name: c.product.name,
          sku: c.product.sku,
          unit: c.product.unit,
          unitPrice: c.product.sell_price,
          qty: c.qty,
          discount: c.discount,
          lineTotal: lineTotal({
            unitPrice: c.product.sell_price,
            qty: c.qty,
            discount: c.discount,
            isTaxable: c.product.is_taxable,
          }),
        })),
        totals,
        payment: {
          method,
          bank: method === "transfer" ? bank : null,
          cashReceived: method === "cash" ? receivedNum : null,
          reference,
        },
        customerName,
        createdAt: new Date().toISOString(),
      };
      toast.success("Pembayaran berhasil");
      onCompleted(sale);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pembayaran</DialogTitle>
          <DialogDescription>
            Total tagihan{" "}
            <span className="font-semibold text-foreground">
              {formatRupiah(total)}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Pilih metode */}
        <div className="grid grid-cols-3 gap-2">
          <MethodButton
            active={method === "cash"}
            onClick={() => setMethod("cash")}
            icon={<Banknote className="size-4" />}
            label="Tunai"
          />
          <MethodButton
            active={method === "qris"}
            onClick={() => setMethod("qris")}
            icon={<QrCode className="size-4" />}
            label="QRIS"
          />
          <MethodButton
            active={method === "transfer"}
            onClick={() => setMethod("transfer")}
            icon={<Landmark className="size-4" />}
            label="Transfer"
          />
        </div>

        {/* Tunai */}
        {method === "cash" && (
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label htmlFor="received">Uang diterima</Label>
              <RupiahInput
                id="received"
                value={received}
                onValueChange={setReceived}
                placeholder="0"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReceived(total)}
              >
                Uang pas
              </Button>
              {QUICK.filter((n) => n >= total).map((n) => (
                <Button
                  key={n}
                  variant="outline"
                  size="sm"
                  onClick={() => setReceived(n)}
                >
                  {formatRupiah(n)}
                </Button>
              ))}
            </div>
            <div className="flex items-center justify-between rounded-md border p-3 text-sm">
              <span className="text-muted-foreground">Kembalian</span>
              <span className="text-lg font-bold">{formatRupiah(change)}</span>
            </div>
          </div>
        )}

        {/* QRIS */}
        {method === "qris" && (
          <div className="space-y-3">
            {qrisUrl ? (
              <div className="relative mx-auto aspect-square w-56 overflow-hidden rounded-md border">
                <Image src={qrisUrl} alt="QRIS" fill className="object-contain" sizes="224px" />
              </div>
            ) : (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                QRIS belum diunggah.
                {isAdmin ? " Unggah gambar QRIS statis toko." : " Hubungi admin."}
              </p>
            )}
            {isAdmin && (
              <div className="flex justify-center">
                <QrisUploader hasImage={!!qrisUrl} onUploaded={setQrisUrl} />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="ref-qris">No. referensi (opsional)</Label>
              <Input
                id="ref-qris"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Transfer */}
        {method === "transfer" && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {(["BNI", "BCA", "BSI"] as const).map((b) => (
                <Button
                  key={b}
                  variant={bank === b ? "default" : "outline"}
                  size="sm"
                  className="flex-1"
                  onClick={() => setBank(b)}
                >
                  {b}
                </Button>
              ))}
            </div>
            <div className="rounded-md border p-3 text-sm">
              {selectedBank && selectedBank.account_number ? (
                <>
                  <p className="text-muted-foreground">No. Rekening {selectedBank.bank}</p>
                  <p className="text-lg font-semibold">
                    {selectedBank.account_number}
                  </p>
                  <p className="text-muted-foreground">
                    a.n. {selectedBank.account_name}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Rekening {bank} belum diisi (atur di Pengaturan).
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ref-tf">No. referensi (opsional)</Label>
              <Input
                id="ref-tf"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={confirm} disabled={!canConfirm}>
            {pending ? "Memproses…" : `Konfirmasi ${formatRupiah(total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MethodButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-md border p-3 text-xs font-medium transition",
        active ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
