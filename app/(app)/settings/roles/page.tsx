import { Fragment } from "react";
import { Check } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/**
 * Read-only for the MVP: custom role creation (create_custom_role,
 * set_role_permissions) is deferred to whenever a real multi-role-per-
 * organization use case needs it -- see CLAUDE.md "Known open questions".
 * The 7 system roles are seeded by migration and immutable to every client
 * (migration 0002's role_permissions_no_system_writes trigger), so there is
 * nothing to edit here yet regardless.
 */
export default async function RolesPage() {
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("roles.view", { organizationId });

  const supabase = await getSupabaseServerClient();
  const [{ data: roles }, { data: permissions }, { data: rolePermissions }] = await Promise.all([
    supabase.from("roles").select("id, key, name").is("organization_id", null).order("name"),
    supabase.from("permissions").select("key, category, description").order("key"),
    supabase.from("role_permissions").select("role_id, permission_key"),
  ]);

  const grantedSet = new Set(
    (rolePermissions ?? []).map((rp) => `${rp.role_id}:${rp.permission_key}`),
  );

  const categories = Array.from(new Set((permissions ?? []).map((p) => p.category)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Roles"
        description="What each role can do. Roles are shared across every organization and can't be edited yet."
      />

      <Card className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Permission</TableHead>
              {(roles ?? []).map((r) => (
                <TableHead key={r.id} className="text-center whitespace-nowrap">
                  {r.name}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <Fragment key={category}>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableCell
                    colSpan={(roles?.length ?? 0) + 1}
                    className="text-muted-foreground text-xs font-medium tracking-wide uppercase"
                  >
                    {category}
                  </TableCell>
                </TableRow>
                {(permissions ?? [])
                  .filter((p) => p.category === category)
                  .map((p) => (
                    <TableRow key={p.key}>
                      <TableCell className="text-sm">
                        <div>{p.description}</div>
                        <div className="text-muted-foreground font-mono text-xs">{p.key}</div>
                      </TableCell>
                      {(roles ?? []).map((r) => (
                        <TableCell key={r.id} className="text-center">
                          {grantedSet.has(`${r.id}:${p.key}`) && (
                            <Check className="text-success mx-auto size-4" aria-label="Granted" />
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
