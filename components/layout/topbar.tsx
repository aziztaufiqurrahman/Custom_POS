"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, LogOut, Menu } from "lucide-react";

import { signOut } from "@/app/(dashboard)/actions";
import { useAuth } from "@/components/providers/auth-provider";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function Topbar() {
  const { profile, isAdmin } = useAuth();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const items = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);
  const current = items.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );

  function handleSignOut() {
    startTransition(async () => {
      try {
        await signOut();
      } finally {
        // Navigasi penuh setelah cookie sesi dibersihkan (hindari race saat
        // menu menutup / komponen unmount).
        window.location.href = "/login";
      }
    });
  }

  return (
    <header className="flex h-16 items-center justify-between gap-3 border-b bg-card px-4 md:px-6">
      <div className="flex items-center gap-2">
        {/* Menu mobile */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="md:hidden" />}
          >
            <Menu className="size-5" />
            <span className="sr-only">Menu</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {items.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <DropdownMenuItem
                  key={item.href}
                  render={
                    <Link
                      href={item.href}
                      className={cn(active && "font-semibold")}
                    />
                  }
                >
                  <Icon className="size-4" />
                  {item.label}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="font-heading text-lg font-bold text-primary sm:text-xl">
          {current?.label ?? "Pudingkuu Lucky"}
        </h1>
      </div>

      <div className="flex items-center gap-1">
        {/* Notifikasi */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" className="relative" />}
          >
            <Bell className="size-5" />
            <span className="sr-only">Notifikasi</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <div className="px-2 py-1.5 text-sm font-medium">Notifikasi</div>
            <DropdownMenuSeparator />
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              Belum ada notifikasi.
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Akun */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" className="gap-2 px-2" />}
          >
            <Avatar className="size-7">
              <AvatarFallback className="text-xs">
                {initials(profile?.full_name ?? "?")}
              </AvatarFallback>
            </Avatar>
            <span className="hidden text-sm sm:inline">
              {profile?.full_name}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex flex-col px-2 py-1.5">
              <span className="text-sm font-medium">{profile?.full_name}</span>
              <span className="text-xs text-muted-foreground capitalize">
                {profile?.role}
              </span>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut} disabled={pending}>
              <LogOut className="size-4" />
              {pending ? "Keluar…" : "Keluar"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
