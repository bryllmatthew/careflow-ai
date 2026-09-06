"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, XCircle, AlertTriangle, Receipt } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { AppointmentStatusBadge } from "@/components/patterns/appointment-status-badge";
import { FollowUpStatusBadge } from "@/components/patterns/followup-badges";
import { Money } from "@/components/patterns/money";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { toast } from "sonner";
import {
  appointmentStatusLabels,
  nextStatuses,
  type AppointmentStatus,
} from "@/lib/validation/appointment.schema";
import { followUpTypeLabels, type FollowUpType } from "@/lib/validation/followup.schema";
import type { AppointmentRow, ReminderRow } from "./queries";
import type { FollowUpRow } from "../followups/queries";
import {
  cancelAppointmentAction,
  rescheduleAppointmentAction,
  updateAppointmentStatusAction,
} from "./actions";
import { getAppointmentAutomationAction } from "./automation-actions";
import { createInvoiceFromAppointmentAction } from "../invoices/actions";

const REMINDER_LABELS: Record<string, string> = {
  confirmation: "Confirmation",
  reminder_24h: "24-hour reminder",
  reminder_2h: "2-hour reminder",
};

function ReminderStatusIcon({ status }: { status: string }) {
  if (status === "sent") return <CheckCircle2 className="text-primary size-4" aria-hidden />;
  if (status === "failed") return <XCircle className="text-destructive size-4" aria-hidden />;
  if (status === "cancelled" || status === "skipped")
    return <XCircle className="text-muted-foreground size-4" aria-hidden />;
  return <Circle className="text-muted-foreground size-4" aria-hidden />;
}

function toLocalDateInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toLocalTimeInput(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AppointmentDetailSheet({
  appointment,
  onOpenChange,
  canUpdate,
  canCancel,
  canReschedule,
  canCreateInvoice = false,
}: {
  appointment: AppointmentRow | null;
  onOpenChange: (open: boolean) => void;
  canUpdate: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  /** Optional -- defaults to hidden. Not every list this sheet is used from checks invoices.create. */
  canCreateInvoice?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);

  // Render-phase "adjusting state" (React's recommended pattern), not a
  // useEffect: resets the local edit fields whenever a different
  // appointment is selected, without an extra cascading render.
  const [prevAppointmentId, setPrevAppointmentId] = useState<string | null>(null);
  if ((appointment?.id ?? null) !== prevAppointmentId) {
    setPrevAppointmentId(appointment?.id ?? null);
    setReminders([]);
    setFollowUps([]);
    if (appointment) {
      setDate(toLocalDateInput(appointment.startAt));
      setTime(toLocalTimeInput(appointment.startAt));
      setRescheduling(false);
      setError(null);
    }
  }

  // Fetching from the server on selection change -- a real async effect
  // (setState happens after the await resolves, not synchronously in the
  // effect body), not the render-phase reset above.
  useEffect(() => {
    if (!appointment) {
      return;
    }
    let cancelled = false;
    getAppointmentAutomationAction(appointment.id).then((result) => {
      if (!cancelled) {
        setReminders(result.reminders);
        setFollowUps(result.followUps);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [appointment]);

  if (!appointment) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }

  const isTerminal = ["completed", "cancelled", "no_show"].includes(appointment.status);
  const options = nextStatuses[appointment.status as AppointmentStatus] ?? [];

  function setStatus(status: AppointmentStatus) {
    startTransition(async () => {
      try {
        await updateAppointmentStatusAction(appointment!.id, status);
        toast.success(`Marked as ${appointmentStatusLabels[status]}.`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update status.");
      }
    });
  }

  function submitReschedule() {
    setError(null);
    const startAt = new Date(`${date}T${time}:00`);
    if (Number.isNaN(startAt.getTime())) {
      setError("Enter a valid date and time.");
      return;
    }
    startTransition(async () => {
      const result = await rescheduleAppointmentAction(appointment!.id, startAt.toISOString());
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success("Appointment rescheduled.");
      setRescheduling(false);
    });
  }

  return (
    <Sheet open={appointment !== null} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{appointment.patientName}</SheetTitle>
          <Link
            href={`/patients/${appointment.patientId}`}
            className="text-primary text-sm hover:underline"
          >
            View patient profile
          </Link>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4">
          <AppointmentStatusBadge status={appointment.status} />

          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Service</dt>
            <dd className="col-span-2">{appointment.serviceName ?? "—"}</dd>
            <dt className="text-muted-foreground">Practitioner</dt>
            <dd className="col-span-2">{appointment.staffName ?? "—"}</dd>
            <dt className="text-muted-foreground">Clinic</dt>
            <dd className="col-span-2">{appointment.clinicName ?? "—"}</dd>
            <dt className="text-muted-foreground">Price</dt>
            <dd className="col-span-2">
              <Money value={appointment.servicePrice} />
            </dd>
            <dt className="text-muted-foreground">When</dt>
            <dd className="col-span-2">
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(appointment.startAt))}
              {" – "}
              {new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
                new Date(appointment.endAt),
              )}
            </dd>
          </dl>

          {appointment.notes && (
            <>
              <Separator />
              <div>
                <h3 className="text-muted-foreground mb-1 text-xs font-medium uppercase">Notes</h3>
                <p className="text-sm whitespace-pre-wrap">{appointment.notes}</p>
              </div>
            </>
          )}

          {reminders.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                  Reminders
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {reminders.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 text-sm">
                      <ReminderStatusIcon status={r.status} />
                      <span>{REMINDER_LABELS[r.reminderType] ?? r.reminderType}</span>
                      <span className="text-muted-foreground">
                        —{" "}
                        {r.status === "sent" && r.sentAt
                          ? `Sent ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(r.sentAt))}`
                          : r.status === "failed"
                            ? `Failed${r.failureReason ? `: ${r.failureReason}` : ""}`
                            : r.status === "cancelled"
                              ? "Cancelled"
                              : r.status === "skipped"
                                ? "Skipped"
                                : `Scheduled for ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(r.scheduledFor))}`}
                      </span>
                      {r.status === "failed" && r.retryCount > 0 && (
                        <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
                          <AlertTriangle className="size-3" aria-hidden />
                          {r.retryCount} {r.retryCount === 1 ? "retry" : "retries"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {followUps.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                  Follow-Up
                </h3>
                <ul className="flex flex-col gap-1.5">
                  {followUps.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-sm">
                      <span>{followUpTypeLabels[f.type as FollowUpType] ?? f.type}</span>
                      <FollowUpStatusBadge status={f.status} />
                      <span className="text-muted-foreground">
                        Due{" "}
                        {new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
                          new Date(f.dueAt),
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {canReschedule && !isTerminal && (
            <>
              <Separator />
              {rescheduling ? (
                <div className="flex flex-col gap-2">
                  {error && <p className="text-destructive text-sm">{error}</p>}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="resched-date">Date</Label>
                      <Input
                        id="resched-date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor="resched-time">Time</Label>
                      <Input
                        id="resched-time"
                        type="time"
                        value={time}
                        onChange={(e) => setTime(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={pending} onClick={submitReschedule}>
                      Save new time
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRescheduling(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setRescheduling(true)}>
                  Reschedule
                </Button>
              )}
            </>
          )}
        </div>

        <SheetFooter>
          {canCreateInvoice && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await createInvoiceFromAppointmentAction(appointment.id);
                  if (!result.success) {
                    toast.error(result.error);
                    return;
                  }
                  router.push(`/invoices/${result.invoiceId}`);
                })
              }
            >
              <Receipt className="size-4" />
              Create Invoice
            </Button>
          )}
          {canUpdate && options.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {options.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => setStatus(s)}
                >
                  {appointmentStatusLabels[s]}
                </Button>
              ))}
            </div>
          )}
          {canCancel && !isTerminal && (
            <ConfirmDialog
              trigger={
                <Button variant="destructive" size="sm" disabled={pending}>
                  Cancel appointment
                </Button>
              }
              title="Cancel this appointment?"
              description={`This cancels ${appointment.patientName}'s appointment. The record is kept, not erased.`}
              confirmLabel="Cancel appointment"
              onConfirm={async () => {
                await cancelAppointmentAction(appointment.id);
                toast.success("Appointment cancelled.");
                onOpenChange(false);
              }}
            />
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
