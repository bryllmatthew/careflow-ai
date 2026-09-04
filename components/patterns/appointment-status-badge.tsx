import { Badge } from "@/components/ui/badge";
import { appointmentStatusLabels, type AppointmentStatus } from "@/lib/validation/appointment.schema";

const variants: Record<AppointmentStatus, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  confirmed: "secondary",
  checked_in: "secondary",
  in_progress: "default",
  completed: "default",
  cancelled: "destructive",
  no_show: "destructive",
  rescheduled: "outline",
};

export function AppointmentStatusBadge({ status }: { status: string }) {
  const s = (status as AppointmentStatus) in appointmentStatusLabels ? (status as AppointmentStatus) : "pending";
  return <Badge variant={variants[s]}>{appointmentStatusLabels[s]}</Badge>;
}
