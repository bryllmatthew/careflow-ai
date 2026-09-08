import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { getBookingByToken } from "@/lib/booking/public-queries";
import { ClinicLogo } from "@/components/booking/clinic-brand";
import { ManageBooking } from "./manage-booking";

/**
 * The patient's self-service page for one booking, addressed by an
 * unguessable token rather than by appointment id (brief section 27: never
 * expose /appointment/123 as a public management mechanism).
 *
 * Never indexed: the URL is a credential, and a crawler that reached one must
 * not put it in a search result.
 */
export const metadata: Metadata = {
  title: { absolute: "Your booking" },
  robots: { index: false, follow: false, nocache: true },
};

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const booking = await getBookingByToken(token);

  if (!booking) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-2xl">
          <SearchX className="size-6" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Booking not found</h1>
        <p className="text-muted-foreground text-sm">
          This link may have expired or already been used. Please contact the clinic directly.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10 sm:py-14">
      <div className="flex flex-col items-center gap-3 text-center">
        <ClinicLogo name={booking.clinic.name} logoUrl={booking.clinic.logoUrl} size="sm" />
        <h1 className="text-xl font-semibold tracking-tight">{booking.clinic.name}</h1>
      </div>

      <div className="mt-8">
        <ManageBooking token={token} booking={booking} />
      </div>
    </main>
  );
}
