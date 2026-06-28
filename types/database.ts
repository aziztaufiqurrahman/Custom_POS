/**
 * Tipe database Supabase.
 *
 * PLACEHOLDER — akan di-generate ulang setelah migrasi skema dibuat:
 *   npx supabase gen types typescript --project-id <id> > types/database.ts
 *
 * Sengaja dibuat permisif agar client Supabase tetap type-check sebelum
 * skema final tersedia (Tahap 1).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
