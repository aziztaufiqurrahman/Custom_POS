import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/types/database";

/**
 * Supabase client untuk Server Components, Route Handlers, dan Server Actions.
 * Memakai ANON KEY + sesi user dari cookie (RLS tetap berlaku atas nama user).
 *
 * Di Next.js 15 `cookies()` bersifat async, jadi fungsi ini async.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `setAll` dipanggil dari Server Component — aman diabaikan
            // bila middleware sudah menyegarkan sesi user.
          }
        },
      },
    },
  );
}
