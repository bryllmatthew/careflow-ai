import { z } from "zod";

export const appointmentStatuses = [
  "pending",
  "confirmed",
  "checked_in",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
  "rescheduled",
] as const;
export type AppointmentStatus = (typeof appointmentStatuses)[number];

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
  rescheduled: "Rescheduled",
};

/**
 * The forward transitions a status can move to from the booking's current
 * state -- keeps the detail panel from offering, say, "Complete" on an
 * appointment that hasn't happened yet. Cancel is handled as its own action
 * (appointments.cancel, not appointments.update), so it is deliberately not
 * listed here even where it would otherwise make sense.
 */
export const nextStatuses: Record<AppointmentStatus, AppointmentStatus[]> = {
  pending: ["confirmed", "checked_in"],
  confirmed: ["checked_in"],
  checked_in: ["in_progress"],
  in_progress: ["completed", "no_show"],
  completed: [],
  cancelled: [],
  no_show: [],
  rescheduled: ["confirmed", "checked_in"],
};

export const appointmentFormSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  serviceId: z.string().min(1, "Service is required"),
  staffId: z.string().min(1, "Practitioner is required"),
  clinicId: z.string().min(1, "Clinic is required"),
  // Computed client-side from the form's date+time <input> pair via
  // `new Date(...).toISOString()`, which the browser resolves in the
  // viewer's local timezone -- see appointment-form-dialog.tsx for why that
  // stands in for the clinic's timezone at MVP scale (no date-fns-tz
  // dependency yet). Storage stays UTC either way (CLAUDE.md).
  startAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date and time"),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type AppointmentFormInput = z.infer<typeof appointmentFormSchema>;
