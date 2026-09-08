"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/patterns/empty-state";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingLinkActions } from "../booking-link-actions";
import { createBookingLinkAction, setBookingLinkActiveAction } from "../actions";

type LinkRow = {
  id: string;
  name: string;
  token: string;
  active: boolean;
  defaultServiceId: string | null;
  defaultPractitionerId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  bookingCount: number;
};

const NONE = "__none__";

/**
 * Campaign booking links (brief sections 21-24).
 *
 * A link is a tracked variant of the clinic's own booking page, never a
 * separate page: it can pre-select a service or practitioner and it carries
 * UTM attribution onto every appointment booked through it, but it grants
 * nothing the bare /book/{slug} URL does not. That is why deactivating one
 * closes a marketing channel rather than closing the clinic's booking page.
 */
export function LinksManager({
  clinicId,
  clinicName,
  slug,
  links,
  services,
  practitioners,
  canEdit,
}: {
  clinicId: string;
  clinicName: string;
  slug: string | null;
  links: LinkRow[];
  services: { id: string; name: string; publicName: string | null }[];
  practitioners: { userId: string; name: string; displayName: string | null }[];
  canEdit: boolean;
}) {
  const [pendingId, setPendingId] = useState<string>();
  const [, startTransition] = useTransition();

  if (!slug) {
    return (
      <EmptyState
        icon={LinkIcon}
        title="Set a booking link first"
        description="Campaign links point at this clinic's booking page, so it needs an address before they can exist."
      />
    );
  }

  function toggle(link: LinkRow, active: boolean) {
    setPendingId(link.id);
    startTransition(async () => {
      const result = await setBookingLinkActiveAction(clinicId, link.id, active);
      setPendingId(undefined);
      if (result.error) toast.error(result.error);
      else toast.success(active ? `${link.name} reactivated` : `${link.name} deactivated`);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Your main booking link</CardTitle>
            <CardDescription>Always active. Share it anywhere.</CardDescription>
          </div>
          <BookingLinkActions slug={slug} name={clinicName} />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Campaign links</CardTitle>
            <CardDescription>
              Track where bookings come from, and pre-fill a service or practitioner.
            </CardDescription>
          </div>
          {canEdit && (
            <NewLinkDialog clinicId={clinicId} services={services} practitioners={practitioners} />
          )}
        </CardHeader>

        <CardContent>
          {links.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No campaign links yet. Your main link above works on its own.
            </p>
          ) : (
            <div className="divide-y">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{link.name}</p>
                      {!link.active && (
                        <Badge variant="secondary" className="rounded-full">
                          Inactive
                        </Badge>
                      )}
                      {link.bookingCount > 0 && (
                        <Badge className="bg-tint-info text-tint-info-foreground rounded-full border-transparent">
                          {link.bookingCount} booking{link.bookingCount === 1 ? "" : "s"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {[link.utmSource, link.utmMedium, link.utmCampaign]
                        .filter(Boolean)
                        .join(" · ") || "No attribution set"}
                    </p>
                  </div>

                  {pendingId === link.id && (
                    <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden />
                  )}

                  {/* An inactive link still resolves to the clinic's booking
                      page -- it simply stops contributing attribution. Copy and
                      QR stay available so a printed poster can be reactivated
                      rather than reprinted. */}
                  <BookingLinkActions
                    slug={slug}
                    name={`${clinicName} — ${link.name}`}
                    linkToken={link.token}
                    compact
                  />

                  {canEdit && (
                    <Switch
                      checked={link.active}
                      disabled={pendingId === link.id}
                      aria-label={`${link.active ? "Deactivate" : "Activate"} ${link.name}`}
                      onCheckedChange={(checked) => toggle(link, checked)}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NewLinkDialog({
  clinicId,
  services,
  practitioners,
}: {
  clinicId: string;
  services: { id: string; name: string; publicName: string | null }[];
  practitioners: { userId: string; name: string; displayName: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [serviceId, setServiceId] = useState(NONE);
  const [practitionerId, setPractitionerId] = useState(NONE);
  const [utmSource, setUtmSource] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [utmCampaign, setUtmCampaign] = useState("");
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const result = await createBookingLinkAction(clinicId, {
        name,
        defaultServiceId: serviceId === NONE ? undefined : serviceId,
        defaultPractitionerId: practitionerId === NONE ? undefined : practitionerId,
        utmSource: utmSource || undefined,
        utmMedium: utmMedium || undefined,
        utmCampaign: utmCampaign || undefined,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Booking link created");
      setOpen(false);
      setName("");
      setServiceId(NONE);
      setPractitionerId(NONE);
      setUtmSource("");
      setUtmMedium("");
      setUtmCampaign("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" aria-hidden />
          New link
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New booking link</DialogTitle>
          <DialogDescription>
            A tracked address for one channel — Facebook, a poster, your website.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="link-name">Name</Label>
            <Input
              id="link-name"
              value={name}
              maxLength={120}
              placeholder="Facebook Ads"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="link-service">Pre-select a service</Label>
              <Select value={serviceId} onValueChange={setServiceId}>
                <SelectTrigger id="link-service" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Let the patient choose</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.publicName || s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="link-practitioner">Pre-select a practitioner</Label>
              <Select value={practitionerId} onValueChange={setPractitionerId}>
                <SelectTrigger id="link-practitioner" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Let the patient choose</SelectItem>
                  {practitioners.map((p) => (
                    <SelectItem key={p.userId} value={p.userId}>
                      {p.displayName || p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="utm-source">Source</Label>
              <Input
                id="utm-source"
                value={utmSource}
                maxLength={100}
                placeholder="facebook"
                onChange={(e) => setUtmSource(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="utm-medium">Medium</Label>
              <Input
                id="utm-medium"
                value={utmMedium}
                maxLength={100}
                placeholder="paid"
                onChange={(e) => setUtmMedium(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="utm-campaign">Campaign</Label>
              <Input
                id="utm-campaign"
                value={utmCampaign}
                maxLength={150}
                placeholder="sept-cleaning"
                onChange={(e) => setUtmCampaign(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={create} disabled={!name.trim() || pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Create link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
