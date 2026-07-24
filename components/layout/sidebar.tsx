"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Store } from "lucide-react";

import { useAuth } from "@/components/providers/auth-provider";
import { visibleNav } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { isAdmin, isMasterAdmin } = useAuth();

  const items = visibleNav({ isAdmin, isMasterAdmin });

  return (
    <nav className="flex flex-col gap-1 px-3 py-2">
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-r-lg border-l-4 px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "border-sidebar-primary bg-white/10 text-white"
                : "border-transparent text-sidebar-foreground hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className="size-5 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center gap-3 px-5">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Store className="size-5" />
        </div>
        <div className="leading-tight">
          <p className="font-heading text-base font-extrabold text-white">
            Pudingkuu Lucky
          </p>
          <p className="text-[11px] text-sidebar-foreground/70">Admin Panel</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SidebarNav />
      </div>
    </aside>
  );
}
