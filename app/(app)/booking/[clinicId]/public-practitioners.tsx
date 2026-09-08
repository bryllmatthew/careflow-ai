"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Users } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/patterns/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { savePublicPractitionerAction } from "../actions";

type PractitionerRow = {
  userId: string;
  name: string;
  published: boolean;
  active: boolean;
  displayName: string | null;
  title: string | null;
  bio: string | null;
};

/**
 * Which team members patients can book, and how they are introduced.
 *
 * The list is every active member of the organization, because there is still
 * no staff table in this app (migrations 0011 and 0013 both record why) --
 * a "practitioner" is a profile. Publishing is opt-in: a row in
 * clinic_booking_practitioners only exists once someone is switched on here,
 * and absence means "not bookable", never "bookable by default".
 *
 * A member who is later suspended or removed from the organization stops being
 * bookable immediately, with no action needed here -- app.public_practitioner_ids
 * joins on membership status (migration 0020).
 */
export function PublicPractitioners({
  clinicId,
  practitioners,
  canEdit,
}: {
  clinicId: string;
  practitioners: PractitionerRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<PractitionerRow | null>(null);
  const [pendingId, setPendingId] = useState<string>();
  const [, startTransition] = useTransition();

  function toggle(p: PractitionerRow, active: boolean) {
    setPendingId(p.userId);
    startTransition(async () => {
      const result = await savePublicPractitionerAction(clinicId, {
        userId: p.userId,
        active,
        displayName: p.displayName ?? undefined,
        title: p.title ?? undefined,
        bio: p.bio ?? undefined,
      });
      setPendingId(undefined);
      if (result.error) toast.error(result.error);
      else
        toast.success(
          active ? `${p.name} is now bookable online` : `${p.name} hidden from the booking page`,
        );
    });
  }

  if (practitioners.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No team members"
        description="Invite people to the organization before publishing them for online booking."
      />
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Bookable practitioners</CardTitle>
          <CardDescription>
            Only the people you switch on here appear on the booking page.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {practitioners.map((p) => (
            <div
              key={p.userId}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <Switch
                id={`prac-${p.userId}`}
                checked={p.active}
                disabled={!canEdit || pendingId === p.userId}
                onCheckedChange={(checked) => toggle(p, checked)}
              />
              <div className="min-w-0 flex-1">
                <Label htmlFor={`prac-${p.userId}`} className="cursor-pointer font-medium">
                  {p.displayName || p.name}
                </Label>
                {p.displayName && (
                  <p className="text-muted-foreground text-xs">Internally: {p.name}</p>
                )}
                {p.title && <p className="text-muted-foreground text-sm">{p.title}</p>}
              </div>
              {pendingId === p.userId && (
                <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />
              )}
              {p.active && (
                <Badge className="bg-tint-success text-tint-success-foreground rounded-full border-transparent">
                  Public
                </Badge>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit how ${p.name} appears publicly`}
                  onClick={() => setEditing(p)}
                >
                  <Pencil className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {editing && (
        <EditPractitionerDialog
          clinicId={clinicId}
          practitioner={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function EditPractitionerDialog({
  clinicId,
  practitioner,
  onClose,
}: {
  clinicId: string;
  practitioner: PractitionerRow;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(practitioner.displayName ?? "");
  const [title, setTitle] = useState(practitioner.title ?? "");
  const [bio, setBio] = useState(practitioner.bio ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await savePublicPractitionerAction(clinicId, {
        userId: practitioner.userId,
        active: practitioner.active,
        displayName: displayName.trim() || undefined,
        title: title.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Saved");
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How patients see this practitioner</DialogTitle>
          <DialogDescription>
            Leave the name blank to use their profile name. Email addresses are never shown.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              maxLength={120}
              placeholder={practitioner.name}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prac-title">Title</Label>
            <Input
              id="prac-title"
              value={title}
              maxLength={120}
              placeholder="Dentist"
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="prac-bio">Short bio</Label>
            <Textarea
              id="prac-bio"
              value={bio}
              maxLength={1000}
              rows={3}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
