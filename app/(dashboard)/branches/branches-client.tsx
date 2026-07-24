"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MapPin, MoreHorizontal, Phone, Plus, Store, Users } from "lucide-react";

import { createBranch, setBranchActive, updateBranch } from "./actions";
import type { BranchRow } from "./page";
import { branchSchema, type BranchInput } from "@/lib/validations/branch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-sm text-destructive">{msg}</p>;
}

function BranchDialog({
  branch,
  open,
  onOpenChange,
  onDone,
}: {
  branch?: BranchRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const isEdit = !!branch;
  const [pending, start] = useTransition();
  const form = useForm<BranchInput>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      code: branch?.code ?? "",
      name: branch?.name ?? "",
      address: branch?.address ?? "",
      phone: branch?.phone ?? "",
      timezone: branch?.timezone ?? "Asia/Jakarta",
    },
  });

  function onSubmit(values: BranchInput) {
    start(async () => {
      const res = isEdit
        ? await updateBranch({ ...values, id: branch!.id })
        : await createBranch(values);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(isEdit ? "Cabang diperbarui" : "Cabang dibuat");
      onOpenChange(false);
      form.reset();
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Cabang" : "Tambah Cabang"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Perbarui data cabang."
              : "Cabang baru otomatis mendapat pengaturan & katalog default (stok 0)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="b-code">Kode cabang</Label>
              <Input id="b-code" placeholder="mis. BDG01" {...form.register("code")} />
              <FieldError msg={form.formState.errors.code?.message} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-name">Nama cabang</Label>
              <Input id="b-name" {...form.register("name")} />
              <FieldError msg={form.formState.errors.name?.message} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="b-address">Alamat (opsional)</Label>
            <Input id="b-address" {...form.register("address")} />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="b-phone">Telepon (opsional)</Label>
              <Input id="b-phone" {...form.register("phone")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="b-tz">Timezone</Label>
              <Input id="b-tz" {...form.register("timezone")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : isEdit ? "Simpan" : "Buat Cabang"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BranchesClient({ branches }: { branches: BranchRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<BranchRow | null>(null);
  const [, start] = useTransition();

  function refresh() {
    router.refresh();
  }

  function toggleActive(b: BranchRow) {
    start(async () => {
      const res = await setBranchActive(b.id, !b.is_active);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(b.is_active ? "Cabang dinonaktifkan" : "Cabang diaktifkan");
      refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Manajemen Cabang</CardTitle>
            <CardDescription>
              Kelola cabang toko. Hanya Master Admin.
            </CardDescription>
          </div>
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Tambah Cabang
          </Button>
        </CardHeader>
        <CardContent>
          {branches.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada cabang.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {branches.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col gap-2 rounded-lg border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Store className="size-4" />
                      </div>
                      <div className="leading-tight">
                        <p className="font-semibold">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.code}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={b.is_active ? "outline" : "destructive"}>
                        {b.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon" />}
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Aksi</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(b)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleActive(b)}>
                            {b.is_active ? "Nonaktifkan" : "Aktifkan"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="space-y-0.5 text-xs text-muted-foreground">
                    {b.address && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0" /> {b.address}
                      </p>
                    )}
                    {b.phone && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="size-3.5 shrink-0" /> {b.phone}
                      </p>
                    )}
                    <p className="flex items-center gap-1.5">
                      <Users className="size-3.5 shrink-0" /> {b.member_count} karyawan
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <BranchDialog open={adding} onOpenChange={setAdding} onDone={refresh} />
      {editing && (
        <BranchDialog
          key={editing.id}
          branch={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}
