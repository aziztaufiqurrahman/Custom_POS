"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { createProduct, updateProduct } from "./actions";
import type { ProductListItem } from "./page";
import { productInputSchema } from "@/lib/validations/product";
import { z } from "zod";
import {
  ProductImageUploader,
  type ProductImages,
} from "@/components/domain/product-image-uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  initial_stock: z.number().min(0),
});
type FormValues = z.infer<typeof formSchema>;

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="text-sm text-destructive">{msg}</p> : null;
}

export function ProductFormDialog({
  mode,
  product,
  categories,
  isAdmin,
  open,
  onOpenChange,
  onSaved,
}: {
  mode: "create" | "edit";
  product?: ProductListItem;
  categories: { id: string; name: string }[];
  isAdmin: boolean;
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
      sell_price: product?.sell_price ?? 0,
      cost_price: isAdmin ? (product?.cost_price ?? 0) : null,
      min_stock: product?.min_stock ?? 0,
      is_taxable: product?.is_taxable ?? false,
      discount_type: product?.discount_type ?? "none",
      discount_value: product?.discount_value ?? 0,
      supplier: product?.supplier ?? "",
      is_active: product?.is_active ?? true,
      initial_stock: 0,
    },
  });

  function onSubmit(values: FormValues) {
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
            Lengkapi data produk. Kolom bertanda * wajib diisi.
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
              <Label htmlFor="sell_price">Harga jual (Rp) *</Label>
              <Input
                id="sell_price"
                type="number"
                min={0}
                step={1}
                {...register("sell_price", { valueAsNumber: true })}
              />
              <FieldError msg={errors.sell_price?.message} />
            </div>

            {isAdmin && (
              <div className="grid gap-2">
                <Label htmlFor="cost_price">Harga modal (Rp)</Label>
                <Input
                  id="cost_price"
                  type="number"
                  min={0}
                  step={1}
                  {...register("cost_price", { valueAsNumber: true })}
                />
                <p className="text-xs text-muted-foreground">
                  Hanya terlihat admin.
                </p>
              </div>
            )}

            {mode === "create" && (
              <div className="grid gap-2">
                <Label htmlFor="initial_stock">Stok awal</Label>
                <Input
                  id="initial_stock"
                  type="number"
                  min={0}
                  step={1}
                  {...register("initial_stock", { valueAsNumber: true })}
                />
              </div>
            )}

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
