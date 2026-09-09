import { Badge } from "@/components/ui/badge";

/**
 * Marks something booked within the last hour.
 *
 * Whether a row is "new" is decided on the server (see
 * NEW_APPOINTMENT_WINDOW_MS in app/(app)/appointments/queries.ts) so one clock
 * answers the question -- this component only renders the answer.
 */
export function NewBadge({ label = "New" }: { label?: string }) {
  return (
    <Badge className="bg-tint-success text-tint-success-foreground rounded-full border-transparent px-2 py-0 text-[0.6875rem] font-semibold">
      {label}
    </Badge>
  );
}
