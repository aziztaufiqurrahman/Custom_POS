import { z } from "zod";

export const saleItemSchema = z.object({
  product_id: z.string().uuid(),
  qty: z.number().positive("Qty harus lebih dari 0"),
  discount: z.number().min(0),
});

export const salePaymentSchema = z.object({
  method: z.enum(["cash", "qris", "transfer", "gofood", "shopeefood"]),
  bank: z.enum(["BNI", "BCA", "BSI"]).nullable(),
  cash_received: z.number().min(0).nullable(),
  reference: z.string().max(120),
});

export const createSaleSchema = z.object({
  cash_session_id: z.string().uuid(),
  items: z.array(saleItemSchema).min(1, "Keranjang kosong"),
  order_discount: z.number().min(0),
  shipping_cost: z.number().min(0),
  customer_name: z.string().max(120),
  customer_phone: z.string().max(30),
  note: z.string().max(500),
  payment: salePaymentSchema,
});
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
