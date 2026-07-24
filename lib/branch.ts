import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { getSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { BranchRole } from "@/lib/constants";

export const ACTIVE_BRANCH_COOKIE = "pos_active_branch";

export type BranchLite = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
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
      .select("id, code, name, is_active")
      .eq("is_active", true)
      .order("name");
    branches = data ?? [];
  } else if (memberships.length > 0) {
    const ids = memberships.map((m) => m.branch_id);
    const { data } = await supabase
      .from("branches")
      .select("id, code, name, is_active")
      .in("id", ids)
      .eq("is_active", true)
      .order("name");
    branches = data ?? [];
  }

  const cookieStore = await cookies();
  const cookieBranch = cookieStore.get(ACTIVE_BRANCH_COOKIE)?.value ?? null;
  const activeBranchId =
    (cookieBranch && branches.some((b) => b.id === cookieBranch)
      ? cookieBranch
      : branches[0]?.id) ?? null;
  const activeBranch = branches.find((b) => b.id === activeBranchId) ?? null;

  return { isMasterAdmin, memberships, branches, activeBranchId, activeBranch };
});
