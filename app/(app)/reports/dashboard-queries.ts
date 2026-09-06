import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { ResolvedDateRange } from "@/lib/reporting/date-range";
import type { PercentChange } from "@/lib/reporting/format";
import { getRevenueSummary, getRevenueTrend, type RevenueTrendPoint } from "./revenue-queries";
import {
  getAppointmentSummary,
  getAppointmentTrend,
  type AppointmentTrendPoint,
} from "./appointment-queries";
import { getPatientSummary } from "./patient-queries";
import { getFollowUpReport } from "./followup-queries";
import { getClinicPerformance, type ClinicPerformanceRow } from "./performance-queries";

export type DashboardScope = {
  organizationId: string;
  clinicId?: string;
  practitionerId?: string;
  range: ResolvedDateRange;
};

export type InventoryAlerts = { lowStock: number; outOfStock: number; expiringSoon: number };

async function getInventoryAlerts(
  organizationId: string,
  clinicId?: string,
): Promise<InventoryAlerts> {
  const supabase = await getSupabaseServerClient();
  let lowStockQ = supabase
    .from("inventory")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("is_low_stock", true)
    .gt("quantity_on_hand", 0);
  let outOfStockQ = supabase
    .from("inventory")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .lte("quantity_on_hand", 0);
  let expiringQ = supabase
    .from("inventory_batches")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gt("quantity_remaining", 0)
    .gte("expiration_date", new Date().toISOString().slice(0, 10))
    .lte("expiration_date", new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));

  if (clinicId) {
    lowStockQ = lowStockQ.eq("clinic_id", clinicId);
    outOfStockQ = outOfStockQ.eq("clinic_id", clinicId);
    expiringQ = expiringQ.eq("clinic_id", clinicId);
  }

  const [lowStockRes, outOfStockRes, expiringRes] = await Promise.all([
    lowStockQ,
    outOfStockQ,
    expiringQ,
  ]);
  return {
    lowStock: lowStockRes.count ?? 0,
    outOfStock: outOfStockRes.count ?? 0,
    expiringSoon: expiringRes.count ?? 0,
  };
}

export type DashboardSummary = {
  revenue: {
    collected: string;
    invoiced: string;
    outstanding: string;
    netCollected: string;
    change: PercentChange;
  };
  appointments: {
    total: number;
    completed: number;
    completionRate: number | null;
    noShowRate: number | null;
    cancellationRate: number | null;
    change: PercentChange;
  };
  newPatients: { count: number; change: PercentChange };
  followUps: { overdue: number; dueToday: number; upcoming: number };
  inventoryAlerts: InventoryAlerts;
  revenueTrend: RevenueTrendPoint[];
  appointmentTrend: AppointmentTrendPoint[];
  clinicPerformance: ClinicPerformanceRow[];
};

/**
 * The Executive Dashboard's single entry point (section 6/27). Every
 * sub-query independently respects `scope.clinicId` (a specific clinic, or
 * "All Clinics" -- undefined, meaning every RLS-permitted clinic, never
 * every literal clinic row) -- see docs/modules/REPORTING.md "Aggregation
 * security."
 */
export async function getDashboardSummary(
  scope: DashboardScope,
  clinics: { id: string; name: string }[],
): Promise<DashboardSummary> {
  const revenueScope = {
    organizationId: scope.organizationId,
    clinicId: scope.clinicId,
    range: scope.range,
  };
  const appointmentScope = {
    organizationId: scope.organizationId,
    clinicId: scope.clinicId,
    practitionerId: scope.practitionerId,
    range: scope.range,
  };
  const patientScope = {
    organizationId: scope.organizationId,
    clinicId: scope.clinicId,
    range: scope.range,
  };
  const followUpScope = {
    organizationId: scope.organizationId,
    clinicId: scope.clinicId,
    range: scope.range,
  };

  const [
    revenue,
    appointments,
    patients,
    followUps,
    inventoryAlerts,
    revenueTrend,
    appointmentTrend,
    clinicPerformance,
  ] = await Promise.all([
    getRevenueSummary(revenueScope),
    getAppointmentSummary(appointmentScope),
    getPatientSummary(patientScope),
    getFollowUpReport(followUpScope),
    getInventoryAlerts(scope.organizationId, scope.clinicId),
    getRevenueTrend(revenueScope),
    getAppointmentTrend(appointmentScope),
    // Clinic comparison only makes sense at the "All Clinics" scope --
    // narrowing to one clinic answers a different question (that
    // clinic's own trend, already shown above), so this list is skipped
    // rather than rendering a meaningless one-row table.
    scope.clinicId
      ? Promise.resolve([])
      : getClinicPerformance({ organizationId: scope.organizationId, range: scope.range }, clinics),
  ]);

  return {
    revenue: {
      collected: revenue.collected,
      invoiced: revenue.invoiced,
      outstanding: revenue.outstanding,
      netCollected: revenue.netCollected,
      change: revenue.collectedChange,
    },
    appointments: {
      total: appointments.total,
      completed: appointments.byStatus.completed ?? 0,
      completionRate: appointments.completionRate,
      noShowRate: appointments.noShowRate,
      cancellationRate: appointments.cancellationRate,
      change: appointments.totalChange,
    },
    newPatients: { count: patients.newPatients, change: patients.newPatientsChange },
    followUps: {
      overdue: followUps.overdue,
      dueToday: followUps.dueToday,
      upcoming: followUps.upcoming,
    },
    inventoryAlerts,
    revenueTrend,
    appointmentTrend,
    clinicPerformance,
  };
}
