import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The clinic's identity on every patient-facing surface: the booking page, the
 * confirmation, and the manage-booking page.
 *
 * Everything here is passed in from the clinic record via
 * get_public_booking_page -- nothing about a clinic is ever hardcoded, which is
 * the central requirement of Phase 10. Renaming a clinic in CareFlow changes
 * this on the next request, with no booking-page edit and no cache to bust
 * (the page is dynamically rendered; see app/book/[slug]/page.tsx).
 */

/** Up to two letters from the clinic name -- "Smile Dental Clinic" -> "SD". */
export function clinicInitials(name: string): string {
  const words = name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return (words[0] ?? "").slice(0, 2).toUpperCase();
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
}

/**
 * A clinic without a logo gets a deliberate initials treatment, never a broken
 * image and never an empty box (brief section 9). It reads as a designed
 * fallback rather than a missing asset, which matters because most clinics
 * will see it before they ever upload anything.
 */
export function ClinicLogo({
  name,
  logoUrl,
  size = "lg",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  size?: "sm" | "lg";
  className?: string;
}) {
  const px = size === "lg" ? 80 : 44;
  const box = size === "lg" ? "size-20" : "size-11";
  const text = size === "lg" ? "text-2xl" : "text-base";

  if (logoUrl) {
    return (
      <div
        className={cn(
          "bg-card ring-foreground/[0.06] shadow-liquid relative overflow-hidden rounded-2xl ring-1",
          box,
          className,
        )}
      >
        {/*
          `unoptimized` because the source is a Supabase Storage host that is
          not in next.config.ts's remotePatterns, and adding a wildcard image
          host to satisfy one <Image> would let any URL stored in the database
          drive the optimizer. Logos are already size-capped at 5 MB by the
          bucket and served from a CDN-backed public bucket.
        */}
        <Image
          src={logoUrl}
          alt={`${name} logo`}
          width={px}
          height={px}
          unoptimized
          className="size-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-tint-primary text-tint-primary-foreground ring-foreground/[0.06] shadow-liquid flex items-center justify-center rounded-2xl font-semibold ring-1",
        box,
        text,
        className,
      )}
      aria-hidden
    >
      {clinicInitials(name)}
    </div>
  );
}

export function ClinicBrand({
  name,
  logoUrl,
  tagline,
}: {
  name: string;
  logoUrl?: string | null;
  tagline?: string | null;
}) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <ClinicLogo name={name} logoUrl={logoUrl} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{name}</h1>
        {tagline && (
          <p className="text-muted-foreground mx-auto mt-2 max-w-prose text-sm">{tagline}</p>
        )}
      </div>
    </div>
  );
}
