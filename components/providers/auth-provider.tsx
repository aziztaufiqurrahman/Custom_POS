"use client";

import { createContext, useContext, useMemo } from "react";

import { can as canFn, isAdmin as isAdminFn } from "@/lib/permissions";
import type { Permission } from "@/lib/constants";
import type { Profile } from "@/types";

export type BranchLite = {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
};

type AuthContextValue = {
  profile: Profile | null;
  isAdmin: boolean;
  isMasterAdmin: boolean;
  can: (perm: Permission) => boolean;
  branches: BranchLite[];
  activeBranch: BranchLite | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  profile,
  isMasterAdmin = false,
  branches = [],
  activeBranch = null,
  children,
}: {
  profile: Profile | null;
  isMasterAdmin?: boolean;
  branches?: BranchLite[];
  activeBranch?: BranchLite | null;
  children: React.ReactNode;
}) {
  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      isAdmin: isAdminFn(profile),
      isMasterAdmin,
      can: (perm: Permission) => canFn(profile, perm),
      branches,
      activeBranch,
    }),
    [profile, isMasterAdmin, branches, activeBranch],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam <AuthProvider>");
  return ctx;
}
