import {
  Boxes,
  Clock,
  LayoutDashboard,
  Package,
  Receipt,
  ScrollText,
  Settings,
  ShoppingCart,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Butuh peran admin/manajer (role='admin'). */
  adminOnly: boolean;
  /** Butuh master admin (lintas cabang). Menang atas adminOnly. */
  masterAdminOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/pos", label: "Kasir", icon: ShoppingCart, adminOnly: false },
  { href: "/products", label: "Produk", icon: Package, adminOnly: false },
  { href: "/inventory", label: "Inventory", icon: Boxes, adminOnly: false },
  { href: "/shifts", label: "Shift", icon: Clock, adminOnly: false },
  { href: "/sales", label: "Penjualan", icon: Receipt, adminOnly: false },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { href: "/branches", label: "Cabang", icon: Store, adminOnly: true, masterAdminOnly: true },
  { href: "/employees", label: "Karyawan", icon: Users, adminOnly: true, masterAdminOnly: true },
  { href: "/audit-logs", label: "Audit Log", icon: ScrollText, adminOnly: true },
  { href: "/settings", label: "Pengaturan", icon: Settings, adminOnly: true },
];

/** Saring item nav sesuai peran. */
export function visibleNav(opts: {
  isAdmin: boolean;
  isMasterAdmin: boolean;
}): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (item.masterAdminOnly) return opts.isMasterAdmin;
    if (item.adminOnly) return opts.isAdmin;
    return true;
  });
}
