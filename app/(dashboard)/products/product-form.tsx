"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createProduct, updateProduct } from "./actions";
import type { BranchOption, ProductListItem } from "./page";
import { productInputSchema } from "@/lib/validations/product";
import { z } from "zod";
import {
  ProductImageUploader,
  type ProductImages,
} from "@/components/domain/product-image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RupiahInput } from "@/components/ui/rupiah-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formSchema = productInputSchema.extend({
  branch_ids: z.array(z.string()),
});
type FormValues = z.infer<typeof formSchema>;

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-sm text-destructive">{msg}</p> : null;
}

export function ProductFormDialog({
  mode,
  product,
  categories,
  branches,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  product?: ProductListItem;
  categories: { id: string; name: string }[];
  branches: BranchOption[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [images, setImages] = useState<ProductImages>({
    main: product?.image_url ?? null,
    additional: product?.image_urls ?? [],
  });

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: product?.name ?? "",
      sku: product?.sku ?? "",
      barcode: product?.barcode ?? "",
      category_id: product?.category_id ?? "",
      description: product?.description ?? "",
      unit: product?.unit ?? "pcs",
      cost_price: product?.cost_price ?? 0,
      min_stock: product?.min_stock ?? 0,
      is_taxable: product?.is_taxable ?? false,
      discount_type: product?.discount_type ?? "none",
      discount_value: product?.discount_value ?? 0,
      supplier: product?.supplier ?? "",
      is_active: product?.is_active ?? true,
      // Default: produk baru masuk ke SEMUA cabang aktif.
      branch_ids: mode === "create" ? branches.map((b) => b.id) : [],
    },
  });

  function onSubmit(values: FormValues) {
    if (mode === "create" && values.branch_ids.length === 0) {
      toast.error("Pilih minimal satu cabang tujuan");
      return;
    }
    startTransition(async () => {
      const payload = {
        ...values,
        image_url: images.main,
        image_urls: images.additional,
      };
      const res =
        mode === "create"
          ? await createProduct(payload)
          : await updateProduct({ ...payload, id: product!.id });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(mode === "create" ? "Produk ditambahkan" : "Produk diperbarui");
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Tambah Produk" : "Edit Produk"}
          </DialogTitle>
          <DialogDescription>
            Lengkapi data katalog. Harga jual &amp; stok awal diatur per cabang
            di menu Harga &amp; Stok Cabang setelah produk dibuat.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="name">Nama produk *</Label>
              <Input id="name" {...register("name")} />
              <FieldError msg={errors.name?.message} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="sku">SKU *</Label>
              <div className="flex gap-2">
                <Input id="sku" {...register("sku")} />
                {mode === "create" && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setValue(
                        "sku",
                        `SKU-${Date.now().toString(36).toUpperCase().slice(-6)}`,
                      )
                    }
                  >
                    Auto
                  </Button>
                )}
              </div>
              <FieldError msg={errors.sku?.message} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="barcode">Barcode</Label>
              <Input id="barcode" {...register("barcode")} />
            </div>

            <div className="grid gap-2">
              <Label>Kategori</Label>
              <Controller
                control={control}
                name="category_id"
                render={({ field }) => (
                  <Select
                    value={field.value || "none"}
                    onValueChange={(v) =>
                      field.onChange(v === "none" || v === null ? "" : v)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(val: string | null) =>
                          !val || val === "none"
                            ? "Tanpa kategori"
                            : (categories.find((c) => c.id === val)?.name ??
                              "Kategori")
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tanpa kategori</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="unit">Satuan *</Label>
              <Input id="unit" placeholder="pcs, box, kg…" {...register("unit")} />
              <FieldError msg={errors.unit?.message} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cost_price">Harga modal / HPP (Rp)</Label>
              <Controller
                control={control}
                name="cost_price"
                render={({ field }) => (
                  <RupiahInput
                    id="cost_price"
                    value={field.value ?? 0}
                    onValueChange={field.onChange}
                    placeholder="0"
                  />
                )}
              />
              <p className="text-xs text-muted-foreground">
                Global untuk semua cabang. Tidak pernah terlihat kasir.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="min_stock">Stok minimum</Label>
              <Input
                id="min_stock"
                type="number"
                min={0}
                step={1}
                {...register("min_stock", { valueAsNumber: true })}
              />
            </div>

            <div className="grid gap-2">
              <Label>Jenis diskon</Label>
              <Controller
                control={control}
                name="discount_type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(val: string | null) =>
                          val === "amount"
                            ? "Nominal (Rp)"
                            : val === "percent"
                              ? "Persen (%)"
                              : "Tanpa diskon"
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Tanpa diskon</SelectItem>
                      <SelectItem value="amount">Nominal (Rp)</SelectItem>
                      <SelectItem value="percent">Persen (%)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="discount_value">Nilai diskon</Label>
              <Input
                id="discount_value"
                type="number"
                min={0}
                step={1}
                {...register("discount_value", { valueAsNumber: true })}
              />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="supplier">Supplier</Label>
              <Input id="supplier" {...register("supplier")} />
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <Label htmlFor="description">Deskripsi</Label>
              <Textarea id="description" rows={3} {...register("description")} />
            </div>

            <Controller
              control={control}
              name="is_taxable"
              render={({ field }) => (
                <label className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm font-medium">Kena PPN</span>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </label>
              )}
            />
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <label className="flex items-center justify-between rounded-md border p-3">
                  <span className="text-sm font-medium">Produk aktif</span>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </label>
              )}
            />
          </div>

          {/* Cabang tujuan — hanya saat membuat produk baru. */}
          {mode === "create" && (
            <Controller
              control={control}
              name="branch_ids"
              render={({ field }) => {
                const selected = new Set(field.value);
                const allChecked = selected.size === branches.length;
                return (
                  <div className="grid gap-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <Label>Cabang tujuan *</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          field.onChange(
                            allChecked ? [] : branches.map((b) => b.id),
                          )
                        }
                      >
                        {allChecked ? "Kosongkan" : "Pilih semua"}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Produk hanya muncul di cabang yang dicentang (harga &amp;
                      stok awal 0, diisi kemudian oleh pusat).
                    </p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {branches.map((b) => (
                        <label
                          key={b.id}
                          className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={selected.has(b.id)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(b.id);
                              else next.delete(b.id);
                              field.onChange([...next]);
                            }}
                          />
                          <span>{b.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              }}
            />
          )}

          <div className="rounded-md border p-3">
            <ProductImageUploader value={images} onChange={setImages} disabled={pending} />
          </div>

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
