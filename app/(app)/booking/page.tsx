import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe, CalendarCheck, TrendingUp, Settings2 } from "lucide-react";
import { getAuthContext } from "@/lib/auth/session";
import { can } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState } from "@/components/patterns/empty-state";
import { StatTile } from "@/components/patterns/stat-tile";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClinicLogo } from "@/components/booking/clinic-brand";
import { listBookingClinics } from "./queries";
import { BookingLinkActions } from "./booking-link-actions";

export const metadata: Metadata = { title: "Online Booking" };

export default async function BookingDashboardPage() {
  const auth = await getAuthContext();
  const organizationId = auth?.memberships[0]?.organizationId;
  if (!organizationId) redirect("/login");

  if (!(await can("booking.view", { organizationId }))) {
    redirect("/dashboard");
  }
  const canManage = await can("booking.manage", { organizationId });

  const clinics = await listBookingClinics(organizationId);

  const live = clinics.filter((c) => c.onlineBookingEnabled).length;
  const today = clinics.reduce((sum, c) => sum + c.bookingsToday, 0);
  const week = clinics.reduce((sum, c) => sum + c.bookingsThisWeek, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Online Booking"
        description="Give each clinic its own booking page, and share the link anywhere."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Booking pages live"
          value={`${live} of ${clinics.length}`}
          icon={Globe}
          tone={live > 0 ? "success" : "warning"}
        />
        <StatTile label="Booked today" value={String(today)} icon={CalendarCheck} tone="primary" />
        <StatTile label="Booked this week" value={String(week)} icon={TrendingUp} tone="info" />
      </div>

      {clinics.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No clinics yet"
          description="Create a clinic first — every booking page belongs to one clinic."
          action={
            <Button asChild>
              <Link href="/clinics">Go to Clinics</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {clinics.map((clinic) => (
            <Card key={clinic.id}>
              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <ClinicLogo name={clinic.name} logoUrl={clinic.logoUrl} size="sm" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{clinic.name}</p>
                    {clinic.onlineBookingEnabled ? (
                      <Badge className="bg-tint-success text-tint-success-foreground rounded-full border-transparent">
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="rounded-full">
                        Off
                      </Badge>
                    )}
                  </div>

                  {/* Names the specific thing still missing rather than a
                      generic "not configured" -- this is the screen where a
                      clinic administrator finds out why their page is empty. */}
                  <p className="text-muted-foreground mt-1 text-sm">
                    {!clinic.slug
                      ? "No booking link yet"
                      : !clinic.hasOperatingHours
                        ? "Opening hours not set — no times can be offered"
                        : clinic.publicServiceCount === 0
                          ? "No services published"
                          : clinic.publicPractitionerCount === 0
                            ? "No practitioners published"
                            : `${clinic.publicServiceCount} service${clinic.publicServiceCount === 1 ? "" : "s"} · ${clinic.publicPractitionerCount} practitioner${clinic.publicPractitionerCount === 1 ? "" : "s"} · ${clinic.bookingsThisWeek} booked this week`}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {clinic.slug && <BookingLinkActions slug={clinic.slug} name={clinic.name} />}
                  <Button variant={canManage ? "default" : "outline"} size="sm" asChild>
                    <Link href={`/booking/${clinic.id}`}>
                      <Settings2 className="size-4" aria-hidden />
                      {canManage ? "Manage" : "View"}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
