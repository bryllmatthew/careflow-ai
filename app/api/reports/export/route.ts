import "server-only";
import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/require-permission";
import { rowsToCsv } from "@/lib/reporting/csv";
import { getReportingContext, parseReportSearchParams } from "@/app/(app)/reports/context";
import { getRevenueByClinic, getRevenueByPaymentMethod } from "@/app/(app)/reports/revenue-queries";
import {
  getClinicPerformance,
  getServicePerformance,
  getPractitionerPerformance,
} from "@/app/(app)/reports/performance-queries";
import {
  getReceivablesReport,
  agingBucketLabels,
  type AgingBucket,
} from "@/app/(app)/reports/receivables-queries";
import {
  listInventory,
  listMovements as listInventoryMovements,
} from "@/app/(app)/inventory/queries";
import { movementTypeLabels } from "@/lib/validation/inventory.schema";

export const EXPORT_TYPES = [
  "revenue-by-clinic",
  "payment-methods",
  "receivables",
  "clinic-performance",
  "service-performance",
  "practitioner-performance",
  "inventory",
  "inventory-movements",
] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

/**
 * Section 33 -- authorized CSV export. Deliberately a thin re-serialization
 * of the SAME reporting functions the on-screen report calls, behind the
 * SAME `requirePermission()` gate and the SAME RLS-respecting client (never
 * the admin client) -- an export can never see more than the screen it
 * mirrors (section 33: "never allow an export endpoint to bypass
 * authorization").
 */
export async function GET(request: Request) {
  const auth = await getAuthContext();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const organizationId = auth.memberships[0]?.organizationId;
  if (!organizationId)
    return NextResponse.json({ error: "No active organization" }, { status: 403 });

  const url = new URL(request.url);
  const type = url.searchParams.get("type") as ExportType | null;
  if (!type || !EXPORT_TYPES.includes(type)) {
    return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
  }

  const context = await getReportingContext(organizationId);
  const params: Record<string, string | undefined> = Object.fromEntries(url.searchParams.entries());
  const { range, clinicId } = parseReportSearchParams(params, context.timezone);

  try {
    let headers: string[];
    let rows: (string | number | null)[][];
    let filename: string;

    switch (type) {
      case "revenue-by-clinic": {
        await requirePermission("reports.financial", { organizationId });
        const data = await getRevenueByClinic(organizationId, range, context.clinics);
        headers = ["Clinic", "Invoiced", "Collected"];
        rows = data.map((r) => [r.clinicName, r.invoiced, r.collected]);
        filename = "revenue-by-clinic";
        break;
      }
      case "payment-methods": {
        await requirePermission("reports.financial", { organizationId });
        const data = await getRevenueByPaymentMethod({ organizationId, clinicId, range });
        headers = ["Method", "Count", "Amount"];
        rows = data.map((r) => [r.method, r.count, r.amount]);
        filename = "payment-methods";
        break;
      }
      case "receivables": {
        await requirePermission("reports.financial", { organizationId });
        const agingBucket = url.searchParams.get("aging") as AgingBucket | null;
        const { rows: data } = await getReceivablesReport(organizationId, {
          clinicId,
          agingBucket: agingBucket ?? undefined,
          page: 1,
        });
        headers = [
          "Invoice #",
          "Patient",
          "Clinic",
          "Issue Date",
          "Due Date",
          "Total",
          "Paid",
          "Balance",
          "Status",
          "Days Overdue",
          "Aging",
        ];
        rows = data.map((r) => [
          r.invoiceNumber,
          r.patientName,
          r.clinicName,
          r.issueDate,
          r.dueDate,
          r.total,
          r.paid,
          r.balance,
          r.status,
          r.daysOverdue,
          agingBucketLabels[r.agingBucket],
        ]);
        filename = "receivables";
        break;
      }
      case "clinic-performance": {
        await requirePermission("reports.view", { organizationId });
        const data = await getClinicPerformance({ organizationId, range }, context.clinics);
        headers = [
          "Clinic",
          "Revenue",
          "Appointments",
          "Completed",
          "No Show",
          "Cancellation Rate",
          "New Patients",
          "Outstanding",
          "Low Stock",
        ];
        rows = data.map((r) => [
          r.clinicName,
          r.revenue,
          r.appointments,
          r.completed,
          r.noShow,
          r.cancellationRate === null ? "N/A" : `${r.cancellationRate.toFixed(1)}%`,
          r.newPatients,
          r.outstanding,
          r.lowStockCount,
        ]);
        filename = "clinic-performance";
        break;
      }
      case "service-performance": {
        await requirePermission("reports.view", { organizationId });
        const data = await getServicePerformance({ organizationId, range }, clinicId);
        headers = [
          "Service",
          "Appointments",
          "Completed",
          "Cancelled",
          "No Show",
          "Revenue",
          "Avg Revenue / Completed",
        ];
        rows = data.map((r) => [
          r.serviceName,
          r.appointments,
          r.completed,
          r.cancelled,
          r.noShow,
          r.revenue,
          r.avgRevenuePerCompleted,
        ]);
        filename = "service-performance";
        break;
      }
      case "practitioner-performance": {
        await requirePermission("reports.view", { organizationId });
        const data = await getPractitionerPerformance({ organizationId, range }, clinicId);
        headers = [
          "Practitioner",
          "Appointments",
          "Completed",
          "Cancelled",
          "No Show",
          "Patients",
          "Attributed Revenue",
          "Follow-ups Assigned",
          "Follow-ups Completed",
        ];
        rows = data.map((r) => [
          r.practitionerName,
          r.appointments,
          r.completed,
          r.cancelled,
          r.noShow,
          r.patientCount,
          r.attributedRevenue,
          r.followUpsAssigned,
          r.followUpsCompleted,
        ]);
        filename = "practitioner-performance";
        break;
      }
      case "inventory": {
        await requirePermission("reports.inventory", { organizationId });
        const { rows: data } = await listInventory(organizationId, {
          clinicId,
          page: 1,
          pageSize: 5000,
        });
        headers = [
          "Product",
          "SKU",
          "Clinic",
          "On Hand",
          "Unit",
          "Reorder Level",
          "Status",
          "Earliest Expiration",
        ];
        rows = data.map((r) => [
          r.productName,
          r.sku,
          r.clinicName,
          r.quantityOnHand,
          r.unitOfMeasure,
          r.reorderLevel,
          r.status,
          r.earliestExpiration,
        ]);
        filename = "inventory";
        break;
      }
      case "inventory-movements": {
        await requirePermission("reports.inventory", { organizationId });
        const { rows: data } = await listInventoryMovements(organizationId, {
          clinicId,
          page: 1,
          pageSize: 5000,
        });
        headers = [
          "Date",
          "Product",
          "Clinic",
          "Movement",
          "Quantity",
          "Before",
          "After",
          "Reference",
          "By",
        ];
        rows = data.map((r) => [
          r.createdAt,
          r.productName,
          r.clinicName,
          movementTypeLabels[r.movementType] ?? r.movementType,
          r.quantity,
          r.quantityBefore,
          r.quantityAfter,
          r.referenceType,
          r.createdByName,
        ]);
        filename = "inventory-movements";
        break;
      }
    }

    const csv = rowsToCsv(headers, rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}-${range.startUtc.slice(0, 10)}-to-${range.endUtc.slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Export failed.";
    const status = message.toLowerCase().includes("permission") ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
