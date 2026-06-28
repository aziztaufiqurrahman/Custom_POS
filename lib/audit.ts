import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

/**
 * Catat aksi sensitif ke audit_logs (login, hapus produk, void, opname,
 * ubah karyawan/harga, dll.). actor_id diisi dari user sesi saat ini.
 */
export async function logAudit(entry: {
  action: string;
  entity?: string;
  entityId?: string | null;
  metadata?: Json;
}): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("audit_logs").insert({
    actor_id: user.id,
    action: entry.action,
    entity: entry.entity ?? null,
    entity_id: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
  });
}
