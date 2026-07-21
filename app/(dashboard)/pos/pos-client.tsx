"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ImageIcon,
  Minus,
  PauseCircle,
  Plus,
  PlayCircle,
  Search,
  ShoppingCart,
  Trash2,
} from "lucide-react";

import type { PosBank, PosProduct, PosSettings } from "./page";
import type { CartItem, CompletedSale } from "./types";
import { PaymentDialog } from "./payment-dialog";
import { ReceiptDialog } from "./receipt-dialog";
import { computeCartTotals, lineTotal, type CartLineCalc } from "@/lib/cart";
import { formatNumber, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PARK_KEY = "pos_parked_sales";

type ParkedSale = { id: string; createdAt: string; items: CartItem[] };

export function PosClient({
  activeSessionId,
  products,
  categories,
  settings,
  banks,
  isAdmin,
  cashierName,
}: {
  activeSessionId: string | null;
  products: PosProduct[];
  categories: { id: string; name: string }[];
  settings: PosSettings;
  banks: PosBank[];
  isAdmin: boolean;
  cashierName: string;
}) {
  const router = useRouter();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [shipping, setShipping] = useState(0);
  const [customerName, setCustomerName] = useState("");
  const [note, setNote] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [completed, setCompleted] = useState<CompletedSale | null>(null);
  const [parked, setParked] = useState<ParkedSale[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Muat & simpan transaksi ditahan (hold) di localStorage.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PARK_KEY);
      if (raw) setParked(JSON.parse(raw));
    } catch {
      /* abaikan */
    }
  }, []);
  useEffect(() => {
    localStorage.setItem(PARK_KEY, JSON.stringify(parked));
  }, [parked]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category !== "all" && p.category_id !== category) return false;
      if (q) {
        const hay = `${p.name} ${p.sku} ${p.barcode ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [products, query, category]);

  const totals = useMemo(() => {
    const lines: CartLineCalc[] = cart.map((c) => ({
      unitPrice: c.product.sell_price,
      qty: c.qty,
      discount: c.discount,
      isTaxable: c.product.is_taxable,
    }));
    return computeCartTotals(lines, orderDiscount, {
      taxEnabled: settings.tax_enabled,
      taxPercent: settings.tax_percent,
      taxInclusive: settings.tax_inclusive,
    });
  }, [cart, orderDiscount, settings]);

  function addToCart(p: PosProduct) {
    if (p.stock <= 0) {
      toast.error(`${p.name} stok habis`);
      return;
    }
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product.id === p.id);
      if (idx >= 0) {
        const item = prev[idx];
        if (item.qty + 1 > p.stock) {
          toast.error(`Stok ${p.name} tinggal ${formatNumber(p.stock)}`);
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...item, qty: item.qty + 1 };
        return next;
      }
      return [...prev, { product: p, qty: 1, discount: 0 }];
    });
  }

  function setQty(id: string, qty: number) {
    setCart((prev) =>
      prev.flatMap((c) => {
        if (c.product.id !== id) return [c];
        if (qty <= 0) return [];
        const capped = Math.min(qty, c.product.stock);
        if (qty > c.product.stock)
          toast.error(`Stok ${c.product.name} tinggal ${formatNumber(c.product.stock)}`);
        return [{ ...c, qty: capped }];
      }),
    );
  }

  function setDiscount(id: string, discount: number) {
    setCart((prev) =>
      prev.map((c) =>
        c.product.id === id ? { ...c, discount: Math.max(0, discount) } : c,
      ),
    );
  }

  function removeItem(id: string) {
    setCart((prev) => prev.filter((c) => c.product.id !== id));
  }

  function resetSale() {
    setCart([]);
    setOrderDiscount(0);
    setShipping(0);
    setCustomerName("");
    setNote("");
  }

  function onSearchEnter() {
    const q = query.trim().toLowerCase();
    if (!q) return;
    const match = products.find(
      (p) => p.sku.toLowerCase() === q || (p.barcode ?? "").toLowerCase() === q,
    );
    if (match) {
      addToCart(match);
      setQuery("");
    }
  }

  function holdSale() {
    if (cart.length === 0) return;
    const id = crypto.randomUUID();
    setParked((prev) => [
      { id, createdAt: new Date().toISOString(), items: cart },
      ...prev,
    ]);
    resetSale();
    toast.success("Transaksi ditahan");
  }

  function resumeSale(p: ParkedSale) {
    if (cart.length > 0) {
      toast.error("Selesaikan/tahan keranjang aktif dulu");
      return;
    }
    setCart(p.items);
    setParked((prev) => prev.filter((x) => x.id !== p.id));
  }

  function onCompleted(sale: CompletedSale) {
    setPayOpen(false);
    setCompleted(sale);
    resetSale();
    router.refresh(); // perbarui stok & shift
  }

  const itemCount = cart.reduce((n, c) => n + c.qty, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      {/* Panel produk */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearchEnter()}
              placeholder="Cari / scan barcode (Enter untuk tambah)…"
              className="pl-8"
              autoFocus
            />
          </div>
          {parked.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                <PlayCircle className="size-4" /> Ditahan ({parked.length})
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {parked.map((p) => (
                  <DropdownMenuItem key={p.id} onClick={() => resumeSale(p)}>
                    {p.items.length} item ·{" "}
                    {formatRupiah(
                      p.items.reduce(
                        (s, i) => s + i.product.sell_price * i.qty - i.discount,
                        0,
                      ),
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <CategoryChip
            active={category === "all"}
            onClick={() => setCategory("all")}
          >
            Semua
          </CategoryChip>
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </CategoryChip>
          ))}
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Tidak ada produk.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addToCart(p)}
                disabled={p.stock <= 0}
                className="flex flex-col overflow-hidden rounded-lg border bg-card text-left transition hover:border-primary disabled:opacity-50"
              >
                <div className="relative aspect-square bg-muted">
                  {p.image_url ? (
                    <Image
                      src={p.image_url}
                      alt={p.name}
                      fill
                      sizes="150px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageIcon className="size-7" />
                    </div>
                  )}
                  {p.stock <= 0 && (
                    <Badge variant="destructive" className="absolute top-1 left-1">
                      Habis
                    </Badge>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-0.5 p-2">
                  <p className="line-clamp-2 text-xs font-medium">{p.name}</p>
                  <p className="text-sm font-semibold">
                    {formatRupiah(p.sell_price)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Stok {formatNumber(p.stock)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Panel keranjang */}
      <div className="lg:sticky lg:top-4 lg:h-fit">
        <div className="flex flex-col rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b p-3">
            <span className="flex items-center gap-2 font-semibold">
              <ShoppingCart className="size-4" /> Keranjang
              {itemCount > 0 && <Badge variant="secondary">{itemCount}</Badge>}
            </span>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={resetSale}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Kosongkan
              </button>
            )}
          </div>

          {!activeSessionId && (
            <div className="m-3 rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              Belum ada shift aktif. {" "}
              <Link href="/shifts" className="font-medium underline">
                Buka shift
              </Link>{" "}
              dulu untuk mulai transaksi.
            </div>
          )}

          <div className="max-h-[45svh] overflow-y-auto">
            {cart.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Keranjang kosong. Pilih produk untuk menambah.
              </p>
            ) : (
              <ul className="divide-y">
                {cart.map((c) => (
                  <li key={c.product.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {c.product.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatRupiah(c.product.sell_price)} / {c.product.unit}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(c.product.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => setQty(c.product.id, c.qty - 1)}
                        >
                          <Minus className="size-3.5" />
                        </Button>
                        <span className="w-8 text-center text-sm">{c.qty}</span>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          onClick={() => setQty(c.product.id, c.qty + 1)}
                        >
                          <Plus className="size-3.5" />
                        </Button>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatRupiah(
                          lineTotal({
                            unitPrice: c.product.sell_price,
                            qty: c.qty,
                            discount: c.discount,
                            isTaxable: c.product.is_taxable,
                          }),
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">Diskon</span>
                      <RupiahInput
                        value={c.discount}
                        onValueChange={(v) => setDiscount(c.product.id, v)}
                        className="h-7 w-28 text-xs"
                        placeholder="0"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Ringkasan & aksi */}
          <div className="space-y-2 border-t p-3">
            <div className="grid gap-1.5">
              <div className="flex items-center gap-2">
                <Label htmlFor="orderDisc" className="w-24 text-xs">
                  Diskon total
                </Label>
                <RupiahInput
                  id="orderDisc"
                  value={orderDiscount}
                  onValueChange={setOrderDiscount}
                  className="h-7 w-32 text-xs"
                  placeholder="0"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="shipping" className="w-24 text-xs">
                  Ongkos kirim
                </Label>
                <RupiahInput
                  id="shipping"
                  value={shipping}
                  onValueChange={setShipping}
                  className="h-7 w-32 text-xs"
                  placeholder="0"
                />
              </div>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nama pelanggan (opsional)"
                className="h-8 text-sm"
              />
            </div>

            <div className="space-y-0.5 border-t pt-2 text-sm">
              <Summary label="Subtotal" value={formatRupiah(totals.grossSubtotal)} />
              {totals.discountTotal > 0 && (
                <Summary
                  label="Diskon"
                  value={`- ${formatRupiah(totals.discountTotal)}`}
                />
              )}
              {settings.tax_enabled && (
                <Summary
                  label={`PPN ${settings.tax_percent}%`}
                  value={formatRupiah(totals.taxTotal)}
                />
              )}
              {shipping > 0 && (
                <Summary label="Ongkos kirim" value={formatRupiah(shipping)} />
              )}
              <div className="flex items-center justify-between pt-1 text-base font-bold">
                <span>Total</span>
                <span>{formatRupiah(totals.grandTotal + shipping)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={cart.length === 0}
                onClick={holdSale}
              >
                <PauseCircle className="size-4" /> Tahan
              </Button>
              <Button
                className="flex-1"
                disabled={cart.length === 0 || !activeSessionId}
                onClick={() => setPayOpen(true)}
              >
                Bayar
              </Button>
            </div>
          </div>
        </div>
      </div>

      {payOpen && activeSessionId && (
        <PaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          cart={cart}
          totals={totals}
          settings={settings}
          banks={banks}
          isAdmin={isAdmin}
          cashSessionId={activeSessionId}
          customerName={customerName}
          note={note}
          shipping={shipping}
          onCompleted={onCompleted}
        />
      )}

      {completed && (
        <ReceiptDialog
          sale={completed}
          storeName={settings.store_name}
          cashierName={cashierName}
          onClose={() => setCompleted(null)}
        />
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
