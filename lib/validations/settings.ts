import { z } from "zod";

export const storeProfileSchema = z.object({
  store_name: z.string().trim().min(1, "Nama toko wajib diisi").max(200),
  address: z.string().max(300),
  phone: z.string().max(30),
  receipt_footer: z.string().max(300),
});
export type StoreProfileInput = z.infer<typeof storeProfileSchema>;

export const taxSchema = z.object({
  tax_enabled: z.boolean(),
  tax_percent: z
    .number({ message: "Harus angka" })
    .min(0, "Tidak boleh negatif")
    .max(100, "Maksimal 100"),
  tax_inclusive: z.boolean(),
});
export type TaxInput = z.infer<typeof taxSchema>;

/** Pengaturan POS per cabang (pajak + prefix nomor transaksi). */
export const branchPosSchema = z.object({
  tax_enabled: z.boolean(),
  tax_percent: z.number({ message: "Harus angka" }).min(0).max(100),
  tax_inclusive: z.boolean(),
  trx_prefix: z
    .string()
    .trim()
    .min(1, "Prefix wajib diisi")
    .max(10)
    .regex(/^[A-Za-z0-9-]+$/, "Hanya huruf, angka, dan tanda hubung"),
});
export type BranchPosInput = z.infer<typeof branchPosSchema>;

export const bankAccountSchema = z.object({
  bank: z.enum(["BNI", "BCA", "BSI"]),
  account_number: z.string().max(40),
  account_name: z.string().max(120),
  is_active: z.boolean(),
});
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nama kategori wajib diisi").max(60),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const themeSchema = z.object({
  theme_preset: z.string().trim().min(1).max(40),
  // null / "" = pakai warna bawaan template; selain itu wajib hex #rrggbb.
  theme_primary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Warna harus format hex #rrggbb")
    .nullable()
    .or(z.literal("")),
  theme_radius: z.enum(["sharp", "md", "round"]),
  theme_font: z.string().trim().min(1).max(40),
});
export type ThemeInput = z.infer<typeof themeSchema>;
