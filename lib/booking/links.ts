import { renderSVG } from "uqr";
import { publicEnv } from "@/lib/env";

/**
 * Booking URL construction and QR rendering.
 *
 * Deliberately isomorphic (no `server-only`): the clinic-side "copy link"
 * button and QR preview are client components, and the public page's metadata
 * builds the same URL on the server. One implementation means the URL a
 * receptionist copies is provably the URL the QR code encodes.
 */

/** The public page for a clinic: https://app.example.com/book/smile-dental */
export function bookingPageUrl(slug: string, linkToken?: string): string {
  const base = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const url = `${base}/book/${encodeURIComponent(slug)}`;
  return linkToken ? `${url}?k=${encodeURIComponent(linkToken)}` : url;
}

/**
 * The patient's self-service page for one booking. The token IS the credential.
 *
 * Lives under /book/ with the rest of the patient-facing surface, not under
 * /booking/ -- that path is the clinic-side administration area, and
 * /booking/{clinicId} would be ambiguous with /booking/{token} for the router
 * as well as for anyone reading a URL.
 */
export function manageBookingUrl(token: string): string {
  const base = publicEnv().NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  return `${base}/book/manage/${encodeURIComponent(token)}`;
}

/**
 * An inline SVG QR code for a booking URL.
 *
 * `uqr` is a zero-dependency encoder, chosen over the alternatives for the
 * same reason lib/reporting/timezone.ts avoided date-fns: the job is small and
 * the dependency should be too. SVG rather than a canvas/PNG so the code stays
 * crisp on a printed A4 poster and needs no client-side rendering -- the
 * clinic-side page can serve it straight from a Server Component.
 *
 * Error correction is left at the library default (M, ~15%), which tolerates a
 * scuffed or partly-obscured printout without inflating the module count to
 * the point where a phone camera struggles.
 */
export function bookingQrSvg(url: string): string {
  return renderSVG(url, { border: 2 });
}

/**
 * The token for a new booking link. Lowercase alphanumeric, 16 chars, matching
 * the booking_links_token_check constraint.
 *
 * Generated in the application rather than the database because a booking link
 * is created by an ordinary INSERT through RLS (no RPC is needed -- it is a
 * single row with no cross-table invariant), so there is no SECURITY DEFINER
 * function in the path that could generate it server-side.
 *
 * This is an identifier, not a secret: it grants nothing the clinic's bare
 * slug does not already grant. Its length exists to stop casual enumeration of
 * a clinic's campaign links, not to protect data.
 */
export function generateLinkToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
