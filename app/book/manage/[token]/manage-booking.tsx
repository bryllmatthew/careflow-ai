"use client";

import { useState, useTransition, useMemo } from "react";
import { Loader2, CalendarDays, Phone, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { SlotPicker } from "@/components/booking/slot-picker";
import { cn } from "@/lib/utils";
import type { ManagedBooking } from "@/lib/booking/public-queries";
import {
  cancelBookingAction,
  rescheduleBookingAction,
  fetchRescheduleAvailabilityAction,
} from "./actions";

export function ManageBooking({ token, booking }: { token: string; booking: ManagedBooking }) {
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const tz = booking.clinic.timezone;
  const fmtTime = useMemo(
    () => new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: tz }),
    [tz],
  );
  const fmtDayLong = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: tz,
      }),
    [tz],
  );

  const start = new Date(booking.startAt);
  const isCancelled = booking.status === "cancelled";

  // ConfirmDialog runs this inside its own transition and toasts a thrown
  // error, so this awaits directly rather than opening a second transition.
  async function cancel() {
    setError(undefined);
    const result = await cancelBookingAction(token);
    if (!result.ok) {
      setError(result.error);
      throw new Error(result.error);
    }
  }

  function reschedule(iso: string) {
    setError(undefined);
    startTransition(async () => {
      const result = await rescheduleBookingAction(token, iso);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMode("view");
    });
  }

  if (mode === "reschedule") {
    return (
      <ReschedulePicker
        booking={booking}
        pending={pending}
        error={error}
        onPick={reschedule}
        onBack={() => {
          setMode("view");
          setError(undefined);
        }}
      />
    );
  }

  return (
    <div className="bg-card ring-foreground/[0.06] shadow-liquid rounded-2xl p-6 ring-1">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs tracking-wider uppercase">Reference</p>
          <p className="font-mono text-sm font-medium tracking-wide">{booking.reference}</p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <dl className="mt-6 space-y-3 text-sm">
        <Row label="Service" value={booking.service.name} />
        <Row label="Practitioner" value={booking.practitioner} />
        <Row label="Date" value={fmtDayLong.format(start)} />
        <Row
          label="Time"
          value={`${fmtTime.format(start)} (${booking.service.durationMinutes} min)`}
        />
      </dl>

      {(booking.clinic.address || booking.clinic.phone) && (
        <div className="text-muted-foreground mt-6 space-y-2 border-t pt-4 text-sm">
          {booking.clinic.address && (
            <p className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              {booking.clinic.address}
            </p>
          )}
          {booking.clinic.phone && (
            <p className="flex items-center gap-2">
              <Phone className="size-4 shrink-0" aria-hidden />
              <a
                href={`tel:${booking.clinic.phone}`}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                {booking.clinic.phone}
              </a>
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-destructive mt-4 text-sm" role="alert">
          {error}
        </p>
      )}

      {!isCancelled && (booking.canReschedule || booking.canCancel) && (
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {booking.canReschedule && (
            <Button variant="outline" onClick={() => setMode("reschedule")} disabled={pending}>
              <CalendarDays className="size-4" aria-hidden />
              Reschedule
            </Button>
          )}
          {booking.canCancel && (
            <ConfirmDialog
              title="Cancel this appointment?"
              description="This can't be undone. You'd need to book again if you change your mind."
              confirmLabel="Cancel appointment"
              onConfirm={cancel}
              trigger={
                <Button variant="destructive" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Cancel appointment
                </Button>
              }
            />
          )}
        </div>
      )}

      {/* Explains WHY the buttons are absent rather than silently omitting
          them, which otherwise reads as a broken page (brief section 41). */}
      {!isCancelled && !booking.canReschedule && !booking.canCancel && (
        <p className="text-muted-foreground mt-6 border-t pt-4 text-sm">
          This appointment can no longer be changed online. Please contact the clinic
          {booking.clinic.phone ? ` on ${booking.clinic.phone}` : ""}.
        </p>
      )}

      {isCancelled && (
        <p className="text-muted-foreground mt-6 border-t pt-4 text-sm">
          This appointment was cancelled. To book again, visit the clinic&apos;s booking page.
        </p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "cancelled" || status === "no_show"
      ? "bg-tint-destructive text-tint-destructive-foreground"
      : status === "confirmed" || status === "completed"
        ? "bg-tint-success text-tint-success-foreground"
        : "bg-tint-warning text-tint-warning-foreground";
  const label = status.replace(/_/g, " ");
  return <Badge className={cn("rounded-full border-transparent capitalize", tone)}>{label}</Badge>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

/**
 * The reschedule surface uses the SAME SlotPicker the booking flow uses, so a
 * patient meets the control they already know. The only differences are the
 * confirm label and that the practitioner is fixed -- a reschedule moves an
 * appointment, it does not reassign it.
 */
function ReschedulePicker({
  booking,
  pending,
  error,
  onPick,
  onBack,
}: {
  booking: ManagedBooking;
  pending: boolean;
  error?: string;
  onPick: (iso: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="bg-card ring-foreground/[0.06] shadow-liquid rounded-2xl p-6 ring-1">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="font-medium">Pick a new date and time</h2>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={pending}>
          <X className="size-4" aria-hidden />
          Cancel
        </Button>
      </div>

      {error && (
        <p className="text-destructive mb-4 text-sm" role="alert">
          {error}
        </p>
      )}

      <SlotPicker
        timezone={booking.clinic.timezone}
        /* The clinic's booking horizon is not exposed on the manage payload;
           31 days is the availability RPC's own per-request ceiling, and the
           server refuses anything past the real horizon regardless. */
        maxAdvanceDays={31}
        scopeKey={`${booking.clinic.slug}|${booking.service.id}`}
        fetchDays={(from, days) =>
          fetchRescheduleAvailabilityAction({
            slug: booking.clinic.slug,
            serviceId: booking.service.id,
            from,
            days,
          })
        }
        onConfirm={onPick}
        confirmLabel="Confirm new time"
        confirming={pending}
      />
    </div>
  );
}
