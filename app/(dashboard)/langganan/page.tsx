import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRupiah } from "@/lib/format";
import { formatTanggal } from "@/lib/date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { PaketPicker } from "./paket-picker";

export const metadata = { title: "Langganan" };

type Langganan = {
  tier: string;
  billing_period: string;
  status: string;
  current_period_end: string | null;
  limits: { max_branches?: number | null; max_users?: number | null } | null;
};

const LABEL_STATUS: Record<string, { teks: string; nada: "ok" | "warn" | "bad" }> = {
  active: { teks: "Aktif", nada: "ok" },
  trialing: { teks: "Masa Coba", nada: "ok" },
  past_due: { teks: "Jatuh Tempo", nada: "warn" },
  suspended: { teks: "Ditangguhkan", nada: "bad" },
  cancelled: { teks: "Dibatalkan", nada: "bad" },
  expired: { teks: "Kedaluwarsa", nada: "bad" },
};

export default async function LanggananPage() {
  await requireAuth();
  const supabase = await createClient();

  const [{ data: subRows }, { data: planRows }, { data: pendingRows }, { data: bankRows }] =
    await Promise.all([
      supabase.rpc("my_subscription"),
      supabase.rpc("available_plans"),
      supabase.rpc("my_pending_order"),
      supabase.rpc("billing_info"),
    ]);

  const sub = (Array.isArray(subRows) ? subRows[0] : null) as Langganan | null;
  const plans = (planRows ?? []) as {
    plan_id: string;
    tier: string;
    billing_period: string;
    price: number;
    limits: { max_branches?: number | null; max_users?: number | null } | null;
  }[];
  const pending = (Array.isArray(pendingRows) ? pendingRows[0] : null) as {
    code: string;
    total: number;
    tier: string;
  } | null;
  const bank = (Array.isArray(bankRows) ? bankRows[0] : null) as {
    bank_name: string;
    account_number: string;
    account_holder: string;
    instructions: string;
    whatsapp: string | null;
  } | null;

  const status = sub ? (LABEL_STATUS[sub.status] ?? { teks: sub.status, nada: "warn" as const }) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Langganan</h1>
        <p className="text-sm text-muted-foreground">
          Kelola paket dan batas pemakaian usaha Anda.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            Paket Saat Ini
            {status && (
              <Badge
                variant={
                  status.nada === "ok"
                    ? "default"
                    : status.nada === "warn"
                      ? "secondary"
                      : "destructive"
                }
              >
                {status.teks}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            {sub ? (
              <>
                <span className="font-medium capitalize text-foreground">{sub.tier}</span>
                {sub.billing_period === "annual" ? " · tahunan" : " · bulanan"}
                {sub.current_period_end && (
                  <> · berlaku sampai {formatTanggal(sub.current_period_end)}</>
                )}
              </>
            ) : (
              "Belum ada langganan aktif."
            )}
          </CardDescription>
        </CardHeader>
        {sub?.limits && (
          <CardContent className="flex gap-8 text-sm">
            <div>
              <div className="text-muted-foreground">Batas cabang</div>
              <div className="text-lg font-semibold">
                {sub.limits.max_branches ?? "Tak terbatas"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Batas pengguna</div>
              <div className="text-lg font-semibold">
                {sub.limits.max_users ?? "Tak terbatas"}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {pending && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardHeader>
            <CardTitle className="text-lg">Menunggu Pembayaran</CardTitle>
            <CardDescription>
              Pesanan <strong className="text-foreground">{pending.code}</strong> untuk paket{" "}
              <span className="capitalize">{pending.tier}</span> senilai{" "}
              <strong className="text-foreground">{formatRupiah(Number(pending.total))}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {bank?.account_number ? (
              <div className="rounded-md border bg-background p-3">
                <div className="font-medium">{bank.bank_name}</div>
                <div className="font-mono text-lg">{bank.account_number}</div>
                <div className="text-muted-foreground">a.n. {bank.account_holder}</div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                Rekening tujuan belum diatur. Hubungi kami untuk instruksi pembayaran.
              </p>
            )}
            <p>
              Cantumkan kode <strong>{pending.code}</strong> pada berita transfer agar
              pembayaran Anda cepat kami cocokkan.
            </p>
            {bank?.instructions && (
              <p className="text-muted-foreground">{bank.instructions}</p>
            )}
            {bank?.whatsapp && (
              <p className="text-muted-foreground">
                Sudah transfer? Konfirmasi ke WhatsApp {bank.whatsapp}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <PaketPicker
        plans={plans}
        tierSekarang={sub?.tier ?? null}
        periodeSekarang={sub?.billing_period ?? null}
        adaPending={pending != null}
      />
    </div>
  );
}
