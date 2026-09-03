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
};

/**
 * Resolves the current session and active organization memberships in one
 * round trip. Returns null when there is no session -- callers decide
 * whether that means redirect to /login (most pages) or render as
 * unauthenticated (rare).
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

  const { data: memberships } = await supabase
    .from("organization_memberships")
    .select("organization_id, organizations(name)")
    .eq("status", "active");

  return {
    userId: user.id,
    email: user.email ?? null,
    memberships: (memberships ?? []).map((m) => ({
      organizationId: m.organization_id,
      organizationName: m.organizations?.name ?? "Untitled organization",
    })),
  };
}
