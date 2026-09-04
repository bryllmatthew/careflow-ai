import { z } from "zod";

export const followUpTypes = [
  "post_appointment",
  "no_show",
  "consultation",
  "treatment",
  "payment",
  "general",
] as const;
export type FollowUpType = (typeof followUpTypes)[number];
export const followUpTypeLabels: Record<FollowUpType, string> = {
  post_appointment: "Post-Appointment",
  no_show: "No Show",
  consultation: "Consultation Follow-Up",
  treatment: "Treatment Follow-Up",
  payment: "Payment Follow-Up",
  general: "General",
};

export const followUpStatuses = ["pending", "in_progress", "completed", "cancelled"] as const;
export type FollowUpStatus = (typeof followUpStatuses)[number];
export const followUpStatusLabels: Record<FollowUpStatus, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const followUpPriorities = ["low", "normal", "high", "urgent"] as const;
export type FollowUpPriority = (typeof followUpPriorities)[number];
export const followUpPriorityLabels: Record<FollowUpPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const followUpFormSchema = z.object({
  patientId: z.string().min(1, "Patient is required"),
  clinicId: z.string().min(1, "Clinic is required"),
  type: z.enum(followUpTypes),
  priority: z.enum(followUpPriorities),
  // <input type="date"> + <input type="time">, combined client-side into an
  // ISO string before reaching the action -- same pattern as
  // appointment.schema.ts's startAt.
  dueAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid due date and time"),
  assignedTo: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type FollowUpFormInput = z.infer<typeof followUpFormSchema>;
