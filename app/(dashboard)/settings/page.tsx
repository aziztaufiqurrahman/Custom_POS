import { requireAdmin } from "@/lib/auth";
import { ComingSoon } from "@/components/layout/coming-soon";

export default async function SettingsPage() {
  await requireAdmin();
  return <ComingSoon title="Pengaturan" phase="Tahap 9" />;
}
