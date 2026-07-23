import type { CSSProperties } from "react";

import { requireAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { themeVars } from "@/lib/themes";
import { AuthProvider } from "@/components/providers/auth-provider";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { profile } = await requireAuth();

  // Tema kustom toko (dipilih admin). Diterapkan sebagai CSS variable inline
  // pada pembungkus dashboard sehingga menimpa token globals.css untuk seluruh
  // area aplikasi — tanpa mengubah komponen apa pun.
  const supabase = await createClient();
  const { data: theme } = await supabase
    .from("store_settings")
    .select("theme_preset, theme_primary, theme_radius, theme_font")
    .limit(1)
    .maybeSingle();

  const style = themeVars({
    presetKey: theme?.theme_preset,
    primary: theme?.theme_primary,
    radius: theme?.theme_radius,
    font: theme?.theme_font,
  }) as CSSProperties;

  return (
    <AuthProvider profile={profile}>
      <div
        style={style}
        className="flex min-h-svh bg-background font-sans text-foreground"
      >
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </AuthProvider>
  );
}
