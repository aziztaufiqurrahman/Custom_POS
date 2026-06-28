import { requireAuth } from "@/lib/auth";
import { ComingSoon } from "@/components/layout/coming-soon";

export default async function SalesPage() {
  await requireAuth();
  return <ComingSoon title="Rekap Penjualan" phase="Tahap 7" />;
}
