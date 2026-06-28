"use client";

import { useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu } from "lucide-react";

import { signOut } from "@/app/(dashboard)/actions";
import { useAuth } from "@/components/providers/auth-provider";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
      await signOut();
    });
  }

  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b bg-background px-4">
      <div className="flex items-center gap-2">
        {/* Menu mobile */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon" className="md:hidden" />
            }
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
        <h1 className="text-sm font-semibold sm:text-base">
          {current?.label ?? "POS Kasir"}
        </h1>
      </div>

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
          <DropdownMenuLabel>
            <div className="flex flex-col">
              <span>{profile?.full_name}</span>
              <span className="text-xs font-normal text-muted-foreground capitalize">
                {profile?.role}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} disabled={pending}>
            <LogOut className="size-4" />
            {pending ? "Keluar…" : "Keluar"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
