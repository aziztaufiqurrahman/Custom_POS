import type { CartTotals } from "@/lib/cart";

import type { PosProduct } from "./page";
import type { SaleReceipt } from "./actions";

export type CartItem = {
  product: PosProduct;
  qty: number;
  discount: number;
};

export type ReceiptItem = {
  name: string;
  sku: string;
  unit: string;
  unitPrice: number;
  qty: number;
  discount: number;
  lineTotal: number;
};

export type CompletedSale = {
  receipt: SaleReceipt;
  items: ReceiptItem[];
  totals: CartTotals;
  shipping: number;
  payment: {
    method: "cash" | "qris" | "transfer" | "gofood" | "shopeefood";
    bank: "BNI" | "BCA" | "BSI" | null;
    cashReceived: number | null;
    reference: string;
  };
  customerName: string;
  createdAt: string;
};
