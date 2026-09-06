import { CalendarClock, Plus } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission, can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { PermissionGate } from "@/components/patterns/permission-gate";
import { Pagination } from "@/components/patterns/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listClinicOptions, listPractitionerOptions } from "../patients/queries";
import {
  listFollowUps,
  getFollowUpCounts,
  FOLLOWUPS_PAGE_SIZE,
  type FollowUpListFilters,
} from "./queries";
import type {
  FollowUpStatus,
  FollowUpType,
  FollowUpPriority,
} from "@/lib/validation/followup.schema";
import {
  followUpStatuses,
  followUpTypes,
  followUpPriorities,
} from "@/lib/validation/followup.schema";
import { FollowUpsFilterBar } from "./followups-filter-bar";
import { FollowUpsTable } from "./followups-table";
import { FollowUpFormDialog } from "./followup-form-dialog";

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const auth = await getAuthContext();
  const organizationId = auth!.memberships[0]!.organizationId;

  await requirePermission("followups.view", { organizationId });

  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const statusParam = single(params.status);
  const typeParam = single(params.type);
  const priorityParam = single(params.priority);
  const bucketParam = single(params.bucket) ?? "overdue";

  const filters: FollowUpListFilters = {
    clinicId: single(params.clinic),
    assignedTo: single(params.assigned),
    status:
      statusParam && (followUpStatuses as readonly string[]).includes(statusParam)
        ? (statusParam as FollowUpStatus)
        : undefined,
    type:
      typeParam && (followUpTypes as readonly string[]).includes(typeParam)
        ? (typeParam as FollowUpType)
        : undefined,
    priority:
      priorityParam && (followUpPriorities as readonly string[]).includes(priorityParam)
        ? (priorityParam as FollowUpPriority)
        : undefined,
    bucket: ["overdue", "today", "upcoming", "completed", "all"].includes(bucketParam)
      ? (bucketParam as FollowUpListFilters["bucket"])
      : "overdue",
    page: Number(single(params.page)) || 1,
  };

  const [{ rows, total }, clinics, staff, counts, canCreate, canManage] = await Promise.all([
    listFollowUps(organizationId, filters),
    listClinicOptions(organizationId),
    listPractitionerOptions(organizationId),
    getFollowUpCounts(organizationId),
    can("followups.create", { organizationId }),
    can("followups.manage", { organizationId }),
  ]);

  const buildHref = (page: number) => {
    const qs = new URLSearchParams();
    if (filters.clinicId) qs.set("clinic", filters.clinicId);
    if (filters.assignedTo) qs.set("assigned", filters.assignedTo);
    if (filters.type) qs.set("type", filters.type);
    if (filters.priority) qs.set("priority", filters.priority);
    if (filters.bucket && filters.bucket !== "overdue") qs.set("bucket", filters.bucket);
    if (page > 1) qs.set("page", String(page));
    const query = qs.toString();
    return query ? `/followups?${query}` : "/followups";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Follow-ups"
        description="Operational tasks and patient outreach."
        actions={
          <PermissionGate allowed={canCreate}>
            <FollowUpFormDialog
              clinics={clinics}
              staff={staff}
              trigger={
                <Button>
                  <Plus className="size-4" />
                  Add follow-up
                </Button>
              }
            />
          </PermissionGate>
        }
      />

      <FollowUpsFilterBar clinics={clinics} staff={staff} counts={counts} />

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing here"
          description="No follow-ups match this view."
        />
      ) : (
        <Card className="gap-0 p-0">
          <FollowUpsTable followUps={rows} staff={staff} canManage={canManage} />
          <Pagination
            page={filters.page ?? 1}
            pageSize={FOLLOWUPS_PAGE_SIZE}
            total={total}
            buildHref={buildHref}
          />
        </Card>
      )}
    </div>
  );
}
