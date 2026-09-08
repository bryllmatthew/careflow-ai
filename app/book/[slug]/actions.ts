"use server";

import { getPublicBookingClient, getClientRateKey } from "@/lib/booking/public-client";
import {
  publicBookingSchema,
  bookingErrorMessage,
  type PublicBookingInput,
} from "@/lib/validation/booking.schema";
import { getPublicAvailability, type AvailabilityDay } from "@/lib/booking/public-queries";

/**
 * The public booking page's mutations.
 *
 * These are NOT wrapped in authedAction(): there is no authenticated actor to
 * wrap. Every guarantee authedAction() provides for staff actions is instead
 * provided by public.create_public_booking (migration 0020), which validates,
 * rechecks availability server-side, rate-limits, and writes its own audit row
 * -- in one transaction, which a Server Action calling PostgREST twice could
 * not do anyway (CLAUDE.md: "PostgREST gives one transaction per HTTP
 * request").
 *
 * Nothing here decides anything. The clinic is resolved from the slug inside
 * the RPC, never passed as an id; the appointment's duration, practitioner
 * eligibility and time validity all come from the database. This file's job
 * is to parse input, call one function, and turn a failure code into a
 * sentence.
 */

export type BookingActionResult =
  | { ok: true; reference: string; manageToken: string; startAt: string; duplicate?: boolean }
  | { ok: false; error: string };

export async function submitPublicBookingAction(
  slug: string,
  input: PublicBookingInput,
): Promise<BookingActionResult> {
  const parsed = publicBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  const supabase = getPublicBookingClient();
  const { data, error } = await supabase.rpc("create_public_booking", {
    p_slug: slug,
    p_service_id: parsed.data.serviceId,
    p_start_at: parsed.data.startAt,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_phone: parsed.data.phone ?? undefined,
    p_email: parsed.data.email ?? undefined,
    p_staff_id: parsed.data.staffId ?? undefined,
    p_notes: parsed.data.notes ?? undefined,
    p_date_of_birth: parsed.data.dateOfBirth ?? undefined,
    p_link_token: parsed.data.linkToken ?? undefined,
    p_idempotency_key: parsed.data.idempotencyKey,
    p_client_key: (await getClientRateKey()) ?? undefined,
  });

  // A transport-level failure is never surfaced verbatim: brief section 41
  // ("do not expose internal system errors"). It is logged where an operator
  // can find it and shown to the patient as a generic retry.
  if (error) {
    console.error("[booking] create_public_booking failed:", error);
    return { ok: false, error: bookingErrorMessage(null) };
  }

  const result = data as unknown as {
    ok: boolean;
    error?: string;
    reference?: string;
    manageToken?: string;
    startAt?: string;
    duplicate?: boolean;
  } | null;

  if (!result?.ok) {
    return { ok: false, error: bookingErrorMessage(result?.error) };
  }

  // A replayed submission returns the original booking but not its manage
  // token -- the token was issued once, to the original response, and the RPC
  // stores only its hash. Sending the patient back to the confirmation page
  // without a token is correct: they already have the emailed link.
  return {
    ok: true,
    reference: result.reference ?? "",
    manageToken: result.manageToken ?? "",
    startAt: result.startAt ?? parsed.data.startAt,
    duplicate: result.duplicate ?? false,
  };
}

/**
 * Availability for the date-picker, refetched whenever the patient changes
 * service, practitioner or week. Always server-computed -- the browser never
 * derives a slot from operating hours it was handed (brief section 15).
 */
export async function fetchAvailabilityAction(params: {
  slug: string;
  serviceId: string;
  staffId?: string;
  from: string;
  days: number;
}): Promise<{ ok: true; days: AvailabilityDay[] } | { ok: false; error: string }> {
  const result = await getPublicAvailability(params);
  if (!result.ok) return { ok: false, error: bookingErrorMessage(result.error) };
  return { ok: true, days: result.days };
}
