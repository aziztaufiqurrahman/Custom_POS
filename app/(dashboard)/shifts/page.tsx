import { requireAuth } from "@/lib/auth";
import { ComingSoon } from "@/components/layout/coming-soon";

export default async function ShiftsPage() {
  await requireAuth();
  return <ComingSoon title="Sesi Kas / Shift" phase="Tahap 4" />;
}
