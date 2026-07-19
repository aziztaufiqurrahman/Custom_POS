import { requireAuth } from "@/lib/auth";
import { AuthProvider } from "@/components/providers/auth-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuth();

  return (
    <AuthProvider profile={profile}>
      <div className="flex min-h-svh bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </AuthProvider>
  );
}
