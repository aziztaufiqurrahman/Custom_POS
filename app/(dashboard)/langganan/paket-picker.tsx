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
  const [pending, startTransition] = useTransition();
  const [periode, setPeriode] = useState<"monthly" | "annual">(
    periodeSekarang === "annual" ? "annual" : "monthly",
  );

  // Gratis & Enterprise tidak bisa dipesan sendiri (harga 0): yang satu bawaan,
  // yang lain dinegosiasikan. Keduanya tetap ditampilkan sebagai konteks.
  const terlihat = plans.filter(
    (p) => p.billing_period === periode || Number(p.price) === 0,
  );

  function pesan(plan: Plan) {
    startTransition(async () => {
      const hasil = await orderPlan(plan.plan_id);
      if (hasil.error) {
        toast.error(hasil.error);
        return;
      }
      toast.success(`Pesanan ${hasil.order?.code} dibuat. Silakan transfer.`);
      router.refresh();
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
              onClick={() => setPeriode(p)}
              className={`rounded px-3 py-1 text-sm transition ${
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

          return (
            <Card key={plan.plan_id} className={iniPaketSaya ? "border-primary" : undefined}>
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
                  <li>
                    {plan.limits?.max_branches ?? "Tak terbatas"} cabang
                  </li>
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
                    disabled={pending || adaPending || iniPaketSaya}
                    onClick={() => pesan(plan)}
                  >
                    {iniPaketSaya
                      ? "Sedang dipakai"
                      : adaPending
                        ? "Selesaikan pesanan dulu"
                        : pending
                          ? "Memproses…"
                          : "Pilih Paket"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
