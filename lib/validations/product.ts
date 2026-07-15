import { z } from "zod";

const money = z
  .number({ message: "Harus berupa angka" })
  .min(0, "Tidak boleh negatif");

export const productInputSchema = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(150),
  sku: z.string().trim().min(1, "SKU wajib diisi").max(60),
  barcode: z.string().trim().max(60),
  category_id: z.string(), // "" berarti tanpa kategori
  description: z.string().max(2000),
  unit: z.string().trim().min(1, "Satuan wajib diisi").max(20),
  sell_price: money,
  cost_price: money.nullable(), // hanya admin; kasir null
  min_stock: money,
  is_taxable: z.boolean(),
  discount_type: z.enum(["none", "amount", "percent"]),
  discount_value: money,
  supplier: z.string().max(120),
  is_active: z.boolean(),
});
export type ProductInput = z.infer<typeof productInputSchema>;

export const createProductSchema = productInputSchema.extend({
  initial_stock: money,
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = productInputSchema.extend({
  id: z.string().uuid(),
});
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// Payload sisi server menyertakan URL gambar hasil upload.
const imagePayload = {
  image_url: z.string().nullable(),
  image_urls: z.array(z.string()),
};
export const createProductPayloadSchema =
  createProductSchema.extend(imagePayload);
export const updateProductPayloadSchema =
  updateProductSchema.extend(imagePayload);
