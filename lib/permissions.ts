import type { Permission } from "@/lib/constants";
import type { Profile } from "@/types";

/** True bila profil adalah admin aktif. */
export function isAdmin(profile: Profile | null | undefined): boolean {
  return profile?.role === "admin" && profile.is_active === true;
}

/**
 * True bila profil boleh melakukan aksi `perm`.
 * Admin selalu boleh; kasir harus aktif dan memiliki permission tersebut.
 */
export function can(
  profile: Profile | null | undefined,
  perm: Permission,
): boolean {
  if (!profile || !profile.is_active) return false;
  if (profile.role === "admin") return true;
  return (profile.permissions ?? []).includes(perm);
}
