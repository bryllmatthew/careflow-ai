import { z } from "zod";

/**
 * Shared between the clinic-side booking settings forms and the public
 * booking page (CLAUDE.md: "Zod schemas in lib/validation/, shared between
 * client and server. Parse at every boundary").
 *
 * Every numeric bound here mirrors a CHECK constraint in migration 0019 --
 * the database is the real enforcement point; these exist so a patient or a
 * clinic administrator gets a sentence instead of a Postgres error code.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Path segments under /book/ that the router owns.
 *
 * `manage` is a real static route (the patient's self-service page lives at
 * /book/manage/{token}), so a clinic holding that slug would have a booking
 * page that 404s -- Next.js prefers the static segment and does not fall back
 * to [slug]. The rest are reserved because they are the obvious next static
 * routes under /book/, and taking a slug back from a clinic that has already
 * printed it on a poster is not a thing this app can do.
 */
const RESERVED_SLUGS = new Set(["manage", "api", "book", "new", "admin", "static", "_next"]);

/** Lowercase kebab-case, 3-60 chars. Mirrors clinics_slug_format. */
export const bookingSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "The booking link needs at least 3 characters")
  .max(60, "The booking link can be at most 60 characters")
  .regex(
    /^[a-z0-9][a-z0-9-]*[a-z0-9]$/,
    "Use lowercase letters, numbers and hyphens only — and don't start or end with a hyphen",
  )
  .refine((v) => !RESERVED_SLUGS.has(v), "That booking link is reserved. Try a different one.");

/** Turns a clinic name into a usable default slug ("Smile Dental Clinic" -> "smile-dental-clinic"). */
export function slugifyClinicName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
}

// ---------------------------------------------------------------------------
// Clinic-side configuration
// ---------------------------------------------------------------------------

export const bookingSettingsSchema = z.object({
  onlineBookingEnabled: z.boolean(),
  minNoticeHours: z.coerce.number<number>().int().min(0).max(720),
  maxAdvanceDays: z.coerce.number<number>().int().min(1).max(365),
  slotIntervalMinutes: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
    z.literal(30),
    z.literal(60),
  ]),
  confirmationMode: z.enum(["auto", "manual"]),
  allowAnyPractitioner: z.boolean(),
  allowCancellation: z.boolean(),
  allowRescheduling: z.boolean(),
  manageCutoffHours: z.coerce.number<number>().int().min(0).max(720),
  showAddress: z.boolean(),
  showPhone: z.boolean(),
  showEmail: z.boolean(),
  showBusinessHours: z.boolean(),
  primaryColor: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/, "Use a hex colour like #4f46e5")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  welcomeMessage: optionalText(500),
});
export type BookingSettingsInput = z.infer<typeof bookingSettingsSchema>;

/**
 * clinics.operating_hours, the shape migration 0001 documented:
 * {"mon": [{"open": "09:00", "close": "17:00"}], ...}. A day with no entry
 * (or an empty array) is closed.
 *
 * Nothing populated this column before Phase 10 -- the clinic form never
 * offered it -- so the booking settings page is the first editor for it, and
 * this is the first place its shape is actually validated rather than
 * assumed. It stays on clinics rather than being copied into the booking
 * settings: the same hours govern the public page and every future
 * scheduling feature.
 */
const timeString = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 09:00");

export const operatingWindowSchema = z
  .object({ open: timeString, close: timeString })
  .refine((w) => w.close > w.open, {
    message: "The closing time must be after the opening time",
    path: ["close"],
  });

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export const operatingHoursSchema = z.object({
  mon: z.array(operatingWindowSchema).max(3).default([]),
  tue: z.array(operatingWindowSchema).max(3).default([]),
  wed: z.array(operatingWindowSchema).max(3).default([]),
  thu: z.array(operatingWindowSchema).max(3).default([]),
  fri: z.array(operatingWindowSchema).max(3).default([]),
  sat: z.array(operatingWindowSchema).max(3).default([]),
  sun: z.array(operatingWindowSchema).max(3).default([]),
});
export type OperatingHours = z.infer<typeof operatingHoursSchema>;

