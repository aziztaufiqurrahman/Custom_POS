import { requireAuth } from "@/lib/auth";
import { ComingSoon } from "@/components/layout/coming-soon";

export default async function PosPage() {
  await requireAuth();
  return <ComingSoon title="Layar Kasir" phase="Tahap 5" />;
}
