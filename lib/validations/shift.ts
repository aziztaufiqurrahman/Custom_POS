import { z } from "zod";

export const openShiftSchema = z.object({
  opening_balance: z
    .number({ message: "Harus berupa angka" })
    .min(0, "Tidak boleh negatif"),
});
export type OpenShiftInput = z.infer<typeof openShiftSchema>;

export const closeShiftSchema = z.object({
  counted_cash: z
    .number({ message: "Harus berupa angka" })
    .min(0, "Tidak boleh negatif"),
  note: z.string().max(500),
});
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;

export const EXPENSE_CATEGORIES = [
  "ongkir",
  "operasional",
  "bahan",
  "lainnya",
] as const;

export const expenseSchema = z.object({
  amount: z
    .number({ message: "Harus berupa angka" })
    .positive("Nominal harus lebih dari 0"),
  category: z.enum(EXPENSE_CATEGORIES),
  note: z.string().max(200),
});
export type ExpenseInput = z.infer<typeof expenseSchema>;
