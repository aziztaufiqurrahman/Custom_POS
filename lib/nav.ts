import {
  Boxes,
  Clock,
  LayoutDashboard,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  adminOnly: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/pos", label: "Kasir", icon: ShoppingCart, adminOnly: false },
  { href: "/products", label: "Produk", icon: Package, adminOnly: false },
  { href: "/inventory", label: "Inventory", icon: Boxes, adminOnly: false },
  { href: "/shifts", label: "Shift", icon: Clock, adminOnly: false },
  { href: "/sales", label: "Penjualan", icon: Receipt, adminOnly: false },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { href: "/employees", label: "Karyawan", icon: Users, adminOnly: true },
  { href: "/audit-logs", label: "Audit Log", icon: ScrollText, adminOnly: true },
  { href: "/settings", label: "Pengaturan", icon: Settings, adminOnly: true },
];
