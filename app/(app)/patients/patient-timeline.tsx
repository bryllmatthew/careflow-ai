import {
  UserPlus,
  ClipboardCheck,
  ClipboardX,
  FileText,
  FileCheck,
  FileX,
  Wallet,
  XCircle,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { followUpTypeLabels, type FollowUpType } from "@/lib/validation/followup.schema";
import type { FollowUpRow } from "../followups/queries";
import type { InvoiceRow } from "../invoices/queries";
import type { PaymentRow, RefundRow } from "../payments/queries";

/**
 * Extensible on purpose: as later phases add real events (payment
 * recorded), each is just another TimelineEvent pushed onto the array built
 * for a patient -- this component's rendering doesn't change. No
 * placeholder/invented events are added just to make the timeline look
 * fuller.
 */
export type TimelineEvent = {
  id: string;
  icon: LucideIcon;
  label: string;
  detail?: string;
  timestamp: string;
};

export function buildPatientTimeline(
  patient: { id: string; createdAt: string },
  followUps: FollowUpRow[] = [],
  invoices: InvoiceRow[] = [],
  payments: PaymentRow[] = [],
  refunds: RefundRow[] = [],
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    {
      id: `${patient.id}-created`,
      icon: UserPlus,
      label: "Patient record created",
      timestamp: patient.createdAt,
    },
  ];

  for (const f of followUps) {
    const typeLabel = followUpTypeLabels[f.type as FollowUpType] ?? f.type;
    if (f.status === "completed" && f.completedAt) {
      events.push({
        id: `${f.id}-completed`,
        icon: ClipboardCheck,
        label: `Follow-up completed: ${typeLabel}`,
        timestamp: f.completedAt,
      });
    } else if (f.status === "cancelled") {
      events.push({
        id: `${f.id}-cancelled`,
        icon: ClipboardX,
        label: `Follow-up cancelled: ${typeLabel}`,
        timestamp: f.dueAt,
      });
    }
  }

  for (const inv of invoices) {
    const label = inv.invoiceNumber ?? "draft invoice";
    events.push({
      id: `${inv.id}-created`,
      icon: FileText,
      label: `Invoice created: ${label}`,
      timestamp: inv.createdAt,
    });
    if (inv.status !== "draft" && inv.issueDate) {
      events.push({
        id: `${inv.id}-issued`,
        icon: FileCheck,
        label: `Invoice issued: ${label}`,
        detail: `Total ${inv.total} ${inv.currency}`,
        timestamp: new Date(inv.issueDate).toISOString(),
      });
    }
    if (inv.status === "void" && inv.voidedAt) {
      events.push({
        id: `${inv.id}-voided`,
        icon: FileX,
        label: `Invoice voided: ${label}`,
        detail: inv.voidReason ?? undefined,
        timestamp: inv.voidedAt,
      });
    }
  }

  for (const p of payments) {
    if (p.status === "succeeded" || p.status === "partially_refunded" || p.status === "refunded") {
      events.push({
        id: `${p.id}-succeeded`,
        icon: Wallet,
        label: `Payment received: ${p.invoiceNumber ?? "invoice"}`,
        detail: `${p.amount} ${p.currency}`,
        timestamp: p.paidAt ?? p.createdAt,
      });
    } else if (p.status === "failed") {
      events.push({
        id: `${p.id}-failed`,
        icon: XCircle,
        label: `Payment failed: ${p.invoiceNumber ?? "invoice"}`,
        detail: p.failureReason ?? undefined,
        timestamp: p.createdAt,
      });
    }
  }

  for (const r of refunds) {
    if (r.status !== "succeeded") continue;
    events.push({
      id: `${r.id}-refunded`,
      icon: Undo2,
      label: "Payment refunded",
      detail: `${r.amount} · ${r.reason}`,
      timestamp: r.completedAt ?? r.createdAt,
    });
  }

  return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function PatientTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {events.map((event) => {
        const Icon = event.icon;
        return (
          <li key={event.id} className="flex items-start gap-3">
            <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="flex flex-col pt-1">
              <p className="text-sm font-medium">{event.label}</p>
              {event.detail && <p className="text-muted-foreground text-sm">{event.detail}</p>}
              <p className="text-muted-foreground text-xs">
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(event.timestamp))}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
