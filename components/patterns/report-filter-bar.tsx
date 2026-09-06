"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DATE_RANGE_KEYS, dateRangeLabels } from "@/lib/reporting/date-range";

const ALL = "all";

/**
 * The one filter bar every dashboard/report page uses (section 4/31) --
 * date range, clinic, and optionally practitioner/service. Writes to the
 * SAME searchParams shape everywhere (`range`, `from`, `to`, `clinic`,
 * `practitioner`, `service`) so navigating between report pages preserves
 * scope automatically (section 31) -- each page's Link/nav just needs to
 * forward `location.search`, not re-serialize the filters by hand.
 */
export function ReportFilterBar({
  clinics,
  practitioners,
  services,
}: {
  clinics: { id: string; name: string }[];
  practitioners?: { id: string; name: string }[];
  services?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentRange = searchParams.get("range") ?? "this_month";
  const [customFrom, setCustomFrom] = useState(searchParams.get("from") ?? "");
  const [customTo, setCustomTo] = useState(searchParams.get("to") ?? "");

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === ALL) params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", "custom");
    params.set("from", customFrom);
    params.set("to", customTo);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <Select value={currentRange} onValueChange={(v) => updateParams({ range: v })}>
        <SelectTrigger className="w-full sm:w-44" aria-label="Date range">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_RANGE_KEYS.map((k) => (
            <SelectItem key={k} value={k}>
              {dateRangeLabels[k]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {currentRange === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="w-40"
            aria-label="From date"
          />
          <span className="text-muted-foreground text-sm">to</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="w-40"
            aria-label="To date"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={applyCustomRange}
            disabled={!customFrom || !customTo}
          >
            Apply
          </Button>
        </div>
      )}

      {clinics.length > 1 && (
        <Select
          value={searchParams.get("clinic") ?? ALL}
          onValueChange={(v) => updateParams({ clinic: v })}
        >
          <SelectTrigger className="w-full sm:w-44" aria-label="Clinic">
            <SelectValue placeholder="Clinic" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Clinics</SelectItem>
            {clinics.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {practitioners && practitioners.length > 0 && (
        <Select
          value={searchParams.get("practitioner") ?? ALL}
          onValueChange={(v) => updateParams({ practitioner: v })}
        >
          <SelectTrigger className="w-full sm:w-48" aria-label="Practitioner">
            <SelectValue placeholder="Practitioner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Practitioners</SelectItem>
            {practitioners.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {services && services.length > 0 && (
        <Select
          value={searchParams.get("service") ?? ALL}
          onValueChange={(v) => updateParams({ service: v })}
        >
          <SelectTrigger className="w-full sm:w-48" aria-label="Service">
            <SelectValue placeholder="Service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All Services</SelectItem>
            {services.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
