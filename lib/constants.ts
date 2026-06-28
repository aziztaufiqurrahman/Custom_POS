/** Konstanta domain yang dipakai lintas fitur. */

export const ROLES = ["admin", "kasir"] as const;
export type Role = (typeof ROLES)[number];

/** Permission granular untuk kasir (lihat PRD §2.3). */
export const PERMISSIONS = [
  "product.create",
  "product.edit",
  "product.delete",
  "product.upload_image",
  "stock.opname",
  "transaction.void",
  "transaction.refund",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<Permission, string> = {
  "product.create": "Tambah produk",
  "product.edit": "Edit produk",
  "product.delete": "Hapus produk",
  "product.upload_image": "Upload foto produk",
  "stock.opname": "Stock opname",
  "transaction.void": "Void transaksi",
  "transaction.refund": "Refund transaksi",
};

/** Bank yang didukung untuk pembayaran transfer (PRD §3.6). */
export const BANKS = ["BNI", "BCA", "BSI"] as const;
export type Bank = (typeof BANKS)[number];

export const PAYMENT_METHODS = ["cash", "qris", "transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer Bank",
};

export const STOCK_MOVEMENT_TYPES = [
  "initial",
  "sale",
  "void",
  "refund",
  "opname",
  "adjustment",
  "restock",
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const TRANSACTION_STATUSES = ["completed", "void", "refunded"] as const;
export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];
