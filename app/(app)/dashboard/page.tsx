import Link from "next/link";
import { DollarSign, CalendarCheck, UserPlus, Wallet, Building2, Users } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { StatTile } from "@/components/patterns/stat-tile";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * The four top-level metrics from docs/UI_UX_SPEC.md ("Dashboard") show an
 * honest "no data yet" placeholder -- revenue, appointments, patients and
 * invoices don't exist until Phase 2/3/5. The "Getting started" row below
 * shows real counts for the two things that DO exist in Phase 1 (clinics,
 * organization members), rather than leaving the whole page empty. Charts,
 * clinic comparison, upcoming appointments and the AI insight card from the
 * same spec section land in Phase 8, once there is real data to show.
 */
export default async function DashboardPage() {
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  const supabase = await getSupabaseServerClient();
  const [{ count: clinicCount }, { count: memberCount }, canViewClinics, canViewUsers] =
    await Promise.all([
      supabase
        .from("clinics")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .is("deleted_at", null),
      supabase
        .from("organization_memberships")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .eq("status", "active"),
      can("clinic.view", { organizationId }),
      can("users.view", { organizationId }),
    ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Your business at a glance." />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Revenue" value={null} icon={DollarSign} />
        <StatTile label="Appointments" value={null} icon={CalendarCheck} />
        <StatTile label="New patients" value={null} icon={UserPlus} />
        <StatTile label="Outstanding payments" value={null} icon={Wallet} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Building2 className="text-muted-foreground size-4" aria-hidden />
              <span className="text-sm">
                <span className="font-medium tabular-nums">{clinicCount ?? 0}</span> clinic
                {clinicCount === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="text-muted-foreground size-4" aria-hidden />
              <span className="text-sm">
                <span className="font-medium tabular-nums">{memberCount ?? 0}</span> team member
                {memberCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <PermissionGate allowed={canViewClinics}>
              <Button asChild variant="outline" size="sm">
                <Link href="/clinics">Manage clinics</Link>
              </Button>
            </PermissionGate>
            <PermissionGate allowed={canViewUsers}>
              <Button asChild variant="outline" size="sm">
                <Link href="/settings/users">Manage users</Link>
              </Button>
            </PermissionGate>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="text-muted-foreground py-8 text-center text-sm">
          Business metrics appear here once scheduling, sales and payments are set up.
        </CardContent>
      </Card>
    </div>
  );
}
