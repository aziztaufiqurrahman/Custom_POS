import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";
import { SUPABASE_URL, getServiceRoleKey } from "@/lib/supabase/env";

/**
 * Pemeliharaan billing harian: tandai langganan jatuh tempo, lalu turunkan yang
 * sudah lewat masa tenggang 7 hari ke limit Gratis.
 *
 * Dijadwalkan Vercel Cron (lihat `vercel.json`). Dipilih daripada pg_cron
 * karena ekstensi itu belum terpasang di kedua proyek, dan menambah ekstensi
 * pada database berisi data pelanggan bukan langkah yang perlu diambil hanya
 * untuk satu job harian.
 *
 * Memakai service role karena berjalan tanpa sesi pengguna — dan RPC-nya
 * memang bersifat lintas-workspace, sehingga tidak boleh terikat RLS satu
 * tenant.
 */
export const dynamic = "force-dynamic";

function tolak(pesan: string, status: number) {
  return NextResponse.json({ error: pesan }, { status });
}

export async function GET(request: NextRequest) {
  // Vercel Cron mengirim header ini; CRON_SECRET mencegah endpoint dipanggil
  // sembarang orang. Tanpa secret yang terpasang, endpoint ditutup rapat —
  // bukan dibiarkan terbuka.
  const secret = process.env.CRON_SECRET;
  if (!secret) return tolak("CRON_SECRET belum dikonfigurasi", 503);

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) return tolak("Tidak berwenang", 401);

  const serviceKey = getServiceRoleKey();
  if (!serviceKey) return tolak("SUPABASE_SERVICE_ROLE_KEY belum dikonfigurasi", 503);

  const supabase = createClient<Database>(SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("run_billing_maintenance");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, hasil: data });
}
