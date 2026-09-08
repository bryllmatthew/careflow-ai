"use client";

import { useState, useTransition } from "react";
import { Loader2, Stethoscope, Pencil } from "lucide-react";
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
import { savePublicServiceAction } from "../actions";

type ServiceRow = {
  id: string;
  name: string;
  durationMinutes: number;
  price: string;
  onlineBookingEnabled: boolean;
  publicName: string | null;
  publicDescription: string | null;
};

/**
 * Which services appear on the public booking page (brief section 13).
 *
 * Publishing is opt-in per service, and the default is off (migration 0019),
 * so enabling online booking never silently exposes a clinic's whole internal
 * catalogue. The patient-facing name is optional and falls back to the
 * internal one -- a clinic only needs it when the internal name is a billing
 * code rather than something a patient would recognise.
 */
export function PublicServices({
  clinicId,
  services,
  canEdit,
}: {
  clinicId: string;
  services: ServiceRow[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState<ServiceRow | null>(null);
  const [pendingId, setPendingId] = useState<string>();
  const [, startTransition] = useTransition();

  function toggle(service: ServiceRow, enabled: boolean) {
    setPendingId(service.id);
    startTransition(async () => {
      const result = await savePublicServiceAction(clinicId, {
        serviceId: service.id,
        onlineBookingEnabled: enabled,
        publicName: service.publicName ?? undefined,
        publicDescription: service.publicDescription ?? undefined,
      });
      setPendingId(undefined);
      if (result.error) toast.error(result.error);
      else
        toast.success(
          enabled
            ? `${service.name} is now bookable online`
            : `${service.name} hidden from the booking page`,
        );
    });
  }

  if (services.length === 0) {
    return (
      <EmptyState
        icon={Stethoscope}
        title="No active services"
        description="Add services to this clinic before publishing them for online booking."
      />
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Bookable services</CardTitle>
          <CardDescription>
            Only the services you switch on here appear on the booking page.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {services.map((service) => (
            <div
              key={service.id}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <Switch
                id={`svc-${service.id}`}
                checked={service.onlineBookingEnabled}
                disabled={!canEdit || pendingId === service.id}
                onCheckedChange={(checked) => toggle(service, checked)}
              />
              <div className="min-w-0 flex-1">
                <Label htmlFor={`svc-${service.id}`} className="cursor-pointer font-medium">
                  {service.publicName || service.name}
                </Label>
                {service.publicName && (
                  <p className="text-muted-foreground text-xs">Internally: {service.name}</p>
                )}
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {service.durationMinutes} min · ₱{service.price}
                </p>
              </div>
              {pendingId === service.id && (
                <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />
              )}
              {service.onlineBookingEnabled && (
                <Badge className="bg-tint-success text-tint-success-foreground rounded-full border-transparent">
                  Public
                </Badge>
              )}
              {canEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit how ${service.name} appears publicly`}
                  onClick={() => setEditing(service)}
                >
                  <Pencil className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {editing && (
        <EditServiceDialog clinicId={clinicId} service={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function EditServiceDialog({
  clinicId,
  service,
  onClose,
}: {
  clinicId: string;
  service: ServiceRow;
  onClose: () => void;
}) {
  const [publicName, setPublicName] = useState(service.publicName ?? "");
  const [publicDescription, setPublicDescription] = useState(service.publicDescription ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await savePublicServiceAction(clinicId, {
        serviceId: service.id,
        onlineBookingEnabled: service.onlineBookingEnabled,
        publicName: publicName.trim() || undefined,
        publicDescription: publicDescription.trim() || undefined,
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
          <DialogTitle>How patients see this service</DialogTitle>
          <DialogDescription>
            Leave blank to use the internal name and description.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="public-name">Public name</Label>
            <Input
              id="public-name"
              value={publicName}
              maxLength={200}
              placeholder={service.name}
              onChange={(e) => setPublicName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="public-description">Public description</Label>
            <Textarea
              id="public-description"
              value={publicDescription}
              maxLength={1000}
              rows={3}
              placeholder="A short sentence about what this involves."
              onChange={(e) => setPublicDescription(e.target.value)}
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
