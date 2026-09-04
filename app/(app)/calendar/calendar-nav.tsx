"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addDays, formatDayHeading, todayKey } from "./date-utils";

const ALL = "all";

export function CalendarNav({
  date,
  view,
  clinics,
  clinicId,
}: {
  date: string;
  view: "day" | "week";
  clinics: { id: string; name: string }[];
  clinicId?: string;
}) {
  const step = view === "day" ? 1 : 7;

  function href(overrides: { date?: string; view?: string; clinic?: string }) {
    const params = new URLSearchParams();
    params.set("date", overrides.date ?? date);
    params.set("view", overrides.view ?? view);
    const clinic = overrides.clinic ?? clinicId;
    if (clinic) params.set("clinic", clinic);
    return `/calendar?${params.toString()}`;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Button asChild variant="outline" size="icon">
          <Link href={href({ date: addDays(date, -step) })} aria-label="Previous">
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={href({ date: todayKey() })}>Today</Link>
        </Button>
        <Button asChild variant="outline" size="icon">
          <Link href={href({ date: addDays(date, step) })} aria-label="Next">
            <ChevronRight className="size-4" />
          </Link>
        </Button>
        <h2 className="ml-2 text-lg font-semibold">{formatDayHeading(date)}</h2>
      </div>

      <div className="flex items-center gap-2">
        {clinics.length > 1 && (
          <Select
            value={clinicId ?? ALL}
            onValueChange={(v) => {
              window.location.href = href({ clinic: v === ALL ? undefined : v });
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Clinic" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All clinics</SelectItem>
              {clinics.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <div className="flex overflow-hidden rounded-lg border">
          <Button asChild variant={view === "day" ? "secondary" : "ghost"} size="sm" className="rounded-none">
            <Link href={href({ view: "day" })}>Day</Link>
          </Button>
          <Button asChild variant={view === "week" ? "secondary" : "ghost"} size="sm" className="rounded-none">
            <Link href={href({ view: "week" })}>Week</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
