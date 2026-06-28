import { z } from "zod";

import { PERMISSIONS } from "@/lib/constants";

const permissionEnum = z.enum(PERMISSIONS);

export const createEmployeeSchema = z.object({
  full_name: z.string().min(1, "Nama wajib diisi").max(120),
  email: z.string().email("Email tidak valid"),
  phone: z.string().max(30).optional().or(z.literal("")),
  password: z.string().min(8, "Kata sandi minimal 8 karakter"),
  role: z.enum(["admin", "kasir"]),
  permissions: z.array(permissionEnum),
});
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(1, "Nama wajib diisi").max(120),
  phone: z.string().max(30).optional().or(z.literal("")),
  role: z.enum(["admin", "kasir"]),
  permissions: z.array(permissionEnum),
});
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;
