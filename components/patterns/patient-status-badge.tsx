import { Badge } from "@/components/ui/badge";
import type { PatientStatus } from "@/lib/validation/patient.schema";

const labels: Record<PatientStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

const variants: Record<PatientStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  inactive: "secondary",
  archived: "outline",
};

export function PatientStatusBadge({ status }: { status: string }) {
  const s = (status as PatientStatus) in labels ? (status as PatientStatus) : "inactive";
  return <Badge variant={variants[s]}>{labels[s]}</Badge>;
}
