"use client";

import { useState, useRef, useTransition } from "react";
import { Upload, Trash2, Loader2, Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/patterns/confirm-dialog";
import { ClinicLogo } from "@/components/booking/clinic-brand";
import { bookingPageUrl } from "@/lib/booking/links";
import { slugifyClinicName } from "@/lib/validation/booking.schema";
import { setClinicSlugAction, uploadClinicLogoAction, removeClinicLogoAction } from "../actions";

/**
 * Branding management: the booking link (clinics.slug) and the logo
 * (clinics.logo_url).
 *
 * There is deliberately no editable "booking page clinic name" field
 * (brief section 10). The clinic's name is shown here as authoritative,
 * read-only text, and changing it happens where clinics are managed. A second
 * name would immediately raise the question of which one is real.
 */
export function BrandingCard({
  clinic,
  canEdit,
  canManageBooking,
}: {
  clinic: {
    id: string;
    name: string;
    slug: string | null;
    logoUrl: string | null;
  };
  canEdit: boolean;
  canManageBooking: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <LogoCard clinic={clinic} canEdit={canEdit} />
      <SlugCard clinic={clinic} canEdit={canManageBooking} />
    </div>
  );
}

function LogoCard({
  clinic,
  canEdit,
}: {
  clinic: { id: string; name: string; logoUrl: string | null };
  canEdit: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(file: File) {
    const formData = new FormData();
    formData.append("logo", file);
    startTransition(async () => {
      const result = await uploadClinicLogoAction(clinic.id, formData);
      if (result.error) toast.error(result.error);
      else toast.success("Logo updated — it's already live on the booking page.");
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Clinic logo</CardTitle>
        <CardDescription>
          Shown at the top of the booking page. PNG, JPG or WEBP, up to 5 MB.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-5">
        <ClinicLogo name={clinic.name} logoUrl={clinic.logoUrl} />

        <div className="flex-1 space-y-2">
          {/* The live preview above IS the fallback when no logo exists, so a
              clinic can see exactly what patients see before uploading
              anything (brief section 9). */}
          {!clinic.logoUrl && (
            <p className="text-muted-foreground text-sm">
              No logo yet — patients see these initials.
            </p>
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                id={`logo-${clinic.id}`}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                }}
              />
              <Button variant="outline" size="sm" asChild disabled={pending}>
                <label htmlFor={`logo-${clinic.id}`} className="cursor-pointer">
                  {pending ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Upload className="size-4" aria-hidden />
                  )}
                  {clinic.logoUrl ? "Replace logo" : "Upload logo"}
                </label>
              </Button>

              {clinic.logoUrl && (
                <ConfirmDialog
                  title="Remove the logo?"
                  description="The booking page will show the clinic's initials instead."
                  confirmLabel="Remove logo"
                  onConfirm={async () => {
                    const result = await removeClinicLogoAction(clinic.id);
                    if (result.error) throw new Error(result.error);
                    toast.success("Logo removed");
                  }}
                  trigger={
                    <Button variant="outline" size="sm" disabled={pending}>
                      <Trash2 className="size-4" aria-hidden />
                      Remove
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SlugCard({
  clinic,
  canEdit,
}: {
  clinic: { id: string; name: string; slug: string | null };
  canEdit: boolean;
}) {
  const [value, setValue] = useState(clinic.slug ?? slugifyClinicName(clinic.name));
  const [pending, startTransition] = useTransition();
  const dirty = value !== (clinic.slug ?? "");

  /**
   * Live input sanitising, deliberately gentler than slugifyClinicName: that
   * one trims trailing hyphens, which makes "smile-" impossible to type on the
   * way to "smile-dental". Here invalid characters collapse to a hyphen and
   * nothing is trimmed; the trailing hyphen is only a problem at save time,
   * where the schema catches it with a sentence.
   */
  function sanitize(raw: string): string {
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^-+/, "")
      .slice(0, 60);
  }

  function save() {
    startTransition(async () => {
      const result = await setClinicSlugAction(clinic.id, value);
      if (result.error) toast.error(result.error);
      else toast.success("Booking link saved");
    });
  }

  const previewUrl = bookingPageUrl(value || "your-clinic");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Booking link</CardTitle>
        <CardDescription>
          The web address patients use. Keep it short and recognisable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`clinic-name-${clinic.id}`}>Clinic name</Label>
          {/* Read-only on purpose: clinics.name is the single source of truth
              for what the booking page says. */}
          <Input
            id={`clinic-name-${clinic.id}`}
            value={clinic.name}
            readOnly
            disabled
            className="bg-muted/60"
          />
          <p className="text-muted-foreground text-xs">
            The booking page always shows this name. Change it under Clinics.
          </p>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`slug-${clinic.id}`}>Link</Label>
          <div className="flex items-center gap-2">
            <Link2 className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <Input
              id={`slug-${clinic.id}`}
              value={value}
              disabled={!canEdit || pending}
              onChange={(e) => setValue(sanitize(e.target.value))}
              placeholder="smile-dental"
              aria-describedby={`slug-preview-${clinic.id}`}
            />
          </div>
          <p id={`slug-preview-${clinic.id}`} className="text-muted-foreground text-xs break-all">
            {previewUrl}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button size="sm" onClick={save} disabled={!dirty || !value || pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save link
            </Button>
          )}
          {clinic.slug && (
            // "Preview booking page" opens the real page -- there is no
            // separate preview renderer to drift from production
            // (brief section 11).
            <Button variant="outline" size="sm" asChild>
              <a href={bookingPageUrl(clinic.slug)} target="_blank" rel="noreferrer noopener">
                <ExternalLink className="size-4" aria-hidden />
                Preview booking page
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
