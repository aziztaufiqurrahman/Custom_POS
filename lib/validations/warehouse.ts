import { z } from "zod";

import { uuidish } from "./common";

const qty = z.number({ message: "Harus angka" }).positive("Jumlah harus > 0");

export const receiptItemSchema = z.object({
  product_id: z.string().uuid(),
  qty,
  cost_price: z.number().min(0).nullable(),
});

export const goodsReceiptSchema = z.object({
  supplier_id: z.string().uuid().nullable().or(z.literal("")),
  note: z.string().max(200).optional().or(z.literal("")),
  items: z.array(receiptItemSchema).min(1, "Tambahkan minimal 1 item"),
});
export type GoodsReceiptInput = z.infer<typeof goodsReceiptSchema>;

export const lineItemSchema = z.object({
  product_id: z.string().uuid(),
  qty,
});

export const wastageSchema = z.object({
  reason: z.string().trim().min(1, "Alasan wajib diisi").max(200),
  items: z.array(lineItemSchema).min(1, "Tambahkan minimal 1 item"),
});
export type WastageInput = z.infer<typeof wastageSchema>;

export const transferSchema = z.object({
  to_branch_id: uuidish,
  note: z.string().max(200).optional().or(z.literal("")),
  items: z.array(lineItemSchema).min(1, "Tambahkan minimal 1 item"),
});
export type TransferInput = z.infer<typeof transferSchema>;

export const supplierSchema = z.object({
  name: z.string().trim().min(1, "Nama supplier wajib diisi").max(120),
  phone: z.string().max(30).optional().or(z.literal("")),
});
export type SupplierInput = z.infer<typeof supplierSchema>;
