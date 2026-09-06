import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listClinicOptions } from "../patients/queries";
import {
  resolveDateRange,
  type DateRangeKey,
  type ResolvedDateRange,
} from "@/lib/reporting/date-range";

export type ReportingContext = {
  organizationId: string;
  /** organizations.timezone -- the ONE timezone every date-range boundary in this app is computed against (section 5). */
  timezone: string;
  /** organizations.currency -- threaded through every formatCurrency() call, never a hardcoded "PHP" (section 6). */
  currency: string;
  /** Clinics this user is authorized to see (RLS-filtered) -- for the Clinic filter dropdown (section 4). */
  clinics: { id: string; name: string }[];
};

/**
 * One round trip every dashboard/report page starts with. `clinics` is
 * already RLS-bounded by `listClinicOptions()` (clinic.view), so the Clinic
 * filter can never even list an unauthorized clinic to select in the first
 * place -- belt-and-braces alongside the fact that every downstream report
 * query is itself RLS-bounded regardless of what's selected (section 38).
 */
export async function getReportingContext(organizationId: string): Promise<ReportingContext> {
  const supabase = await getSupabaseServerClient();
  const [{ data: org }, clinics] = await Promise.all([
    supabase
      .from("organizations")
      .select("timezone, currency")
      .eq("id", organizationId)
      .maybeSingle(),
    listClinicOptions(organizationId),
  ]);

  return {
    organizationId,
    timezone: org?.timezone || "UTC",
    currency: org?.currency || "PHP",
    clinics,
  };
}

/** Parses the shared `range`/`from`/`to`/`clinic` searchParams every report page accepts, consistently. */
export function parseReportSearchParams(
  params: Record<string, string | string[] | undefined>,
  timezone: string,
): { range: ResolvedDateRange; clinicId?: string } {
  const single = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const rangeKeyRaw = single(params.range);
  const validKeys = [
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "this_quarter",
    "last_quarter",
    "this_year",
    "last_year",
    "custom",
  ];
  const rangeKey = (
    validKeys.includes(rangeKeyRaw ?? "") ? rangeKeyRaw : "this_month"
  ) as DateRangeKey;

  const from = single(params.from);
  const to = single(params.to);
  const range =
    rangeKey === "custom" && from && to
      ? resolveDateRange("custom", timezone, { from, to })
      : resolveDateRange(rangeKey === "custom" ? "this_month" : rangeKey, timezone);

  return { range, clinicId: single(params.clinic) || undefined };
}
