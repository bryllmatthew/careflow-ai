"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AppointmentStatusBadge } from "@/components/patterns/appointment-status-badge";
import { AppointmentDetailSheet } from "../appointments/appointment-detail-sheet";
import type { AppointmentRow } from "../appointments/queries";
import { addDays, formatWeekdayShort, toDateKey, todayKey } from "./date-utils";

/**
 * A 7-day agenda, not a pixel-precise time grid -- day view already owns
 * the detailed per-practitioner schedule; week view's job is a fast
 * overview of the week, and a sorted list per day is both simpler to build
 * correctly and easier to scan at this zoom level.
 */
export function WeekView({
  mondayKey,
  appointments,
  canUpdate,
  canCancel,
  canReschedule,
  canViewDental = false,
}: {
  mondayKey: string;
  appointments: AppointmentRow[];
  canUpdate: boolean;
  canCancel: boolean;
  canReschedule: boolean;
  canViewDental?: boolean;
}) {
  const [selected, setSelected] = useState<AppointmentRow | null>(null);
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(mondayKey, i));

  const byDay = new Map<string, AppointmentRow[]>();
  for (const day of days) byDay.set(day, []);
  for (const a of appointments) {
    const key = toDateKey(new Date(a.startAt));
    byDay.get(key)?.push(a);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startAt.localeCompare(b.startAt));
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => (
        <div key={day} className={cn("rounded-lg border p-2", day === today && "border-primary")}>
          <p className={cn("mb-2 text-sm font-medium", day === today && "text-primary")}>
            {formatWeekdayShort(day)}
          </p>
          <div className="flex flex-col gap-1.5">
            {(byDay.get(day) ?? []).length === 0 ? (
              <p className="text-muted-foreground text-xs">No appointments</p>
            ) : (
              byDay.get(day)!.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className="hover:bg-muted rounded-md border p-1.5 text-left text-xs"
                >
                  <p className="font-medium">
                    {new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(
                      new Date(a.startAt),
                    )}
                  </p>
                  <p className="truncate">{a.patientName}</p>
                  <p className="text-muted-foreground truncate">{a.serviceName}</p>
                  <AppointmentStatusBadge status={a.status} />
                </button>
              ))
            )}
          </div>
        </div>
      ))}

      <AppointmentDetailSheet
        appointment={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        canUpdate={canUpdate}
        canCancel={canCancel}
        canReschedule={canReschedule}
        canViewDental={canViewDental}
      />
    </div>
  );
}
