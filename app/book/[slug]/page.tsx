import type { Metadata } from "next";
import { CalendarX2 } from "lucide-react";
import { getPublicBookingPage } from "@/lib/booking/public-queries";
import { bookingPageUrl } from "@/lib/booking/links";
import { ClinicBrand } from "@/components/booking/clinic-brand";
import { BookingFlow } from "./booking-flow";
import { ClinicFooter } from "./clinic-footer";

/**
 * The private, per-clinic patient-facing booking page.
 *
 * Rendered dynamically on every request, deliberately. Brief section 38 allows
 * caching public branding, and this page does not take it: branding and
 * availability arrive in the same payload, availability is time-sensitive by
 * definition, and the requirement that a renamed clinic show its new name
 * "without requiring the administrator to manually update the booking page"
 * (section 2) is only unconditionally true if nothing is cached. The payload is
 * one RPC round trip -- the wrong thing to optimise before it is measured
 * (docs/PRODUCT_SPEC.md's "make it correct first").
 */

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ k?: string }>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { k } = await searchParams;
  const page = await getPublicBookingPage(slug, k);

  if (!page) {
    return { title: "Booking unavailable", robots: { index: false, follow: false } };
  }

  const title = `Book an Appointment | ${page.clinic.name}`;
  const description =
    page.settings.welcomeMessage?.slice(0, 160) ??
    `Book an appointment online with ${page.clinic.name}.`;
  const url = bookingPageUrl(page.clinic.slug);

  return {
    // Overrides the root layout's "%s · CareFlow AI" template: this page
    // belongs to the clinic, not to CareFlow, and its tab and social card
    // should say so.
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: page.clinic.name,
      type: "website",
      images: page.clinic.logoUrl ? [{ url: page.clinic.logoUrl }] : undefined,
    },
    icons: page.clinic.logoUrl ? { icon: page.clinic.logoUrl } : undefined,
  };
}

export default async function PublicBookingPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { k } = await searchParams;
  const page = await getPublicBookingPage(slug, k);

  // One state for "no such clinic", "clinic deactivated" and "online booking
  // switched off". Telling them apart would confirm which clinic slugs exist
  // (brief section 33).
  if (!page) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-2xl">
          <CalendarX2 className="size-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Booking unavailable</h1>
        <p className="text-muted-foreground text-sm">
          This booking page isn&apos;t available right now. If you have the clinic&apos;s phone
          number, please give them a call to book.
        </p>
      </main>
    );
  }

  const hasServices = page.services.length > 0;
  const hasPractitioners = page.practitioners.length > 0;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <ClinicBrand
        name={page.clinic.name}
        logoUrl={page.clinic.logoUrl}
        tagline={page.settings.welcomeMessage}
      />

      <div className="mt-8">
        {hasServices && hasPractitioners ? (
          <BookingFlow slug={slug} page={page} linkToken={k} />
        ) : (
          // A clinic that has enabled booking but published no service or no
          // practitioner is a real, recoverable configuration state -- the
          // patient sees a calm message, not an empty wizard that dead-ends
          // at step two (brief section 41).
          <div className="bg-card ring-foreground/[0.06] shadow-liquid rounded-2xl p-8 text-center ring-1">
            <h2 className="font-medium">Online booking isn&apos;t set up yet</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              {page.clinic.phone
                ? "Please call the clinic to book an appointment."
                : "Please contact the clinic to book an appointment."}
            </p>
          </div>
        )}
      </div>

      <ClinicFooter clinic={page.clinic} />
    </main>
  );
}
