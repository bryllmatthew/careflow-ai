import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { Permission } from "./permissions";
import { ForbiddenError, UnauthenticatedError } from "./errors";

export type PermissionScope = {
  organizationId: string;
  /** Omit to check organization-wide access; include to check one clinic specifically. */
  clinicId?: string;
};

/**
 * Non-throwing permission check, for UI gating (hide a button, disable an
 * action) and for branching logic that has a legitimate non-error path when
 * the permission is missing.
 *
 * Calls public.has_permission(), which delegates to the same app.*
 * SECURITY DEFINER helpers the RLS policies use -- this can never grant
 * access RLS itself would deny, and vice versa. See CLAUDE.md
 * ("Non-negotiable security rules").
 */
export async function can(permission: Permission, scope: PermissionScope): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase.rpc("has_permission", {
    p_permission: permission,
    p_organization_id: scope.organizationId,
    p_clinic_id: scope.clinicId,
  });

  return !error && data === true;
}

/**
 * Throwing permission check for Server Actions and Route Handlers: the
 * mandatory gate before any mutation, per docs/AUTHORIZATION.md section 18
 * ("authenticate -> determine membership -> determine clinic access -> check
 * permission -> validate resource ownership -> execute -> return only
 * authorized data").
 *
 * This is defense-in-depth, not the boundary -- RLS enforces the same rule
 * independently at the database level. Its job here is to fail fast with a
 * clear error instead of surfacing a raw Postgres 42501 to the UI.
 */
export async function requirePermission(
  permission: Permission,
  scope: PermissionScope,
): Promise<{ userId: string }> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new UnauthenticatedError();
  }

  const { data, error } = await supabase.rpc("has_permission", {
    p_permission: permission,
    p_organization_id: scope.organizationId,
    p_clinic_id: scope.clinicId,
  });

  if (error || data !== true) {
    throw new ForbiddenError(`Missing permission: ${permission}`);
  }

  return { userId: user.id };
}

/**
 * Row-existence checks for route guards ("can this user open this clinic's
 * settings page at all"). Deliberately implemented as "does a SELECT of this
 * row return anything" rather than re-deriving scope logic -- that is
 * exactly the question the table's own RLS SELECT policy already answers,
 * so this can never drift from what the database actually enforces.
 */
export async function canAccessOrganization(organizationId: string): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", organizationId)
    .maybeSingle();
  return data !== null;
}

export async function canAccessClinic(clinicId: string): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.from("clinics").select("id").eq("id", clinicId).maybeSingle();
  return data !== null;
}

// canAccessPatient / canAccessAppointment / canAccessInvoice (per
// docs/AUTHORIZATION.md section 17) are deferred: the tables they would
// check don't exist until Phase 2 and Phase 5. Add them there, following the
// same row-existence pattern as canAccessClinic above.

/**
 * The caller's full permission set within one organization, in a single
 * round trip. For filtering UI (navigation, buttons) against many possible
 * permissions at once -- never for an individual authorization decision,
 * where requirePermission()/can() remain the source of truth.
 */
export async function getPermissionSet(organizationId: string): Promise<Set<Permission>> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_permissions", {
    p_organization_id: organizationId,
  });
  if (error || !data) return new Set();
  return new Set(data as Permission[]);
}
