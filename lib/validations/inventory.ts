import { z } from "zod";

const qty = z.number({ message: "Harus berupa angka" });

export const restockSchema = z.object({
  product_id: z.string().uuid(),
  qty: qty.positive("Jumlah harus lebih dari 0"),
  new_cost: qty.min(0).nullable(),
  note: z.string().max(200),
});
export type RestockInput = z.infer<typeof restockSchema>;

export const adjustStockSchema = z.object({
  product_id: z.string().uuid(),
  new_qty: qty.min(0, "Tidak boleh negatif"),
  note: z.string().max(200),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const opnameItemSchema = z.object({
  product_id: z.string().uuid(),
  physical_qty: qty.min(0, "Tidak boleh negatif"),
  reason: z.string().max(200),
});

export const completeOpnameSchema = z.object({
  opname_id: z.string().uuid(),
  items: z.array(opnameItemSchema).min(1, "Tidak ada item"),
});
export type CompleteOpnameInput = z.infer<typeof completeOpnameSchema>;

export const saveOpnameDraftSchema = z.object({
  opname_id: z.string().uuid(),
  items: z
    .array(
      opnameItemSchema.extend({
        system_qty: qty,
        difference: qty,
      }),
    )
    .min(1),
});
export type SaveOpnameDraftInput = z.infer<typeof saveOpnameDraftSchema>;
