"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { FollowUpStatusBadge, FollowUpPriorityBadge } from "@/components/patterns/followup-badges";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { toast } from "sonner";
import { followUpTypeLabels } from "@/lib/validation/followup.schema";
import type { FollowUpRow } from "./queries";
import { cancelFollowUpAction, updateFollowUpAction, updateFollowUpStatusAction } from "./actions";

export function FollowUpDetailSheet({
  followUp,
  onOpenChange,
  staff,
  canManage,
}: {
  followUp: FollowUpRow | null;
  onOpenChange: (open: boolean) => void;
  staff: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState(followUp?.notes ?? "");
  const [prevId, setPrevId] = useState<string | null>(null);

  // Render-phase "adjusting state" (not a useEffect) -- resets the notes
  // draft whenever a different follow-up is opened. Same pattern as
  // appointment-detail-sheet.tsx.
  if ((followUp?.id ?? null) !== prevId) {
    setPrevId(followUp?.id ?? null);
    setNotes(followUp?.notes ?? "");
  }

  if (!followUp) {
    return <Sheet open={false} onOpenChange={onOpenChange} />;
  }

  const isTerminal = followUp.status === "completed" || followUp.status === "cancelled";

  function setStatus(status: "in_progress" | "completed") {
    startTransition(async () => {
      try {
        await updateFollowUpStatusAction(followUp!.id, status, notes);
        toast.success(status === "completed" ? "Follow-up completed." : "Marked in progress.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update follow-up.");
      }
    });
  }

  function saveNotes() {
    startTransition(async () => {
      try {
        await updateFollowUpStatusAction(followUp!.id, followUp!.status as "pending" | "in_progress", notes);
        toast.success("Notes saved.");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save notes.");
      }
    });
  }

  function reassign(staffId: string) {
    startTransition(async () => {
      const result = await updateFollowUpAction(followUp!.id, { assignedTo: staffId });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Reassigned.");
    });
  }

  return (
    <Sheet open={followUp !== null} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{followUpTypeLabels[followUp.type as keyof typeof followUpTypeLabels] ?? followUp.type}</SheetTitle>
          <Link href={`/patients/${followUp.patientId}`} className="text-primary text-sm hover:underline">
            {followUp.patientName}
          </Link>
        </SheetHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4">
          <div className="flex items-center gap-2">
            <FollowUpStatusBadge status={followUp.status} />
            <FollowUpPriorityBadge priority={followUp.priority} />
          </div>

          <dl className="grid grid-cols-3 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Due</dt>
            <dd className="col-span-2">
              {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(followUp.dueAt),
              )}
            </dd>
            <dt className="text-muted-foreground">Clinic</dt>
            <dd className="col-span-2">{followUp.clinicName ?? "—"}</dd>
            <dt className="text-muted-foreground">Assigned to</dt>
            <dd className="col-span-2">{followUp.assignedName ?? "Unassigned"}</dd>
          </dl>

          {canManage && !isTerminal && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <Label htmlFor="fu-reassign">Reassign</Label>
                <Select value={followUp.assignedTo ?? "unassigned"} onValueChange={reassign}>
                  <SelectTrigger id="fu-reassign" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {staff.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <Separator />
          <div className="flex flex-col gap-2">
            <Label htmlFor="fu-notes">Notes</Label>
            <Textarea id="fu-notes" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
            <Button size="sm" variant="outline" disabled={pending} onClick={saveNotes} className="self-start">
              Save notes
            </Button>
          </div>
        </div>

        {!isTerminal && (
          <SheetFooter>
            <div className="flex flex-wrap gap-2">
              {followUp.status === "pending" && (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setStatus("in_progress")}>
                  Mark in progress
                </Button>
              )}
              <Button size="sm" disabled={pending} onClick={() => setStatus("completed")}>
                Mark complete
              </Button>
            </div>
            {canManage && (
              <ConfirmDialog
                trigger={
                  <Button variant="destructive" size="sm" disabled={pending}>
                    Cancel follow-up
                  </Button>
                }
                title="Cancel this follow-up?"
                description={`This cancels the follow-up for ${followUp.patientName}. It stays in history.`}
                confirmLabel="Cancel follow-up"
                onConfirm={async () => {
                  await cancelFollowUpAction(followUp.id);
                  toast.success("Follow-up cancelled.");
                  onOpenChange(false);
                }}
              />
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
