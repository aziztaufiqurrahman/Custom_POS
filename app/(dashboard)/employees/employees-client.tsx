"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MoreHorizontal, Plus } from "lucide-react";

import {
  createEmployee,
  sendEmployeeReset,
  setEmployeeActive,
  updateEmployee,
} from "./actions";
import type { EmployeeRow } from "./page";
import {
  PERMISSIONS,
  PERMISSION_LABELS,
  type Permission,
} from "@/lib/constants";
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  type CreateEmployeeInput,
  type UpdateEmployeeInput,
} from "@/lib/validations/employee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function PermissionPicker({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  function toggle(perm: Permission, checked: boolean) {
    onChange(checked ? [...value, perm] : value.filter((p) => p !== perm));
  }

  return (
    <div className="grid gap-2">
      <Label>Hak akses granular</Label>
      {disabled ? (
        <p className="text-sm text-muted-foreground">
          Admin memiliki semua hak akses secara otomatis.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 rounded-md border p-3 sm:grid-cols-2">
          {PERMISSIONS.map((perm) => (
            <label
              key={perm}
              className="flex items-center gap-2 text-sm font-normal"
            >
              <Checkbox
                checked={value.includes(perm)}
                onCheckedChange={(c) => toggle(perm, c === true)}
              />
              {PERMISSION_LABELS[perm]}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function AddEmployeeDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      full_name: "",
      email: "",
      phone: "",
      password: "",
      role: "kasir",
      permissions: [],
    },
  });
  const role = form.watch("role");

  function onSubmit(values: CreateEmployeeInput) {
    startTransition(async () => {
      const res = await createEmployee(values);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Karyawan ditambahkan");
      setOpen(false);
      form.reset();
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Tambah Karyawan
      </Button>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Karyawan</DialogTitle>
          <DialogDescription>
            Buat akun karyawan baru beserta peran & hak aksesnya.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="add-name">Nama lengkap</Label>
            <Input id="add-name" {...form.register("full_name")} />
            <FieldError msg={form.formState.errors.full_name?.message} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-email">Email</Label>
            <Input id="add-email" type="email" {...form.register("email")} />
            <FieldError msg={form.formState.errors.email?.message} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-phone">No. HP (opsional)</Label>
            <Input id="add-phone" {...form.register("phone")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-pass">Kata sandi awal</Label>
            <Input id="add-pass" type="text" {...form.register("password")} />
            <FieldError msg={form.formState.errors.password?.message} />
          </div>
          <div className="grid gap-2">
            <Label>Peran</Label>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kasir">Kasir</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <Controller
            control={form.control}
            name="permissions"
            render={({ field }) => (
              <PermissionPicker
                value={field.value}
                onChange={field.onChange}
                disabled={role === "admin"}
              />
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditEmployeeDialog({
  employee,
  open,
  onOpenChange,
  onDone,
}: {
  employee: EmployeeRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const form = useForm<UpdateEmployeeInput>({
    resolver: zodResolver(updateEmployeeSchema),
    defaultValues: {
      id: employee.id,
      full_name: employee.full_name,
      phone: employee.phone ?? "",
      role: employee.role,
      permissions: employee.permissions.filter((p): p is Permission =>
        (PERMISSIONS as readonly string[]).includes(p),
      ),
    },
  });
  const role = form.watch("role");

  function onSubmit(values: UpdateEmployeeInput) {
    startTransition(async () => {
      const res = await updateEmployee(values);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Karyawan diperbarui");
      onOpenChange(false);
      onDone();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Karyawan</DialogTitle>
          <DialogDescription>{employee.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="edit-name">Nama lengkap</Label>
            <Input id="edit-name" {...form.register("full_name")} />
            <FieldError msg={form.formState.errors.full_name?.message} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit-phone">No. HP (opsional)</Label>
            <Input id="edit-phone" {...form.register("phone")} />
          </div>
          <div className="grid gap-2">
            <Label>Peran</Label>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kasir">Kasir</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <Controller
            control={form.control}
            name="permissions"
            render={({ field }) => (
              <PermissionPicker
                value={field.value}
                onChange={field.onChange}
                disabled={role === "admin"}
              />
            )}
          />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan Perubahan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-sm text-destructive">{msg}</p>;
}

export function EmployeesClient({
  employees,
  currentUserId,
  serviceRoleMissing = false,
}: {
  employees: EmployeeRow[];
  currentUserId: string;
  serviceRoleMissing?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<EmployeeRow | null>(null);
  const [, startTransition] = useTransition();

  function refresh() {
    router.refresh();
  }

  function handleToggleActive(emp: EmployeeRow) {
    startTransition(async () => {
      const res = await setEmployeeActive(emp.id, !emp.is_active);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(emp.is_active ? "Karyawan dinonaktifkan" : "Karyawan diaktifkan");
      refresh();
    });
  }

  function handleReset(emp: EmployeeRow) {
    startTransition(async () => {
      await sendEmployeeReset(emp.email);
      toast.success("Tautan reset password dikirim (jika email valid)");
    });
  }

  return (
    <div className="space-y-4">
      {serviceRoleMissing && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          Konfigurasi server belum lengkap: <b>SUPABASE_SERVICE_ROLE_KEY</b> belum
          di-set di Vercel. Email karyawan tidak tampil dan fitur{" "}
          <b>Tambah Karyawan</b> dinonaktifkan. Edit peran/izin, aktif/nonaktif, dan
          reset password tetap berfungsi.
        </div>
      )}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Manajemen Karyawan</CardTitle>
            <CardDescription>
              Kelola akun, peran, dan hak akses karyawan.
            </CardDescription>
          </div>
          {serviceRoleMissing ? (
            <Button disabled>
              <Plus className="size-4" /> Tambah Karyawan
            </Button>
          ) : (
            <AddEmployeeDialog onDone={refresh} />
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nama</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Peran</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">
                      {emp.full_name}
                      {emp.id === currentUserId && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (Anda)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {emp.email}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={emp.role === "admin" ? "default" : "secondary"}
                        className="capitalize"
                      >
                        {emp.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={emp.is_active ? "outline" : "destructive"}>
                        {emp.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon" />}
                        >
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Aksi</span>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing(emp)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleReset(emp)}>
                            Kirim reset password
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleToggleActive(emp)}
                            disabled={emp.id === currentUserId && emp.is_active}
                          >
                            {emp.is_active ? "Nonaktifkan" : "Aktifkan"}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {editing && (
        <EditEmployeeDialog
          key={editing.id}
          employee={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          onDone={refresh}
        />
      )}
    </div>
  );
}
