import { requireAuth } from "@/lib/auth";
import { ComingSoon } from "@/components/layout/coming-soon";

export default async function ProductsPage() {
  await requireAuth();
  return <ComingSoon title="Manajemen Produk" phase="Tahap 3" />;
}
