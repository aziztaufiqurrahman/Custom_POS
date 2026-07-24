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

export const PAYMENT_METHODS = [
  "cash",
  "qris",
  "transfer",
  "gofood",
  "shopeefood",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Tunai",
  qris: "QRIS",
  transfer: "Transfer Bank",
  gofood: "GoFood",
  shopeefood: "ShopeeFood",
};

// ── Multi-cabang (PRD v2 §4) ────────────────────────────────────────────────
export const BRANCH_ROLES = ["manager", "cashier"] as const;
export type BranchRole = (typeof BRANCH_ROLES)[number];

export const BRANCH_ROLE_LABELS: Record<BranchRole, string> = {
  manager: "Manajer",
  cashier: "Kasir",
};

/** Permission granular per keanggotaan cabang (branch_memberships.permissions). */
export const BRANCH_PERMISSIONS = [
  "transaction.void",
  "transaction.refund",
  "discount.override",
  "price.override",
  "product.branch_edit",
  "stock.opname",
  "stock.adjust",
  "stock.receive",
  "stock.wastage",
  "stock.transfer_request",
  "stock.transfer_receive",
  "report.view",
  "report.export",
  "sales.view_branch",
  "settings.branch_edit",
  "audit.view",
  "approval.grant",
  "cash.drop",
  "cash.pettycash",
] as const;
export type BranchPermission = (typeof BRANCH_PERMISSIONS)[number];

export const BRANCH_PERMISSION_LABELS: Record<BranchPermission, string> = {
  "transaction.void": "Void transaksi",
  "transaction.refund": "Refund transaksi",
  "discount.override": "Override diskon",
  "price.override": "Override harga",
  "product.branch_edit": "Edit produk cabang (harga/stok min)",
  "stock.opname": "Stock opname",
  "stock.adjust": "Penyesuaian stok",
  "stock.receive": "Penerimaan barang",
  "stock.wastage": "Barang rusak (wastage)",
  "stock.transfer_request": "Ajukan transfer stok",
  "stock.transfer_receive": "Terima transfer stok",
  "report.view": "Lihat laporan",
  "report.export": "Ekspor laporan",
  "sales.view_branch": "Lihat penjualan cabang",
  "settings.branch_edit": "Ubah pengaturan cabang",
  "audit.view": "Lihat audit log",
  "approval.grant": "Beri persetujuan",
  "cash.drop": "Setor kas (cash drop)",
  "cash.pettycash": "Kas kecil / pengeluaran",
};

export const DEFAULT_MANAGER_PERMISSIONS: BranchPermission[] = [
  "stock.opname", "stock.adjust", "stock.receive", "stock.wastage",
  "stock.transfer_request", "stock.transfer_receive", "report.view", "report.export",
  "sales.view_branch", "settings.branch_edit", "audit.view", "approval.grant",
  "discount.override", "price.override", "cash.drop", "cash.pettycash",
];
export const DEFAULT_CASHIER_PERMISSIONS: BranchPermission[] = ["cash.drop"];

/** UUID Cabang Utama (di-seed pada migrasi 0015). */
export const MAIN_BRANCH_ID = "00000000-0000-0000-0000-0000000000c1";

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
