"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { publicEnv } from "@/lib/env";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { inviteMemberSchema, type InviteMemberInput } from "@/lib/validation/invite.schema";

/**
 * The one file in this codebase allowed to import the service-role admin
 * client on a request path (see eslint.config.mjs's allowlist) --
 * inviting someone with no existing auth.users row requires GoTrue's admin
 * API, which has no SQL/RLS-respecting equivalent. Every action below still
 * calls requirePermission() using the NORMAL client first; the admin client
 * is reached only after that already-authorized check passes, and only for
 * the exact operation (auth.admin.inviteUserByEmail) nothing else can do.
 */
async function currentOrganizationId(): Promise<string> {
  const auth = await getAuthContext();
  const orgId = auth?.memberships[0]?.organizationId;
  if (!orgId) throw new UnauthenticatedError();
  return orgId;
}

export async function inviteUserAction(
  input: InviteMemberInput,
): Promise<{ error: string } | { error?: undefined }> {
  const parsed = inviteMemberSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const organizationId = await currentOrganizationId();
  await requirePermission("users.invite", { organizationId });

  const admin = createAdminClient();
  const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${publicEnv().NEXT_PUBLIC_APP_URL}/accept-invite`,
    // Read back after acceptance via auth.getUser().user_metadata -- never
    // accept an organization_id supplied by the client at that point, per
    // CLAUDE.md ("Never trust organization_id... from the client"). This
    // value is set here, server-side, by the same admin call that creates
    // the account, so it's safe to trust when read back.
    data: { invited_organization_id: organizationId },
  });
  if (inviteError || !data.user) {
    return { error: inviteError?.message ?? "Couldn't send the invitation." };
  }

  // The membership + role grant are authorized and written entirely in SQL
  // (invite_member, migration 0008) via the NORMAL client, so RLS/the
  // no-amplification checks apply exactly as they do for every other role
  // grant -- the admin client's job ends the moment the auth user exists.
  const supabase = await getSupabaseServerClient();
  const { error: rpcError } = await supabase.rpc("invite_member", {
    p_organization_id: organizationId,
    p_user_id: data.user.id,
    p_role_id: parsed.data.roleId,
  });
  if (rpcError) {
    return { error: rpcError.message };
  }

  revalidatePath("/settings/users");
  return {};
}

export async function setMemberStatusAction(
  membershipId: string,
  status: "active" | "suspended" | "removed",
) {
  const organizationId = await currentOrganizationId();
  await requirePermission("users.update", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("set_membership_status", {
    p_membership_id: membershipId,
    p_status: status,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/settings/users");
}

export async function grantRoleAction(targetUserId: string, roleId: string) {
  const organizationId = await currentOrganizationId();
  await requirePermission("roles.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("grant_user_role", {
    p_target_user: targetUserId,
    p_role_id: roleId,
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/settings/users");
}

export async function revokeRoleAction(userRoleId: string) {
  const organizationId = await currentOrganizationId();
  await requirePermission("roles.manage", { organizationId });

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("revoke_user_role", { p_user_role_id: userRoleId });
  if (error) throw new Error(error.message);

  revalidatePath("/settings/users");
}
