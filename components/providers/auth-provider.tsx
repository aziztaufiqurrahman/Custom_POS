"use client";

import { createContext, useContext, useMemo } from "react";

import { can as canFn, isAdmin as isAdminFn } from "@/lib/permissions";
import type { Permission } from "@/lib/constants";
import type { Profile } from "@/types";

type AuthContextValue = {
  profile: Profile | null;
  isAdmin: boolean;
  can: (perm: Permission) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  profile,
  children,
}: {
  profile: Profile | null;
  children: React.ReactNode;
}) {
  const value = useMemo<AuthContextValue>(
    () => ({
      profile,
      isAdmin: isAdminFn(profile),
      can: (perm: Permission) => canFn(profile, perm),
    }),
    [profile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus dipakai di dalam <AuthProvider>");
  return ctx;
}
