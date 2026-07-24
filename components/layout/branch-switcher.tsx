"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Store } from "lucide-react";

import { setActiveBranch } from "@/app/(dashboard)/actions";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Pemilih cabang aktif. Hanya tampil bila user punya >1 cabang.
 * Bila satu cabang, tampil label statis (cabang terkunci).
 */
export function BranchSwitcher() {
  const { branches, activeBranch } = useAuth();
  const router = useRouter();
  const [pending, start] = useTransition();

  if (branches.length === 0) return null;

  if (branches.length === 1) {
    return (
      <div className="hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm text-muted-foreground sm:flex">
        <Store className="size-4" />
        <span className="max-w-40 truncate">{branches[0].name}</span>
      </div>
    );
  }

  function choose(id: string) {
    if (id === activeBranch?.id) return;
    start(async () => {
      const res = await setActiveBranch(id);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="gap-1.5" disabled={pending} />}
      >
        <Store className="size-4" />
        <span className="max-w-40 truncate">
          {activeBranch?.name ?? "Pilih cabang"}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {branches.map((b) => (
          <DropdownMenuItem key={b.id} onClick={() => choose(b.id)}>
            <Store className="size-4" />
            <span className="flex-1 truncate">{b.name}</span>
            {b.id === activeBranch?.id && (
              <Check className={cn("size-4 text-primary")} />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
