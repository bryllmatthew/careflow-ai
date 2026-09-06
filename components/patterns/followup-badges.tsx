import { Badge } from "@/components/ui/badge";
import {
  followUpStatusLabels,
  followUpPriorityLabels,
  type FollowUpStatus,
  type FollowUpPriority,
} from "@/lib/validation/followup.schema";

const statusVariants: Record<FollowUpStatus, "default" | "secondary" | "outline" | "destructive"> =
  {
    pending: "outline",
    in_progress: "secondary",
    completed: "default",
    cancelled: "destructive",
  };

export function FollowUpStatusBadge({ status }: { status: string }) {
  const s =
    (status as FollowUpStatus) in followUpStatusLabels ? (status as FollowUpStatus) : "pending";
  return <Badge variant={statusVariants[s]}>{followUpStatusLabels[s]}</Badge>;
}

const priorityVariants: Record<
  FollowUpPriority,
  "default" | "secondary" | "outline" | "destructive"
> = {
  low: "outline",
  normal: "secondary",
  high: "default",
  urgent: "destructive",
};

export function FollowUpPriorityBadge({ priority }: { priority: string }) {
  const p =
    (priority as FollowUpPriority) in followUpPriorityLabels
      ? (priority as FollowUpPriority)
      : "normal";
  return <Badge variant={priorityVariants[p]}>{followUpPriorityLabels[p]}</Badge>;
}
