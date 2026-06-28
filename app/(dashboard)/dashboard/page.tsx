import { requireAdmin } from "@/lib/auth";
import { ComingSoon } from "@/components/layout/coming-soon";

export default async function DashboardPage() {
  await requireAdmin();
  return <ComingSoon title="Dashboard Pendapatan" phase="Tahap 8" />;
}
