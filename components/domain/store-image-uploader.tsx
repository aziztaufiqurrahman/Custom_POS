"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { setStoreImage } from "@/app/(dashboard)/settings/actions";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { Button } from "@/components/ui/button";

export function StoreImageUploader({
  kind,
  value,
  onUploaded,
}: {
  kind: "logo" | "qris";
  value: string | null;
  onUploaded: (url: string) => void;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const bucket = kind === "logo" ? "store-logos" : "qris";
  // QRIS perlu lebih tajam agar mudah dipindai; logo boleh lebih kecil.
  const [maxSize, quality] = kind === "qris" ? [1500, 0.92] : [512, 0.85];

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const blob = await compressImage(file, maxSize, quality);
      const path = `store/${kind}-${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) {
        toast.error("Gagal mengunggah gambar");
        return;
      }
      const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      startTransition(async () => {
        const res = await setStoreImage(kind, url);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("Gambar tersimpan");
        onUploaded(url);
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex size-20 items-center justify-center overflow-hidden rounded-md border bg-muted">
        {value ? (
          <Image
            src={value}
            alt={kind}
            fill
            sizes="80px"
            className={kind === "qris" ? "object-contain p-1" : "object-cover"}
          />
        ) : (
          <span className="text-xs text-muted-foreground">Belum ada</span>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {value ? "Ganti" : "Unggah"}
      </Button>
    </div>
  );
}
