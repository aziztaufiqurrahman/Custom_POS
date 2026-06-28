import { requireAuth } from "@/lib/auth";
import { ComingSoon } from "@/components/layout/coming-soon";

export default async function InventoryPage() {
  await requireAuth();
  return <ComingSoon title="Inventory & Stock Opname" phase="Tahap 6" />;
}
