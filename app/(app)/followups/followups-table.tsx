"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FollowUpStatusBadge, FollowUpPriorityBadge } from "@/components/patterns/followup-badges";
import { followUpTypeLabels, type FollowUpType } from "@/lib/validation/followup.schema";
import type { FollowUpRow } from "./queries";
import { FollowUpDetailSheet } from "./followup-detail-sheet";

export function FollowUpsTable({
  followUps,
  staff,
  canManage,
}: {
  followUps: FollowUpRow[];
  staff: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [selected, setSelected] = useState<FollowUpRow | null>(null);
  // Lazy initializer, not a direct Date.now() call during render -- runs
  // once at mount, which is all "is this row overdue" needs (this is a
  // static list render, not a live-ticking clock).
  const [now] = useState(() => Date.now());

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Due</TableHead>
            <TableHead>Patient</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {followUps.map((f) => {
            const isOverdue =
              new Date(f.dueAt).getTime() < now &&
              (f.status === "pending" || f.status === "in_progress");
            return (
              <TableRow key={f.id} className="cursor-pointer" onClick={() => setSelected(f)}>
                <TableCell className={isOverdue ? "text-destructive font-medium" : "font-medium"}>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(f.dueAt))}
                  {isOverdue && " · Overdue"}
                </TableCell>
                <TableCell>{f.patientName}</TableCell>
                <TableCell className="text-muted-foreground">
                  {followUpTypeLabels[f.type as FollowUpType] ?? f.type}
                </TableCell>
                <TableCell>
                  <FollowUpPriorityBadge priority={f.priority} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {f.assignedName ?? "Unassigned"}
                </TableCell>
                <TableCell>
                  <FollowUpStatusBadge status={f.status} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <FollowUpDetailSheet
        followUp={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        staff={staff}
        canManage={canManage}
      />
    </>
  );
}
