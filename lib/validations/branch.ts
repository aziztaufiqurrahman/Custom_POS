import { z } from "zod";

import { uuidish } from "./common";

export const branchSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, "Kode minimal 2 karakter")
    .max(20)
    .regex(/^[A-Za-z0-9-]+$/, "Hanya huruf, angka, dan tanda hubung"),
  name: z.string().trim().min(1, "Nama cabang wajib diisi").max(120),
  address: z.string().max(300).optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  // Tanpa .default() agar tipe input=output konsisten untuk react-hook-form;
  // fallback "Asia/Jakarta" ditangani di form & server action.
  timezone: z.string().max(60),
});
export type BranchInput = z.infer<typeof branchSchema>;

export const updateBranchSchema = branchSchema.extend({
  id: uuidish,
});
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
