"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { konfirmasiPembayaran } from "./actions";
import { formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TombolKonfirmasi({
  orderId,
  kode,
  nilai,
  usaha,
}: {
  orderId: string;
  kode: string;
  nilai: number;
  usaha: string;
}) {
  const router = useRouter();
  const [buka, setBuka] = useState(false);
  const [ref, setRef] = useState("");
  const [pending, startTransition] = useTransition();

  function konfirmasi() {
    startTransition(async () => {
      const hasil = await konfirmasiPembayaran({ order_id: orderId, gateway_ref: ref });
      if (hasil.error) {
        toast.error(hasil.error);
        return;
      }
      toast.success(`${kode} lunas. Paket ${usaha} sudah naik.`);
      setBuka(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={buka} onOpenChange={setBuka}>
      <DialogTrigger render={<Button size="sm">Konfirmasi</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Konfirmasi Pembayaran</DialogTitle>
          <DialogDescription>
            Pastikan dana <strong>{formatRupiah(nilai)}</strong> dari{" "}
            <strong>{usaha}</strong> benar-benar sudah masuk ke rekening sebelum
            melanjutkan. Paket akan langsung aktif dan tidak dibatalkan otomatis.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <Label htmlFor="ref">Referensi transfer (opsional)</Label>
          <Input
            id="ref"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="mis. TRF/BCA/20260807/0012"
          />
          <p className="text-xs text-muted-foreground">
            Dicatat pada pembayaran agar rekonsiliasi rekening bisa ditelusuri.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setBuka(false)} disabled={pending}>
            Batal
          </Button>
          <Button onClick={konfirmasi} disabled={pending}>
            {pending ? "Memproses…" : `Tandai Lunas — ${kode}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
