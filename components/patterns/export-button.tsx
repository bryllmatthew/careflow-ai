"use client";

import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Forwards the CURRENT filter state (range/from/to/clinic/practitioner/
 * service) to the export route, so a CSV always matches what's on screen
 * (section 33: exports respect the same scope/filters as the report).
 * A plain link, not a fetch-then-blob dance -- the browser handles the
 * download natively from the route's Content-Disposition header.
 */
export function ExportButton({
  type,
  extraParams,
}: {
  type: string;
  extraParams?: Record<string, string>;
}) {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams.toString());
  params.set("type", type);
  if (extraParams) {
    for (const [k, v] of Object.entries(extraParams)) params.set(k, v);
  }

  return (
    <Button asChild variant="outline" size="sm">
      <a href={`/api/reports/export?${params.toString()}`}>
        <Download className="size-4" />
        Export CSV
      </a>
    </Button>
  );
}