export const bookingLinkSchema = z.object({
  name: z.string().trim().min(1, "Give the link a name").max(120),
  defaultServiceId: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  defaultPractitionerId: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  utmSource: optionalText(100),
  utmMedium: optionalText(100),
  utmCampaign: optionalText(150),
});
export type BookingLinkInput = z.infer<typeof bookingLinkSchema>;

export const publicServiceSchema = z.object({
  serviceId: z.uuid(),
  onlineBookingEnabled: z.boolean(),
  publicName: optionalText(200),
  publicDescription: optionalText(1000),
});
export type PublicServiceInput = z.infer<typeof publicServiceSchema>;

export const publicPractitionerSchema = z.object({
  userId: z.uuid(),
  active: z.boolean(),
  displayName: optionalText(120),
  title: optionalText(120),
  bio: optionalText(1000),
});
export type PublicPractitionerInput = z.infer<typeof publicPractitionerSchema>;

// ---------------------------------------------------------------------------
// Patient-side booking
// ---------------------------------------------------------------------------

/**
 * Brief section 17: "collect the minimum information required... do not
 * collect unnecessary sensitive information." Date of birth is optional and
 * nothing clinical is asked for -- a public form is the wrong place for a
 * medical history, and the clinic collects one at the visit.
 *
 * Phone OR email, not both required: a patient booking from a phone has one
 * of them to hand, and demanding the other loses bookings. The clinic still
 * always has a way to reach them, which is the actual requirement.
 */
export const publicBookingSchema = z
  .object({
    serviceId: z.uuid("Choose a service"),
    staffId: z
      .uuid()
      .optional()
      .or(z.literal("").transform(() => undefined))
      .or(z.literal("any").transform(() => undefined)),
    startAt: z.iso.datetime({ offset: true }),
    firstName: z.string().trim().min(1, "Enter your first name").max(100),
    lastName: z.string().trim().min(1, "Enter your last name").max(100),
    phone: optionalText(50),
    email: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((v) => (v ? v : undefined))
      .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email address"),
    dateOfBirth: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the date picker")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    notes: optionalText(500),
    linkToken: optionalText(32),
    idempotencyKey: z.string().trim().min(8).max(100),
  })
  .refine((v) => Boolean(v.phone) || Boolean(v.email), {
    message: "Enter a phone number or an email address so the clinic can reach you",
    path: ["phone"],
  });
export type PublicBookingInput = z.infer<typeof publicBookingSchema>;

/**
 * The failure vocabulary the booking RPCs return. Mapped to sentences in one
 * place so the public UI never renders a raw code and never leaks an internal
 * Postgres message (brief section 41: "do not expose internal system
 * errors").
 */
export const BOOKING_ERROR_MESSAGES: Record<string, string> = {
  unavailable: "This clinic isn't accepting online bookings right now.",
  rate_limited: "Too many attempts. Please wait a moment and try again.",
  name_required: "Enter your first and last name.",
  contact_required: "Enter a phone number or an email address.",
  invalid_email: "Enter a valid email address.",
  service_unavailable: "That service isn't available for online booking.",
  practitioner_unavailable: "That practitioner isn't available for online booking.",
  practitioner_required: "Please choose a practitioner.",
  slot_unavailable: "That time is no longer available. Please pick another.",
  slot_taken: "Someone just booked that time. Please pick another.",
  not_found: "We couldn't find that booking.",
  not_allowed: "This clinic doesn't allow that online. Please contact the clinic.",
  not_cancellable: "This booking can no longer be cancelled online.",
  not_reschedulable: "This booking can no longer be rescheduled online.",
  too_late: "It's too close to your appointment to change it online. Please call the clinic.",
};

export function bookingErrorMessage(code: string | null | undefined): string {
  if (!code) return "Something went wrong. Please try again.";
  return BOOKING_ERROR_MESSAGES[code] ?? "Something went wrong. Please try again.";
}
