import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";
import { SUPABASE_ANON_KEY, SUPABASE_URL, hasSupabaseEnv } from "./env";

/**
 * Menyegarkan sesi Supabase di setiap request dan melindungi route.
 * Dipanggil dari `middleware.ts` di root.
 *
 * Dibuat tahan-gagal: bila env Supabase belum tersedia atau terjadi error saat
 * memanggil Supabase, middleware TIDAK meng-crash (menghindari 500
 * MIDDLEWARE_INVOCATION_FAILED). Proteksi tetap ditegakkan di level halaman
 * (Server Component) via requireAuth().
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Env belum lengkap → jangan crash; lewati (halaman tetap dilindungi requireAuth).
  if (!hasSupabaseEnv()) {
    return supabaseResponse;
  }

  const { pathname } = request.nextUrl;
  // "/struk" = halaman invoice publik (dibuka konsumen via tautan WhatsApp).
  const publicPrefixes = [
    "/login",
    "/forgot-password",
    "/reset-password",
    "/auth",
    "/struk",
  ];
  const isPublic =
    publicPrefixes.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  try {
    const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    });

    // PENTING: jangan jalankan kode di antara createServerClient dan getUser().
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Belum login & bukan halaman publik → arahkan ke /login.
    if (!user && !isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    // Sudah login tapi membuka /login atau /forgot-password → arahkan ke beranda.
    if (user && (pathname === "/login" || pathname === "/forgot-password")) {
      const url = request.nextUrl.clone();
      url.pathname = "/pos";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch {
    // Jangan pernah melempar dari middleware (mencegah 500). Biarkan request lewat;
    // halaman terproteksi akan mengalihkan sendiri via requireAuth().
    return supabaseResponse;
  }
}
