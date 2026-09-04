"use server";

import { getAuthContext } from "@/lib/auth/session";
import { UnauthenticatedError } from "@/lib/auth/errors";
import { searchPatientsForBooking } from "./queries";

/**
 * Thin Server Action wrapper so the client-side PatientPicker can call the
 * (server-only) search query. Read access is still governed by patients'
 * own RLS -- this returns only what the caller's session can already see.
 */
export async function searchPatientsForBookingAction(query: string) {
  const auth = await getAuthContext();
  const organizationId = auth?.memberships[0]?.organizationId;
  if (!organizationId) throw new UnauthenticatedError();
  return searchPatientsForBooking(organizationId, query);
}
