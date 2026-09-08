"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, X, Copy } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  type OperatingHours,
  type WeekdayKey,
} from "@/lib/validation/booking.schema";
import { saveOperatingHoursAction } from "../actions";

/**
 * Editor for clinics.operating_hours.
 *
 * This writes the clinic's real hours column, not a booking-specific copy: the
 * availability engine (app.booking_slots, migration 0020) reads it directly,
 * and any future scheduling feature will read the same column. The column has
 * existed since migration 0001 with nothing to populate it -- this is that
 * editor, arriving with the first feature that actually needs the data.
 */
export function HoursEditor({
  clinicId,
  timezone,
  initial,
  canEdit,
}: {
  clinicId: string;
  timezone: string;
  initial: OperatingHours;
  canEdit: boolean;
}) {
  const [hours, setHours] = useState<OperatingHours>(initial);
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(hours) !== JSON.stringify(initial);

  function update(day: WeekdayKey, windows: { open: string; close: string }[]) {
    setHours((h) => ({ ...h, [day]: windows }));
  }

  function save() {
    startTransition(async () => {
      const result = await saveOperatingHoursAction(clinicId, hours);
      if (result.error) toast.error(result.error);
      else toast.success("Opening hours saved");
    });
  }

  /** Copies the first open day across every other weekday -- the common case. */
  function applyToAll() {
    const source = WEEKDAY_KEYS.map((d) => hours[d]).find((w) => w.length > 0);
    if (!source) return;
    setHours({
      mon: [...source],
      tue: [...source],
      wed: [...source],
      thu: [...source],
      fri: [...source],
      sat: hours.sat,
      sun: hours.sun,
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Opening hours</CardTitle>
        <CardDescription>
          Bookable times are generated from these hours, in the clinic&apos;s timezone ({timezone}).
          A day with no hours is closed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {WEEKDAY_KEYS.map((day) => {
            const windows = hours[day];
            const isOpen = windows.length > 0;
            return (
              <div
                key={day}
                className="flex flex-wrap items-start gap-3 border-b pb-3 last:border-0"
              >
                <div className="flex w-40 shrink-0 items-center gap-2.5 pt-1.5">
                  <Switch
                    id={`day-${day}`}
                    checked={isOpen}
                    disabled={!canEdit || pending}
                    onCheckedChange={(checked) =>
                      update(day, checked ? [{ open: "09:00", close: "17:00" }] : [])
                    }
                  />
                  <Label htmlFor={`day-${day}`} className="cursor-pointer">
                    {WEEKDAY_LABELS[day]}
                  </Label>
                </div>

                <div className="flex-1 space-y-2">
                  {!isOpen && <p className="text-muted-foreground pt-1.5 text-sm">Closed</p>}

                  {windows.map((w, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        type="time"
                        aria-label={`${WEEKDAY_LABELS[day]} opening time`}
                        value={w.open}
                        disabled={!canEdit || pending}
                        className="w-32"
                        onChange={(e) =>
                          update(
                            day,
                            windows.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)),
                          )
                        }
                      />
                      <span className="text-muted-foreground text-sm">to</span>
                      <Input
                        type="time"
                        aria-label={`${WEEKDAY_LABELS[day]} closing time`}
                        value={w.close}
                        disabled={!canEdit || pending}
                        className="w-32"
                        onChange={(e) =>
                          update(
                            day,
                            windows.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)),
                          )
                        }
                      />
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove this period"
                          disabled={pending}
                          onClick={() =>
                            update(
                              day,
                              windows.filter((_, j) => j !== i),
                            )
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))}

                  {/* A second window per day covers the lunch-break pattern
                      (9-12, 13-17) without a separate "breaks" concept --
                      a gap between two windows IS the break. */}
                  {canEdit && isOpen && windows.length < 3 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={pending}
                      onClick={() => update(day, [...windows, { open: "13:00", close: "17:00" }])}
                    >
                      <Plus className="size-3" aria-hidden />
                      Add a period
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={!dirty || pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save hours
            </Button>
            <Button variant="outline" size="sm" onClick={applyToAll} disabled={pending}>
              <Copy className="size-4" aria-hidden />
              Copy to Mon–Fri
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
