"use server";

import { listRemindersForAppointment, type ReminderRow } from "./queries";
import { listFollowUpsForAppointment, type FollowUpRow } from "../followups/queries";

/**
 * A thin read wrapper so the (client) appointment detail sheet can fetch
 * reminder/follow-up status on demand when it opens, rather than every list
 * row eagerly fetching automation data nobody will look at
 * (docs/PRODUCT_SPEC.md Phase 4 section 17). Access control is still RLS --
 * this returns only what the caller's own session can already see.
 */
export async function getAppointmentAutomationAction(
  appointmentId: string,
): Promise<{ reminders: ReminderRow[]; followUps: FollowUpRow[] }> {
  const [reminders, followUps] = await Promise.all([
    listRemindersForAppointment(appointmentId),
    listFollowUpsForAppointment(appointmentId),
  ]);
  return { reminders, followUps };
}
