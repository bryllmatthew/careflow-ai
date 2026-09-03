import { Users as UsersIcon, UserPlus } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InviteDialog } from "./invite-dialog";
import { MembersTable, type MemberRow } from "./members-table";

export default async function UsersPage() {
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("users.view", { organizationId });

  const supabase = await getSupabaseServerClient();
  const [
    { data: memberships },
    { data: grants },
    { data: roles },
    canInvite,
    canManageRoles,
    canManageStatus,
  ] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("id, user_id, status, profiles(full_name, email)")
      .eq("organization_id", organizationId)
      .order("created_at"),
    supabase
      .from("user_roles")
      .select("id, user_id, clinic_id, roles(key, name)")
      .eq("organization_id", organizationId),
    supabase.from("roles").select("id, key, name").is("organization_id", null).order("name"),
    can("users.invite", { organizationId }),
    can("roles.manage", { organizationId }),
    can("users.update", { organizationId }),
  ]);

  const grantsByUser = new Map<string, MemberRow["grants"]>();
  for (const g of grants ?? []) {
    const list = grantsByUser.get(g.user_id) ?? [];
    list.push({
      userRoleId: g.id,
      roleKey: g.roles?.key ?? "unknown",
      roleName: g.roles?.name ?? "Unknown role",
      orgWide: g.clinic_id === null,
    });
    grantsByUser.set(g.user_id, list);
  }

  const rows: MemberRow[] = (memberships ?? []).map((m) => ({
    membershipId: m.id,
    userId: m.user_id,
    fullName: m.profiles?.full_name ?? null,
    email: m.profiles?.email ?? "—",
    status: m.status,
    isSelf: m.user_id === auth!.userId,
    grants: grantsByUser.get(m.user_id) ?? [],
  }));

  const roleOptions = (roles ?? []).map((r) => ({ id: r.id, name: r.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Users"
        description="Who has access to your organization, and what they can do."
        actions={
          <PermissionGate allowed={canInvite}>
            <InviteDialog
              roles={roleOptions}
              trigger={
                <Button>
                  <UserPlus className="size-4" />
                  Invite user
                </Button>
              }
            />
          </PermissionGate>
        }
      />

      {rows.length === 0 ? (
        <EmptyState icon={UsersIcon} title="No members yet" />
      ) : (
        <Card className="p-0">
          <MembersTable
            members={rows}
            roles={roleOptions}
            canManageStatus={canManageStatus}
            canManageRoles={canManageRoles}
          />
        </Card>
      )}
    </div>
  );
}
