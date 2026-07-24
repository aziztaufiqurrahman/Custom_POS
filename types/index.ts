import type { Database } from "./database";

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Profile = Tables<"profiles">;
export type Category = Tables<"categories">;
export type Product = Tables<"products">;
export type BankAccount = Tables<"bank_accounts">;
export type CashSession = Tables<"cash_sessions">;
export type Transaction = Tables<"transactions">;
export type StoreSettings = Tables<"store_settings">;
export type Branch = Tables<"branches">;
export type BranchMembership = Tables<"branch_memberships">;
export type BranchProduct = Tables<"branch_products">;
export type BranchSettings = Tables<"branch_settings">;
export type OrgSettings = Tables<"org_settings">;

/** Baris dari view products_public (tanpa cost_price) — aman untuk kasir. */
export type ProductPublic = Omit<Product, "cost_price">;
