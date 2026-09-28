"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppointmentDetailSheet } from "../appointments/appointment-detail-sheet";
import { AppointmentFormDialog } from "../appointments/appointment-form-dialog";
import type { AppointmentRow } from "../appointments/queries";
import { parseDateKey } from "./date-utils";

const SLOT_MINUTES = 30;
const START_HOUR = 7;
const END_HOUR = 19;
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES;

function rowForTime(instant: Date, dateKey: string): number {
  const base = parseDateKey(dateKey);
  base.setHours(START_HOUR, 0, 0, 0);
  const minutesFromStart = (instant.getTime() - base.getTime()) / 60_000;
  const slot = Math.floor(minutesFromStart / SLOT_MINUTES);
  return Math.min(Math.max(slot, 0), TOTAL_SLOTS) + 2; // +2: header row, 1-indexed
}

function slotLabel(slotIndex: number): string | null {
  const totalMinutes = slotIndex * SLOT_MINUTES;
  if (totalMinutes % 60 !== 0) return null;
  const hour = START_HOUR + Math.floor(totalMinutes / 60);
  return new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(new Date(2000, 0, 1, hour));
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted-foreground/20 border-muted-foreground/40",
  confirmed: "bg-primary/15 border-primary/40",
  checked_in: "bg-primary/15 border-primary/40",
  in_progress: "bg-primary/25 border-primary/50",
  completed: "bg-secondary border-border",
  cancelled: "bg-destructive/10 border-destructive/30 opacity-60 line-through",
  no_show: "bg-destructive/10 border-destructive/30 opacity-60",
  rescheduled: "bg-muted-foreground/20 border-muted-foreground/40",
};

export function DayView({
  date,
  clinicId,
  appointments,
  practitioners,
  clinics,
  services,
  canCreate,
  canUpdate,
  canCancel,
  canReschedule,
  canViewDental = false,
}: {
  date: string;
  clinicId?: string;
  appointments: AppointmentRow[];
  practitioners: { id: string; name: string }[];
  clinics: { id: string; name: string }[];
  services: {
    id: string;
    name: string;
    durationMinutes: number;
    price: string;
    clinicId: string;
  }[];
  canCreate: boolean;
  canUpdate: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  canViewDental?: boolean;
}) {
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const [booking, setBooking] = useState<{ time: string; staffId: string } | null>(null);

  const columns = practitioners;
  const gridTemplateColumns = `5rem repeat(${Math.max(columns.length, 1)}, minmax(9rem, 1fr))`;

  return (
    <div className="overflow-x-auto rounded-lg border">
      <div className="grid" style={{ gridTemplateColumns, gridAutoRows: "2.5rem" }}>
        {/* Header row */}
        <div
          className="bg-muted/40 sticky top-0 z-10 border-b"
          style={{ gridColumn: 1, gridRow: 1 }}
        />
        {columns.map((p, i) => (
          <div
            key={p.id}
            className="bg-muted/40 sticky top-0 z-10 border-b border-l px-2 py-2 text-sm font-medium"
            style={{ gridColumn: i + 2, gridRow: 1 }}
          >
            {p.name}
          </div>
        ))}
        {columns.length === 0 && (
          <div
            className="text-muted-foreground p-4 text-sm"
            style={{ gridColumn: "2 / -1", gridRow: `2 / span ${TOTAL_SLOTS}` }}
          >
            No practitioners in this organization yet.
          </div>
        )}

        {/* Time labels */}
        {Array.from({ length: TOTAL_SLOTS }, (_, slot) => (
          <div
            key={`label-${slot}`}
            className="text-muted-foreground border-b px-2 py-1 text-right text-xs"
            style={{ gridColumn: 1, gridRow: slot + 2 }}
          >
            {slotLabel(slot)}
          </div>
        ))}

        {/* Empty clickable cells */}
        {columns.map((p, colIdx) =>
          Array.from({ length: TOTAL_SLOTS }, (_, slot) => {
            const totalMinutes = slot * SLOT_MINUTES;
            const hour = START_HOUR + Math.floor(totalMinutes / 60);
            const minute = totalMinutes % 60;
            const timeStr = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
            return (
              <button
                type="button"
                key={`cell-${p.id}-${slot}`}
                className={cn(
                  "border-b border-l",
                  totalMinutes % 60 === 0 ? "border-t-border/60 border-t" : "",
                  canCreate && "hover:bg-muted/60 cursor-pointer",
                )}
                style={{ gridColumn: colIdx + 2, gridRow: slot + 2 }}
                disabled={!canCreate}
                onClick={() => canCreate && setBooking({ time: timeStr, staffId: p.id })}
                aria-label={`Book ${p.name} at ${timeStr}`}
              />
            );
          }),
        )}

        {/* Appointment blocks */}
        {appointments.map((a) => {
          const colIdx = columns.findIndex((p) => p.id === a.staffId);
          if (colIdx === -1) return null;
          const startRow = rowForTime(new Date(a.startAt), date);
          const endRow = rowForTime(new Date(a.endAt), date);
          const span = Math.max(1, endRow - startRow);
          return (
            <button
              type="button"
              key={a.id}
              className={cn(
                "m-0.5 overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs leading-tight",
                STATUS_COLORS[a.status] ?? STATUS_COLORS.pending,
              )}
              style={{ gridColumn: colIdx + 2, gridRow: `${startRow} / span ${span}` }}
              onClick={() => setSelected(a)}
            >
              <p className="truncate font-medium">{a.patientName}</p>
              <p className="truncate">{a.serviceName}</p>
            </button>
          );
        })}
      </div>

      <AppointmentDetailSheet
        appointment={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        canUpdate={canUpdate}
        canCancel={canCancel}
        canReschedule={canReschedule}
        canViewDental={canViewDental}
      />

      <AppointmentFormDialog
        open={booking !== null}
        onOpenChange={(open) => !open && setBooking(null)}
        clinics={clinics}
        practitioners={practitioners}
        services={services}
        defaultClinicId={clinicId}
        defaultStaffId={booking?.staffId}
        defaultDate={date}
        defaultTime={booking?.time}
      />
    </div>
  );
}
