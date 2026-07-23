import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { themeCss } from "@/lib/themes";
import { AuthProvider } from "@/components/providers/auth-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuth();

  // Tema kustom toko (dipilih admin). Disuntikkan sebagai override :root khusus
  // area dashboard, sehingga menimpa token globals.css secara menyeluruh —
  // termasuk elemen yang di-portal (dropdown/dialog/toast). Tanpa mengubah
  // komponen apa pun; hanya nilai token warna/font/sudut.
  const supabase = await createClient();
  const { data: theme } = await supabase
    .from("store_settings")
    .select("theme_preset, theme_primary, theme_radius, theme_font")
    .limit(1)
    .maybeSingle();

  const css = themeCss({
    presetKey: theme?.theme_preset,
    primary: theme?.theme_primary,
    radius: theme?.theme_radius,
    font: theme?.theme_font,
  });

  return (
    <AuthProvider profile={profile}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
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
