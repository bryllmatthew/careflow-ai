import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type ActiveMembership = {
  organizationId: string;
  organizationName: string;
};

export type AuthContext = {
  userId: string;
  email: string | null;
  /** Organizations this user is an ACTIVE member of. Empty for a brand-new account. */
  memberships: ActiveMembership[];
  /**
   * True if the user has any membership row at all (invited, active,
   * suspended or removed), even when `memberships` is empty. Distinguishes
   * "never joined anything -- send them to onboarding" from "was suspended
   * or removed -- do not offer to create a new organization", which look
   * identical if you only look at active memberships.
   */
  hasAnyMembership: boolean;
};

/**
 * Resolves the current session and organization memberships in one round
 * trip. Returns null when there is no session -- callers decide whether
 * that means redirect to /login (most pages) or render as unauthenticated
 * (rare).
 *
 * This does NOT check any specific permission; it is the "who is asking"
 * half of authorization. See requirePermission() for the "are they allowed"
 * half.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Deliberately unfiltered by status: organization_memberships_select
  // always lets a user see their OWN row regardless of status (it is not
  // gated by users.view for that case), so this is one query, not two.
  const { data: memberships } = await supabase
    .from("organization_memberships")
    .select("organization_id, status, organizations(name)");

  const active = (memberships ?? []).filter((m) => m.status === "active");

  return {
    userId: user.id,
    email: user.email ?? null,
    memberships: active.map((m) => ({
      organizationId: m.organization_id,
      organizationName: m.organizations?.name ?? "Untitled organization",
    })),
    hasAnyMembership: (memberships ?? []).length > 0,
  };
}
