"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { saveQrisImage } from "@/app/(dashboard)/pos/actions";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image";
import { Button } from "@/components/ui/button";

const BUCKET = "qris";

/** Upload gambar QRIS statis (admin). Memanggil onUploaded dengan URL publik baru. */
export function QrisUploader({
  hasImage,
  onUploaded,
}: {
  hasImage: boolean;
  onUploaded: (url: string) => void;
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      // Kompres ringan agar QRIS tetap tajam & mudah dipindai.
      const blob = await compressImage(file, 1500, 0.92);
      const path = `store/qris-${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) {
        toast.error("Gagal mengunggah QRIS");
        return;
      }
      const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      startTransition(async () => {
        const res = await saveQrisImage(url);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("QRIS tersimpan");
        onUploaded(url);
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
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
        {busy ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4" />
        )}
        {hasImage ? "Ganti QRIS" : "Upload QRIS"}
      </Button>
    </>
  );
}
