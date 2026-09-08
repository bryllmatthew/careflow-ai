"use server";

import { revalidatePath } from "next/cache";
import { getPublicBookingClient, getClientRateKey } from "@/lib/booking/public-client";
import { bookingErrorMessage } from "@/lib/validation/booking.schema";
import { getPublicAvailability } from "@/lib/booking/public-queries";
import type { AvailabilityDay } from "@/lib/booking/public-queries";

/**
 * Patient self-service on an existing booking.
 *
 * The token is the only credential and it is never trusted as an identifier:
 * the RPCs hash it and look up by hash, so this layer cannot enumerate
 * bookings and cannot address one it was not handed. Every eligibility rule
 * (the clinic's allow_cancellation / allow_rescheduling toggles, the cutoff
 * window, the appointment still being live) is re-evaluated inside the
 * database on each call, never carried over from what the page rendered.
 */

type Result = { ok: true } | { ok: false; error: string };

export async function cancelBookingAction(token: string): Promise<Result> {
  const supabase = getPublicBookingClient();
  const { data, error } = await supabase.rpc("cancel_public_booking", {
    p_token: token,
    p_client_key: (await getClientRateKey()) ?? undefined,
  });

  if (error) {
    console.error("[booking] cancel_public_booking failed:", error);
    return { ok: false, error: bookingErrorMessage(null) };
  }

  const result = data as unknown as { ok: boolean; error?: string } | null;
  if (!result?.ok) return { ok: false, error: bookingErrorMessage(result?.error) };

  revalidatePath(`/book/manage/${token}`);
  return { ok: true };
}

export async function rescheduleBookingAction(token: string, startAtISO: string): Promise<Result> {
  const supabase = getPublicBookingClient();
  const { data, error } = await supabase.rpc("reschedule_public_booking", {
    p_token: token,
    p_start_at: startAtISO,
    p_client_key: (await getClientRateKey()) ?? undefined,
  });

  if (error) {
    console.error("[booking] reschedule_public_booking failed:", error);
    return { ok: false, error: bookingErrorMessage(null) };
  }

  const result = data as unknown as { ok: boolean; error?: string } | null;
  if (!result?.ok) return { ok: false, error: bookingErrorMessage(result?.error) };

  revalidatePath(`/book/manage/${token}`);
  return { ok: true };
}

/**
 * Availability for the reschedule picker. Reuses the same public availability
 * endpoint the booking flow uses -- there is one slot generator, and a
 * reschedule is a booking that already has a patient.
 */
export async function fetchRescheduleAvailabilityAction(params: {
  slug: string;
  serviceId: string;
  from: string;
  days: number;
}): Promise<{ ok: true; days: AvailabilityDay[] } | { ok: false; error: string }> {
  const result = await getPublicAvailability(params);
  if (!result.ok) return { ok: false, error: bookingErrorMessage(result.error) };
  return { ok: true, days: result.days };
}
