"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { agingBucketLabels, type AgingBucket } from "@/lib/reporting/receivables";

const ALL = "all";

export function ReceivablesFilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateAging(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) params.delete("aging");
    else params.set("aging", value);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <Select value={searchParams.get("aging") ?? ALL} onValueChange={updateAging}>
      <SelectTrigger className="w-full sm:w-44" aria-label="Aging bucket">
        <SelectValue placeholder="Aging" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All Ages</SelectItem>
        {(Object.keys(agingBucketLabels) as AgingBucket[]).map((b) => (
          <SelectItem key={b} value={b}>
            {agingBucketLabels[b]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
