import "server-only";
import { getAuthContext } from "@/lib/auth/session";
import { getPermissionSet } from "@/lib/auth/require-permission";
import type { Permission } from "@/lib/auth/permissions";
import { getReportingContext } from "@/app/(app)/reports/context";
import { UnauthenticatedError, NotFoundError } from "@/lib/auth/errors";

/**
 * Everything a tool handler or the system prompt may need about "who is
 * asking" -- resolved ONCE per request, entirely server-side, from the
 * session. Nothing in here is ever accepted as AI/tool input (docs/AI_TOOLS.md
 * section 3/5, CLAUDE.md rule 4): organization_id, permissions, clinics and
 * the current date all come from this object, never from the model.
 */
export type AIContext = {
  userId: string;
  organizationId: string;
  permissions: Set<Permission>;
  /** Clinics this user may access (RLS-bounded, via the same listClinicOptions() the dashboard filter uses). */
  clinics: { id: string; name: string }[];
  currency: string;
  timezone: string;
  /** Current date/time in the organization's timezone, as an ISO instant -- so the model resolves "today"/"this week" against the real clock, never guesses (docs/AI_TOOLS.md section 3). */
  nowIso: string;
};

export function hasPermission(ctx: AIContext, permission: Permission): boolean {
  return ctx.permissions.has(permission);
}

/**
 * Resolves the acting user's organization, permission set, authorized
 * clinics, and locale in one place -- reusing the exact same helpers every
 * other module uses (getAuthContext, getPermissionSet, getReportingContext)
 * rather than a parallel AI-specific resolution (CLAUDE.md / section 66).
 * Throws if there is no session or no active organization membership --
 * callers (the chat route, the dashboard insight) are already behind
 * page-level auth and should never reach here otherwise.
 */
export async function resolveAIContext(): Promise<AIContext> {
  const auth = await getAuthContext();
  if (!auth) throw new UnauthenticatedError();

  const organizationId = auth.memberships[0]?.organizationId;
  if (!organizationId) throw new NotFoundError("No active organization.");

  const [permissions, reporting] = await Promise.all([
    getPermissionSet(organizationId),
    getReportingContext(organizationId),
  ]);

  return {
    userId: auth.userId,
    organizationId,
    permissions,
    clinics: reporting.clinics,
    currency: reporting.currency,
    timezone: reporting.timezone,
    nowIso: new Date().toISOString(),
  };
}
