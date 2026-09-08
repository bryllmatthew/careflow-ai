import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, TriangleAlert } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { UrlTabs } from "@/components/patterns/url-tabs";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getBookingClinicDetail } from "../queries";
import { BookingLinkActions } from "../booking-link-actions";
import { BrandingCard } from "./branding-card";
import { HoursEditor } from "./hours-editor";
import { PublicServices } from "./public-services";
import { PublicPractitioners } from "./public-practitioners";
import { BookingSettingsForm } from "./settings-form";
import { LinksManager } from "./links-manager";

export const metadata: Metadata = { title: "Booking setup" };

export default async function BookingClinicPage({
  params,
}: {
  params: Promise<{ clinicId: string }>;
}) {
  const { clinicId } = await params;

  const auth = await getAuthContext();
  const organizationId = auth?.memberships[0]?.organizationId;
  if (!organizationId) redirect("/login");

  if (!(await can("booking.view", { organizationId }))) redirect("/dashboard");

  const detail = await getBookingClinicDetail(organizationId, clinicId);
  // Not-found rather than forbidden for a clinic in another tenant: RLS
  // already returned nothing, and the two cases are indistinguishable here by
  // design (docs/AUTHORIZATION.md).
  if (!detail) notFound();

  const canManageBooking = await can("booking.manage", { organizationId, clinicId });
  const canUpdateClinic = await can("clinic.update", { organizationId, clinicId });

  const { clinic, settings, services, practitioners, links } = detail;
  const publishedServices = services.filter((s) => s.onlineBookingEnabled).length;
  const publishedPractitioners = practitioners.filter((p) => p.active).length;
  const hasHours = Object.values(clinic.operatingHours).some((w) => w.length > 0);

  // Everything that must be true before the page can actually take a booking,
  // stated as a checklist rather than left for the clinic to discover by
  // opening their own page and finding it empty.
  const blockers = [
    !clinic.slug && "set a booking link",
    !hasHours && "add opening hours",
    publishedServices === 0 && "publish at least one service",
    publishedPractitioners === 0 && "publish at least one practitioner",
  ].filter((v): v is string => Boolean(v));

  const isLive = settings?.onlineBookingEnabled === true && blockers.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/booking">
            <ChevronLeft className="size-4" aria-hidden />
            Online Booking
          </Link>
        </Button>
        <PageHeader
          title={clinic.name}
          description={
            clinic.slug
              ? isLive
                ? "This clinic's booking page is live."
                : "Booking page set up — see what's still needed below."
              : "Set a booking link to give this clinic a public booking page."
          }
          actions={
            clinic.slug ? <BookingLinkActions slug={clinic.slug} name={clinic.name} /> : undefined
          }
        />
      </div>

      {settings?.onlineBookingEnabled && blockers.length > 0 && (
        <Alert>
          <TriangleAlert className="size-4" />
          <AlertTitle>Online booking is on, but patients can&apos;t book yet</AlertTitle>
          <AlertDescription>
            You still need to {blockers.join(", ")}. Until then the booking page shows an
            unavailable message.
          </AlertDescription>
        </Alert>
      )}

      <UrlTabs defaultValue="branding">
        <TabsList>
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="hours">Hours</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="practitioners">Practitioners</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="links">Links</TabsTrigger>
        </TabsList>

        <TabsContent value="branding" className="pt-4">
          <BrandingCard
            clinic={clinic}
            canEdit={canUpdateClinic}
            canManageBooking={canManageBooking}
          />
        </TabsContent>

        <TabsContent value="hours" className="pt-4">
          <HoursEditor
            clinicId={clinic.id}
            timezone={clinic.timezone}
            initial={clinic.operatingHours}
            canEdit={canUpdateClinic}
          />
        </TabsContent>

        <TabsContent value="services" className="pt-4">
          <PublicServices clinicId={clinic.id} services={services} canEdit={canManageBooking} />
        </TabsContent>

        <TabsContent value="practitioners" className="pt-4">
          <PublicPractitioners
            clinicId={clinic.id}
            practitioners={practitioners}
            canEdit={canManageBooking}
          />
        </TabsContent>

        <TabsContent value="settings" className="pt-4">
          <BookingSettingsForm
            clinicId={clinic.id}
            settings={settings}
            canEdit={canManageBooking}
          />
        </TabsContent>

        <TabsContent value="links" className="pt-4">
          <LinksManager
            clinicId={clinic.id}
            clinicName={clinic.name}
            slug={clinic.slug}
            links={links}
            services={services.filter((s) => s.onlineBookingEnabled)}
            practitioners={practitioners.filter((p) => p.active)}
            canEdit={canManageBooking}
          />
        </TabsContent>
      </UrlTabs>
    </div>
  );
}
