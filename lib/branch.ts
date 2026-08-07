import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BranchRole } from "@/lib/constants";

export const ACTIVE_BRANCH_COOKIE = "pos_active_branch";

// MAIN_BRANCH_ID sengaja DIHAPUS (KEP-009). Di multi-tenant setiap workspace
// punya Cabang Pusat sendiri, ditandai kolom `branches.is_main`. Pakai
// `ctx.mainBranchId` dari getBranchContext(), jangan pernah menanam UUID.

export type BranchLite = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  is_main: boolean;
  /**
   * Nullable karena di database yang belum bertenant (STAGING/CI, atau sesaat
   * sebelum provisioning workspace pertama) cabang seed '…c1' masih menggantung
   * — lihat 0028 Bagian 2a. Di PROD kolom ini NOT NULL. `workspaceId` di
   * BranchContext sudah memperlakukan null sebagai "belum ada workspace".
   */
  workspace_id: string | null;
};

export type MembershipLite = {
  branch_id: string;
  role: BranchRole;
  permissions: string[];
};

export type BranchContext = {
  isMasterAdmin: boolean;
  memberships: MembershipLite[];
  branches: BranchLite[]; // cabang yang boleh diakses user
  activeBranchId: string | null;
  activeBranch: BranchLite | null;
  /** Workspace aktif (tenant induk). Null bila user belum punya cabang. */
  workspaceId: string | null;
  /** Cabang Pusat workspace ini — pengganti MAIN_BRANCH_ID (KEP-009). */
  mainBranchId: string | null;
};

/**
 * Konteks cabang untuk request saat ini: cabang yang boleh diakses + cabang
 * aktif (dari cookie). Master admin melihat semua cabang aktif; manajer/kasir
 * hanya cabang keanggotaannya. Dibungkus cache (sekali per request).
 */
export const getBranchContext = cache(async (): Promise<BranchContext> => {
  const { userId, profile } = await getSession();
  const empty: BranchContext = {
    isMasterAdmin: false,
    memberships: [],
    branches: [],
    activeBranchId: null,
    activeBranch: null,
    workspaceId: null,
    mainBranchId: null,
  };
  if (!userId || !profile) return empty;

  const isMasterAdmin = profile.is_master_admin === true;
  const supabase = await createClient();

  const { data: mRows } = await supabase
    .from("branch_memberships")
    .select("branch_id, role, permissions")
    .eq("user_id", userId)
    .eq("is_active", true);
  const memberships: MembershipLite[] = (mRows ?? []).map((m) => ({
    branch_id: m.branch_id,
    role: m.role as BranchRole,
    permissions: m.permissions ?? [],
  }));

  let branches: BranchLite[] = [];
  if (isMasterAdmin) {
    const { data } = await supabase
      .from("branches")
      .select("id, code, name, is_active, is_main, workspace_id")
      .eq("is_active", true)
      .order("name");
    branches = data ?? [];
  } else if (memberships.length > 0) {
    const ids = memberships.map((m) => m.branch_id);
    const { data } = await supabase
      .from("branches")
      .select("id, code, name, is_active, is_main, workspace_id")
      .in("id", ids)
      .eq("is_active", true)
      .order("name");
    branches = data ?? [];
  }

  const cookieStore = await cookies();
  const cookieBranch = cookieStore.get(ACTIVE_BRANCH_COOKIE)?.value ?? null;
  // Cabang aktif mengikuti switcher (cookie) untuk semua peran. Penguncian ke
  // Pusat hanya diberlakukan lokal di fitur Inventory (lihat inventory/*).
  const activeBranchId =
    (cookieBranch && branches.some((b) => b.id === cookieBranch)
      ? cookieBranch
      : branches[0]?.id) ?? null;
  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;

  // Workspace & Cabang Pusat diturunkan dari cabang yang boleh diakses user —
  // bukan dari UUID hardcode (KEP-009). RLS sudah memastikan `branches` hanya
  // berisi cabang milik workspace user, jadi aman diambil dari sini.
  const workspaceId = activeBranch?.workspace_id ?? branches[0]?.workspace_id ?? null;
  const mainBranchId =
    branches.find((b) => b.is_main && b.workspace_id === workspaceId)?.id ?? null;

  return {
    isMasterAdmin,
    memberships,
    branches,
    activeBranchId,
    activeBranch,
    workspaceId,
    mainBranchId,
  };
});
