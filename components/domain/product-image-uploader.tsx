"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";

const BUCKET = "product-images";
const MAX_ADDITIONAL = 4;

export type ProductImages = {
  main: string | null;
  additional: string[];
};

/** Ambil path objek dari public URL Storage untuk keperluan hapus. */
function pathFromUrl(url: string): string | null {
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

export function ProductImageUploader({
  value,
  onChange,
  disabled,
}: {
  value: ProductImages;
  onChange: (next: ProductImages) => void;
  disabled?: boolean;
}) {
  const supabase = createClient();
  const [busy, setBusy] = useState(false);
  const mainInput = useRef<HTMLInputElement>(null);
  const addInput = useRef<HTMLInputElement>(null);

  async function upload(file: File): Promise<string | null> {
    const blob = await compressImage(file);
    const path = `products/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) {
      toast.error("Gagal mengunggah gambar");
      return null;
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function removeFromStorage(url: string) {
    const path = pathFromUrl(url);
    if (path) await supabase.storage.from(BUCKET).remove([path]);
  }

  async function onPickMain(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const url = await upload(file);
      if (url) {
        if (value.main) await removeFromStorage(value.main);
        onChange({ ...value, main: url });
      }
    } finally {
      setBusy(false);
    }
  }

  async function onPickAdditional(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    const room = MAX_ADDITIONAL - value.additional.length;
    if (room <= 0) {
      toast.error(`Maksimal ${MAX_ADDITIONAL} foto tambahan`);
      return;
    }
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const file of files.slice(0, room)) {
        const url = await upload(file);
        if (url) urls.push(url);
      }
      if (urls.length) {
        onChange({ ...value, additional: [...value.additional, ...urls] });
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeMain() {
    if (value.main) await removeFromStorage(value.main);
    onChange({ ...value, main: null });
  }

  async function removeAdditional(url: string) {
    await removeFromStorage(url);
    onChange({
      ...value,
      additional: value.additional.filter((u) => u !== url),
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <span className="text-sm font-medium">Foto utama</span>
        <div className="flex items-center gap-3">
          <Thumb
            url={value.main}
            onRemove={value.main ? removeMain : undefined}
            disabled={disabled || busy}
          />
          <input
            ref={mainInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onPickMain}
          />
          <button
            type="button"
            disabled={disabled || busy}
            onClick={() => mainInput.current?.click()}
            className="text-sm text-primary hover:underline disabled:opacity-50"
          >
            {value.main ? "Ganti" : "Pilih foto"}
          </button>
        </div>
      </div>

      <div className="grid gap-2">
        <span className="text-sm font-medium">
          Foto tambahan (maks {MAX_ADDITIONAL})
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {value.additional.map((url) => (
            <Thumb
              key={url}
              url={url}
              onRemove={() => removeAdditional(url)}
              disabled={disabled || busy}
            />
          ))}
          {value.additional.length < MAX_ADDITIONAL && (
            <>
              <input
                ref={addInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onPickAdditional}
              />
              <button
                type="button"
                disabled={disabled || busy}
                onClick={() => addInput.current?.click()}
                className="flex size-16 items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ImagePlus className="size-5" />
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Thumb({
  url,
  onRemove,
  disabled,
}: {
  url: string | null;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex size-16 items-center justify-center overflow-hidden rounded-md border bg-muted",
      )}
    >
      {url ? (
        <Image
          src={url}
          alt="Foto produk"
          fill
          sizes="64px"
          className="object-cover"
        />
      ) : (
        <ImagePlus className="size-5 text-muted-foreground" />
      )}
      {url && onRemove && (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="absolute top-0.5 right-0.5 rounded-full bg-black/60 p-0.5 text-white hover:bg-black/80"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
