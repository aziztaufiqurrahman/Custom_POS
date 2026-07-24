"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Clock, X } from "lucide-react";

import { decideApproval } from "./actions";
import type { ApprovalRow } from "./page";
import { formatTanggalWaktu } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const TYPE_LABEL: Record<string, string> = {
  void: "Void transaksi",
  refund: "Refund transaksi",
  discount_override: "Override diskon",
  price_override: "Override harga",
  stock_adjustment: "Penyesuaian stok",
  no_sale: "Buka laci (no-sale)",
};

const STATUS: Record<string, { label: string; variant: "outline" | "default" | "destructive" | "secondary" }> = {
  pending: { label: "Menunggu", variant: "secondary" },
  approved: { label: "Disetujui", variant: "default" },
  rejected: { label: "Ditolak", variant: "destructive" },
};

export function ApprovalsClient({ approvals }: { approvals: ApprovalRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const waiting = approvals.filter((a) => a.status === "pending");
  const history = approvals.filter((a) => a.status !== "pending");

  function decide(a: ApprovalRow, decision: "approved" | "rejected") {
    setBusy(a.id);
    start(async () => {
      const res = await decideApproval(a.id, decision);
      setBusy(null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(decision === "approved" ? "Permintaan disetujui" : "Permintaan ditolak");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-5 text-primary" /> Menunggu Persetujuan
            {waiting.length > 0 && <Badge variant="secondary">{waiting.length}</Badge>}
          </CardTitle>
          <CardDescription>
            Tinjau permintaan aksi sensitif. Anda tidak dapat menyetujui permintaan
            Anda sendiri.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {waiting.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Tidak ada permintaan menunggu.
            </p>
          ) : (
            waiting.map((a) => (
              <div key={a.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge>{TYPE_LABEL[a.request_type] ?? a.request_type}</Badge>
                    {a.reference_code && (
                      <span className="font-mono text-sm">{a.reference_code}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {a.branch_name}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending && busy === a.id}
                      onClick={() => decide(a, "rejected")}
                    >
                      <X className="size-4" /> Tolak
                    </Button>
                    <Button
                      size="sm"
                      disabled={pending && busy === a.id}
                      onClick={() => decide(a, "approved")}
                    >
                      <Check className="size-4" /> Setujui
                    </Button>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Diminta oleh <b>{a.requested_by_name}</b> · {formatTanggalWaktu(a.created_at)}
                </p>
                {a.reason && <p className="mt-1 text-sm">Alasan: {a.reason}</p>}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Riwayat Keputusan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-sm last:border-0"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS[a.status].variant}>{STATUS[a.status].label}</Badge>
                  <span>{TYPE_LABEL[a.request_type] ?? a.request_type}</span>
                  {a.reference_code && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {a.reference_code}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {a.requested_by_name} · {formatTanggalWaktu(a.created_at)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
