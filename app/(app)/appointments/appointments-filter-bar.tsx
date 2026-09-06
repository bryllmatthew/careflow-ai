"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { appointmentStatuses, appointmentStatusLabels } from "@/lib/validation/appointment.schema";

const ALL = "all";

export function AppointmentsFilterBar({
  clinics,
  practitioners,
}: {
  clinics: { id: string; name: string }[];
  practitioners: { id: string; name: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
        value={searchParams.get("status") ?? ALL}
        onValueChange={(v) => updateParams({ status: v })}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {appointmentStatuses.map((s) => (
            <SelectItem key={s} value={s}>
              {appointmentStatusLabels[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={searchParams.get("practitioner") ?? ALL}
        onValueChange={(v) => updateParams({ practitioner: v })}
      >
        <SelectTrigger className="w-full sm:w-48">
          <SelectValue placeholder="Practitioner" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All practitioners</SelectItem>
          {practitioners.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
