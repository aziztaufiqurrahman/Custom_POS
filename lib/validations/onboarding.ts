import { z } from "zod";

/**
 * Pembuatan workspace (tenant) pertama oleh pemiliknya sendiri.
 * Dikirim ke RPC `platform.provision_workspace()` (migrasi 0037), yang
 * membuat workspace, keanggotaan owner, langganan, cabang pusat, dan
 * pengaturan awal dalam SATU transaksi.
 */
export const onboardingSchema = z.object({
  workspace_name: z
    .string()
    .trim()
    .min(3, "Nama usaha minimal 3 karakter")
    .max(80, "Nama usaha maksimal 80 karakter"),
  // Kosong = RPC memakai "<Nama Usaha> - Pusat".
  branch_name: z
    .string()
    .trim()
    .max(80, "Nama cabang maksimal 80 karakter")
    .optional()
    .or(z.literal("")),
  branch_code: z
    .string()
    .trim()
    .min(2, "Kode cabang minimal 2 karakter")
    .max(12, "Kode cabang maksimal 12 karakter")
    .regex(/^[A-Za-z0-9-]+$/, "Kode hanya boleh huruf, angka, dan tanda hubung"),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
