import type { ReactNode } from "react";

/**
 * Hides UI the current user cannot use -- buttons, actions, nav items.
 * `allowed` is always computed server-side (requirePermission()/can()) and
 * passed down as a plain boolean; per docs/AUTHORIZATION.md section 19 this
 * is UX only, never a security boundary. The Server Action a hidden button
 * would have called still enforces the same permission itself, and RLS
 * enforces it again independently at the database level.
 */
export function PermissionGate({ allowed, children }: { allowed: boolean; children: ReactNode }) {
  if (!allowed) return null;
  return <>{children}</>;
}
