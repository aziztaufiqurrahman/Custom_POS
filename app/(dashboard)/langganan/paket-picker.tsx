"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { orderPlan } from "./actions";
import { formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";

type Plan = {
  plan_id: string;
  tier: string;
  billing_period: string;
  price: number;
  limits: { max_branches?: number | null; max_users?: number | null } | null;
};

export function PaketPicker({
  plans,
  tierSekarang,
  periodeSekarang,
  adaPending,
}: {
  plans: Plan[];
  tierSekarang: string | null;
  periodeSekarang: string | null;
  adaPending: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  /**
   * Paket mana yang sedang diproses — BUKAN boolean bersama.
   *
   * Sebelumnya kode ini memakai `pending` dari useTransition(), yang bernilai
   * satu untuk seluruh komponen. Akibatnya menekan "Basic" membuat tombol Pro
   * dan Bisnis ikut berubah menjadi "Memproses…", sehingga pengguna tidak bisa
   * memastikan paket mana yang ia tekan. Pesanan yang tercatat selalu benar,
   * tetapi pada aksi yang menyangkut uang keraguan seperti itu tidak boleh ada.
   */
  const [planDiproses, setPlanDiproses] = useState<string | null>(null);

  /** Paket yang menunggu konfirmasi eksplisit sebelum pesanan dibuat. */
  const [akanDipesan, setAkanDipesan] = useState<Plan | null>(null);

  const [periode, setPeriode] = useState<"monthly" | "annual">(
    periodeSekarang === "annual" ? "annual" : "monthly",
  );

  // Gratis & Enterprise tidak bisa dipesan sendiri (harga 0): yang satu bawaan,
  // yang lain dinegosiasikan. Keduanya tetap ditampilkan sebagai konteks.
  const terlihat = plans.filter(
    (p) => p.billing_period === periode || Number(p.price) === 0,
  );

  const adaYangDiproses = planDiproses !== null;

  function pesan(plan: Plan) {
    setAkanDipesan(null);
    setPlanDiproses(plan.plan_id);
    startTransition(async () => {
      try {
        const hasil = await orderPlan(plan.plan_id);
        if (hasil.error) {
          toast.error(hasil.error);
          return;
        }
        toast.success(
          `Pesanan ${hasil.order?.code} untuk paket ${hasil.order?.tier} dibuat. Silakan transfer.`,
        );
        router.refresh();
      } finally {
        // Wajib di finally: tanpa ini, kegagalan jaringan meninggalkan tombol
        // terkunci "Memproses…" selamanya sampai halaman dimuat ulang.
        setPlanDiproses(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pilih Paket</h2>
        <div className="inline-flex rounded-md border p-0.5">
          {(["monthly", "annual"] as const).map((p) => (
            <button
              key={p}
              type="button"
              disabled={adaYangDiproses}
              onClick={() => setPeriode(p)}
              className={`rounded px-3 py-1 text-sm transition disabled:opacity-50 ${
                periode === p
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "monthly" ? "Bulanan" : "Tahunan"}
            </button>
          ))}
        </div>
      </div>

      {periode === "annual" && (
        <p className="text-sm text-muted-foreground">
          Berlangganan tahunan setara membayar 10 bulan — hemat 2 bulan.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {terlihat.map((plan) => {
          const gratis = Number(plan.price) === 0;
          const enterprise = plan.tier === "enterprise";
          const iniPaketSaya =
            plan.tier === tierSekarang &&
            (gratis || plan.billing_period === periodeSekarang);
          const iniYangDiproses = planDiproses === plan.plan_id;

          return (
            <Card
              key={plan.plan_id}
              className={
                iniYangDiproses
                  ? "border-primary ring-2 ring-primary/30"
                  : iniPaketSaya
                    ? "border-primary"
                    : undefined
              }
            >
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base capitalize">
                  {plan.tier}
                  {iniPaketSaya && <Badge variant="secondary">Paket Anda</Badge>}
                </CardTitle>
                <CardDescription>
                  {enterprise ? (
                    <span className="text-foreground">Hubungi kami</span>
                  ) : gratis ? (
                    <span className="text-foreground">Gratis selamanya</span>
                  ) : (
                    <>
                      <span className="text-xl font-semibold text-foreground">
                        {formatRupiah(Number(plan.price))}
                      </span>
                      <span>/{periode === "annual" ? "tahun" : "bulan"}</span>
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>{plan.limits?.max_branches ?? "Tak terbatas"} cabang</li>
                  <li>{plan.limits?.max_users ?? "Tak terbatas"} pengguna</li>
                </ul>

                {enterprise ? (
                  <Button variant="outline" className="w-full" disabled>
                    Hubungi kami
                  </Button>
                ) : gratis ? (
                  <Button variant="outline" className="w-full" disabled>
                    {iniPaketSaya ? "Sedang dipakai" : "Paket bawaan"}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    disabled={adaYangDiproses || adaPending || iniPaketSaya}
                    onClick={() => setAkanDipesan(plan)}
                  >
                    {/* Label hanya berubah pada kartu yang benar-benar ditekan. */}
                    {iniYangDiproses
                      ? "Memproses…"
                      : iniPaketSaya
                        ? "Sedang dipakai"
                        : adaPending
                          ? "Selesaikan pesanan dulu"
                          : `Pilih ${plan.tier}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Konfirmasi eksplisit: menyebut paket, periode, dan nilainya, supaya
          tidak ada pesanan yang lahir dari satu klik yang salah sasaran. */}
      <Dialog
        open={akanDipesan !== null}
        onOpenChange={(open) => !open && setAkanDipesan(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konfirmasi Paket</DialogTitle>
            <DialogDescription>
              {akanDipesan && (
                <>
                  Anda akan memesan paket{" "}
                  <strong className="capitalize text-foreground">
                    {akanDipesan.tier}
                  </strong>{" "}
                  {akanDipesan.billing_period === "annual" ? "tahunan" : "bulanan"}{" "}
                  senilai{" "}
                  <strong className="text-foreground">
                    {formatRupiah(Number(akanDipesan.price))}
                  </strong>
                  . Setelah ini Anda akan menerima nomor pesanan dan instruksi
                  transfer. Paket aktif setelah pembayaran kami verifikasi.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAkanDipesan(null)}>
              Batal
            </Button>
            <Button
              onClick={() => akanDipesan && pesan(akanDipesan)}
              disabled={adaYangDiproses}
            >
              {akanDipesan
                ? `Pesan ${akanDipesan.tier} — ${formatRupiah(Number(akanDipesan.price))}`
                : "Pesan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
