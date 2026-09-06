"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  followUpTypes,
  followUpTypeLabels,
  followUpPriorities,
  followUpPriorityLabels,
} from "@/lib/validation/followup.schema";

const ALL = "all";
const BUCKETS = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Due Today" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
] as const;

export function FollowUpsFilterBar({
  clinics,
  staff,
  counts,
}: {
  clinics: { id: string; name: string }[];
  staff: { id: string; name: string }[];
  counts: { overdue: number; dueToday: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeBucket = searchParams.get("bucket") ?? "overdue";

  function updateParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === ALL) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {BUCKETS.map((b) => (
          <Button
            key={b.key}
            size="sm"
            variant={activeBucket === b.key ? "secondary" : "outline"}
            onClick={() => updateParams({ bucket: b.key })}
            className={cn(b.key === "overdue" && counts.overdue > 0 && "border-destructive/40")}
          >
            {b.label}
            {b.key === "overdue" && counts.overdue > 0 && (
              <span className="text-destructive ml-1 font-semibold">{counts.overdue}</span>
            )}
            {b.key === "today" && counts.dueToday > 0 && (
              <span className="text-muted-foreground ml-1">{counts.dueToday}</span>
            )}
          </Button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {clinics.length > 1 && (
          <Select
            value={searchParams.get("clinic") ?? ALL}
            onValueChange={(v) => updateParams({ clinic: v })}
          >
            <SelectTrigger className="w-full sm:w-44">
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

        <Select
          value={searchParams.get("assigned") ?? ALL}
          onValueChange={(v) => updateParams({ assigned: v })}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Assigned staff" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All staff</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("type") ?? ALL}
          onValueChange={(v) => updateParams({ type: v })}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {followUpTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {followUpTypeLabels[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={searchParams.get("priority") ?? ALL}
          onValueChange={(v) => updateParams({ priority: v })}
        >
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All priorities</SelectItem>
            {followUpPriorities.map((p) => (
              <SelectItem key={p} value={p}>
                {followUpPriorityLabels[p]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
