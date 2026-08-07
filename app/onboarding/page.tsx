import { redirect } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { getMyWorkspaceId } from "@/lib/workspace";

import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Siapkan Usaha Anda" };

export default async function OnboardingPage() {
  const { profile } = await requireAuth();

  // Sudah punya tenant → tidak ada yang perlu disiapkan.
  if ((await getMyWorkspaceId()) !== null) redirect("/pos");

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-md">
        <OnboardingForm namaPengguna={profile.full_name} />
      </div>
    </div>
  );
}
