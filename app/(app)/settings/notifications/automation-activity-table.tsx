import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { followUpTypeLabels, type FollowUpType } from "@/lib/validation/followup.schema";
import type { AutomationActivityRow } from "./queries";

const REMINDER_LABELS: Record<string, string> = {
  confirmation: "Confirmation",
  reminder_24h: "24-hour reminder",
  reminder_2h: "2-hour reminder",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  scheduled: "outline",
  processing: "secondary",
  sent: "default",
  completed: "default",
  pending: "outline",
  in_progress: "secondary",
  failed: "destructive",
  cancelled: "destructive",
  skipped: "outline",
};

export function AutomationActivityTable({ rows }: { rows: AutomationActivityRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground p-4 text-sm">No automation activity yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Patient</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.kind}-${r.id}`}>
            <TableCell className="text-muted-foreground">
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(r.timestamp))}
            </TableCell>
            <TableCell>
              {r.kind === "reminder"
                ? (REMINDER_LABELS[r.label] ?? r.label)
                : (followUpTypeLabels[r.label as FollowUpType] ?? r.label)}
            </TableCell>
            <TableCell>{r.patientName}</TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                {r.status.replaceAll("_", " ")}
              </Badge>
              {r.failureReason && (
                <p className="text-destructive mt-0.5 text-xs">{r.failureReason}</p>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
