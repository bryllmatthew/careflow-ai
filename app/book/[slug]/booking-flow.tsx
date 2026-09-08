"use client";

import { useState, useTransition, useMemo, useId } from "react";
import { ChevronLeft, Check, Loader2, CalendarDays, Clock, User, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PublicBookingPage } from "@/lib/booking/public-queries";
import { publicBookingSchema } from "@/lib/validation/booking.schema";
import { manageBookingUrl } from "@/lib/booking/links";
import { SlotPicker } from "@/components/booking/slot-picker";
import { submitPublicBookingAction, fetchAvailabilityAction } from "./actions";

const ANY_PRACTITIONER = "any";

type Step = "service" | "practitioner" | "time" | "details" | "done";

type Confirmation = {
  reference: string;
  manageToken: string;
  startAt: string;
  serviceName: string;
  practitionerName: string;
};

/**
 * The patient-facing booking wizard.
 *
 * Two rules shape this component:
 *
 *   1. It never computes availability. Every bookable time comes from
 *      fetchAvailabilityAction, which reaches the database's own slot
 *      generator. The browser knows the clinic's opening hours only well
 *      enough to render a footer -- it cannot and does not derive a slot from
 *      them (brief section 15).
 *   2. It never decides anything the server will re-decide. The submitted
 *      start time is re-validated against freshly generated slots inside
 *      create_public_booking, so a stale tab or a hand-crafted request is
 *      refused rather than trusted.
 */
export function BookingFlow({
  slug,
  page,
  linkToken,
}: {
  slug: string;
  page: PublicBookingPage;
  linkToken?: string;
}) {
  const formId = useId();

  // A booking link may pre-select a service/practitioner (brief section 23).
  // Both are validated against the published lists before being honoured, so a
  // stale link pointing at a since-unpublished service falls back to the
  // normal first step rather than starting the patient on a dead branch.
  const presetService = page.services.find((s) => s.id === page.link?.defaultServiceId)?.id;
  const presetPractitioner = page.practitioners.find(
    (p) => p.id === page.link?.defaultPractitionerId,
  )?.id;

  const [step, setStep] = useState<Step>(presetService ? "practitioner" : "service");
  const [serviceId, setServiceId] = useState<string | undefined>(presetService);
  const [staffId, setStaffId] = useState<string>(
    presetPractitioner ?? (page.settings.allowAnyPractitioner ? ANY_PRACTITIONER : ""),
  );
  const [slotStart, setSlotStart] = useState<string>();
  const [confirmation, setConfirmation] = useState<Confirmation>();

  const service = page.services.find((s) => s.id === serviceId);
  const practitioner = page.practitioners.find((p) => p.id === staffId);

  const tz = page.clinic.timezone;
  const fmtTime = useMemo(
    () => new Intl.DateTimeFormat(undefined, { timeStyle: "short", timeZone: tz }),
    [tz],
  );
  const fmtDayLong = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: tz,
      }),
    [tz],
  );

  if (step === "done" && confirmation) {
    return (
      <BookingConfirmed
        page={page}
        confirmation={confirmation}
        fmtTime={fmtTime}
        fmtDayLong={fmtDayLong}
      />
    );
  }

  const steps: { key: Step; label: string }[] = [
    { key: "service", label: "Service" },
    { key: "practitioner", label: "Practitioner" },
    { key: "time", label: "Time" },
    { key: "details", label: "Your details" },
  ];
  const currentIndex = steps.findIndex((s) => s.key === step);

  function back() {
    if (step === "details") setStep("time");
    else if (step === "time") setStep("practitioner");
    else if (step === "practitioner") setStep("service");
  }

  return (
    <div className="bg-card ring-foreground/[0.06] shadow-liquid rounded-2xl ring-1">
      {/* Progress. aria-current marks the active step for screen readers;
          the visual treatment alone would not. */}
      <div className="flex items-center gap-1 border-b px-4 py-3 sm:px-6">
        {currentIndex > 0 && (
          <Button variant="ghost" size="icon-sm" onClick={back} aria-label="Go back">
            <ChevronLeft className="size-4" />
          </Button>
        )}
        <ol
          className="flex flex-1 items-center gap-1.5 overflow-x-auto text-xs"
          aria-label="Booking steps"
        >
          {steps.map((s, i) => (
            <li
              key={s.key}
              aria-current={s.key === step ? "step" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1",
                i === currentIndex && "bg-tint-primary text-tint-primary-foreground font-medium",
                i < currentIndex && "text-muted-foreground",
                i > currentIndex && "text-muted-foreground/60",
              )}
            >
              {i < currentIndex ? <Check className="size-3" aria-hidden /> : <span>{i + 1}</span>}
              {s.label}
            </li>
          ))}
        </ol>
      </div>

      <div className="p-4 sm:p-6">
        {step === "service" && (
          <ServiceStep
            services={page.services}
            onSelect={(id) => {
              setServiceId(id);
              setSlotStart(undefined);
              setStep("practitioner");
            }}
          />
        )}

        {step === "practitioner" && (
          <PractitionerStep
            practitioners={page.practitioners}
            allowAny={page.settings.allowAnyPractitioner}
            value={staffId}
            onSelect={(id) => {
              setStaffId(id);
              setSlotStart(undefined);
              setStep("time");
            }}
          />
        )}

        {step === "time" && service && (
          <TimeStep
            slug={slug}
            serviceId={service.id}
            staffId={staffId === ANY_PRACTITIONER ? undefined : staffId}
            timezone={tz}
            maxAdvanceDays={page.settings.maxAdvanceDays}
            onSelect={(iso) => {
              setSlotStart(iso);
              setStep("details");
            }}
          />
        )}

        {step === "details" && service && slotStart && (
          <DetailsStep
            formId={formId}
            slug={slug}
            serviceId={service.id}
            staffId={staffId === ANY_PRACTITIONER ? undefined : staffId}
            startAt={slotStart}
            linkToken={linkToken}
            summary={{
              service: service.name,
              practitioner: practitioner?.name ?? "Any available practitioner",
              when: `${fmtDayLong.format(new Date(slotStart))} at ${fmtTime.format(new Date(slotStart))}`,
            }}
            onBooked={(result) =>
              setConfirmation({
                ...result,
                serviceName: service.name,
                practitionerName: practitioner?.name ?? "Any available practitioner",
              })
            }
            onSlotLost={() => {
              setSlotStart(undefined);
              setStep("time");
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ServiceStep({
  services,
  onSelect,
}: {
  services: PublicBookingPage["services"];
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-4 font-medium">Choose a service</legend>
      <div className="grid gap-2">
        {services.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-start justify-between gap-4 rounded-xl border p-4 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none"
          >
            <span className="min-w-0">
              <span className="block font-medium">{s.name}</span>
              {s.description && (
                <span className="text-muted-foreground mt-0.5 block text-sm">{s.description}</span>
              )}
              <span className="text-muted-foreground mt-1.5 flex items-center gap-1 text-xs">
                <Clock className="size-3" aria-hidden />
                {s.durationMinutes} min
              </span>
            </span>
            <Price amount={s.price} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Money is a string end to end (CLAUDE.md) -- parsed only here, at the render
 * boundary, and never carried as a number.
 */
function Price({ amount }: { amount: string }) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return null;
  return (
    <Badge variant="secondary" className="shrink-0 tabular-nums">
      {new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "PHP",
        maximumFractionDigits: 0,
      }).format(value)}
    </Badge>
  );
}

function PractitionerStep({
  practitioners,
  allowAny,
  value,
  onSelect,
}: {
  practitioners: PublicBookingPage["practitioners"];
  allowAny: boolean;
  value: string;
  onSelect: (id: string) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-4 font-medium">Choose a practitioner</legend>
      <div className="grid gap-2">
        {allowAny && (
          <button
            type="button"
            onClick={() => onSelect(ANY_PRACTITIONER)}
            aria-pressed={value === ANY_PRACTITIONER}
            className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none"
          >
            <span className="bg-tint-primary text-tint-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
              <User className="size-4" aria-hidden />
            </span>
            <span>
              <span className="block font-medium">Any available practitioner</span>
              <span className="text-muted-foreground block text-sm">
                Usually the earliest appointment
              </span>
            </span>
          </button>
        )}
        {practitioners.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p.id)}
            aria-pressed={value === p.id}
            className="hover:bg-muted focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none"
          >
            <span className="bg-tint-info text-tint-info-foreground flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium">
              {p.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block font-medium">{p.name}</span>
              {p.title && <span className="text-muted-foreground block text-sm">{p.title}</span>}
              {p.bio && <span className="text-muted-foreground mt-1 block text-xs">{p.bio}</span>}
            </span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Date, then time — the shape patients already know from every booking tool
 * they have used. The month calendar and the time dropdown live in
 * components/booking/slot-picker.tsx, shared with the reschedule page so both
 * surfaces behave identically.
 *
 * This step still computes nothing: SlotPicker asks the server for a month of
 * availability and renders exactly what comes back.
 */
function TimeStep({
  slug,
  serviceId,
  staffId,
  timezone,
  maxAdvanceDays,
  onSelect,
}: {
  slug: string;
  serviceId: string;
  staffId?: string;
  timezone: string;
  maxAdvanceDays: number;
  onSelect: (iso: string) => void;
}) {
  return (
    <div>
      <h2 className="mb-4 font-medium">Choose a date and time</h2>
      <SlotPicker
        timezone={timezone}
        maxAdvanceDays={maxAdvanceDays}
        scopeKey={`${slug}|${serviceId}|${staffId ?? "any"}`}
        fetchDays={(from, days) =>
          fetchAvailabilityAction({ slug, serviceId, staffId, from, days })
        }
        onConfirm={onSelect}
      />
    </div>
  );
}

function DetailsStep({
  formId,
  slug,
  serviceId,
  staffId,
  startAt,
  linkToken,
  summary,
  onBooked,
  onSlotLost,
}: {
  formId: string;
  slug: string;
  serviceId: string;
  staffId?: string;
  startAt: string;
  linkToken?: string;
  summary: { service: string; practitioner: string; when: string };
  onBooked: (r: { reference: string; manageToken: string; startAt: string }) => void;
  onSlotLost: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  // One key per mounted form, so a double-click or a retried request resolves
  // to the SAME appointment rather than two (brief section 16). Regenerating
  // it per submit would defeat the purpose.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  function onSubmit(formData: FormData) {
    setError(undefined);
    const raw = {
      serviceId,
      staffId,
      startAt,
      firstName: String(formData.get("firstName") ?? ""),
      lastName: String(formData.get("lastName") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: String(formData.get("email") ?? ""),
      dateOfBirth: String(formData.get("dateOfBirth") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      linkToken,
      idempotencyKey,
    };

    const parsed = publicBookingSchema.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }

    startTransition(async () => {
      const result = await submitPublicBookingAction(slug, parsed.data);
      if (!result.ok) {
        setError(result.error);
        // Losing the slot is not a form error -- the form is fine and the time
        // is gone. Send them back to pick another rather than leaving them
        // staring at a submit button that will never work.
        if (/no longer available|just booked/i.test(result.error)) {
          setTimeout(onSlotLost, 1600);
        }
        return;
      }
      onBooked(result);
    });
  }

  return (
    <form id={formId} action={onSubmit} className="space-y-5">
      <div className="bg-muted/60 space-y-1 rounded-xl p-4 text-sm">
        <p className="font-medium">{summary.service}</p>
        <p className="text-muted-foreground">{summary.practitioner}</p>
        <p className="text-muted-foreground">{summary.when}</p>
      </div>

      <fieldset className="space-y-4" disabled={pending}>
        <legend className="mb-2 font-medium">Your details</legend>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-first`}>First name</Label>
            <Input id={`${formId}-first`} name="firstName" required autoComplete="given-name" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-last`}>Last name</Label>
            <Input id={`${formId}-last`} name="lastName" required autoComplete="family-name" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-phone`}>Mobile number</Label>
            <Input
              id={`${formId}-phone`}
              name="phone"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${formId}-email`}>Email</Label>
            <Input id={`${formId}-email`} name="email" type="email" autoComplete="email" />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          Enter at least one of mobile number or email so the clinic can confirm your booking.
        </p>

        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-dob`}>
            Date of birth <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input id={`${formId}-dob`} name="dateOfBirth" type="date" autoComplete="bday" />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor={`${formId}-notes`}>
            Anything the clinic should know?{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea id={`${formId}-notes`} name="notes" rows={3} maxLength={500} />
        </div>
      </fieldset>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        {pending ? "Booking…" : "Confirm booking"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------

function BookingConfirmed({
  page,
  confirmation,
  fmtTime,
  fmtDayLong,
}: {
  page: PublicBookingPage;
  confirmation: Confirmation;
  fmtTime: Intl.DateTimeFormat;
  fmtDayLong: Intl.DateTimeFormat;
}) {
  const start = new Date(confirmation.startAt);
  const manageUrl = confirmation.manageToken ? manageBookingUrl(confirmation.manageToken) : null;
  const canManage = page.settings.allowCancellation || page.settings.allowRescheduling;

  return (
    <div className="bg-card ring-foreground/[0.06] shadow-liquid rounded-2xl p-6 text-center ring-1 sm:p-8">
      <div className="bg-tint-success text-tint-success-foreground mx-auto flex size-12 items-center justify-center rounded-full">
        <Check className="size-6" aria-hidden />
      </div>

      <h2 className="mt-4 text-xl font-semibold tracking-tight">Booking confirmed</h2>
      <p className="text-muted-foreground mt-1 text-sm">
        {page.settings.confirmationMode === "manual"
          ? "The clinic will confirm your appointment shortly."
          : "Your appointment is confirmed."}
      </p>

      <dl className="mt-6 space-y-3 text-left text-sm">
        <Row label="Service" value={confirmation.serviceName} />
        <Row label="Practitioner" value={confirmation.practitionerName} />
        <Row label="Date" value={fmtDayLong.format(start)} />
        <Row label="Time" value={fmtTime.format(start)} />
        <Row label="Reference" value={confirmation.reference} mono />
      </dl>

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        <AddToCalendarButton
          title={`${confirmation.serviceName} — ${page.clinic.name}`}
          start={start}
          location={page.clinic.address}
        />
        {page.clinic.phone ? (
          <Button variant="outline" asChild>
            <a href={`tel:${page.clinic.phone}`}>Contact clinic</a>
          </Button>
        ) : (
          <span />
        )}
      </div>

      {manageUrl && canManage && (
        <div className="bg-muted/60 mt-6 rounded-xl p-4 text-left">
          <p className="text-sm font-medium">Manage your booking</p>
          <p className="text-muted-foreground mt-1 text-xs">
            Save this link — it&apos;s the only way to change or cancel this appointment online.
          </p>
          <CopyLink url={manageUrl} />
        </div>
      )}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("text-right font-medium", mono && "font-mono tracking-wide")}>{value}</dd>
    </div>
  );
}

function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-center gap-2">
      <Input readOnly value={url} className="text-xs" onFocus={(e) => e.currentTarget.select()} />
      <Button
        variant="outline"
        size="icon"
        aria-label="Copy link"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}

/**
 * A downloadable .ics, built inline. No calendar dependency and no network
 * call -- an ICS VEVENT for a single appointment is a dozen lines of text, and
 * every calendar app on every platform accepts it.
 */
function AddToCalendarButton({
  title,
  start,
  location,
}: {
  title: string;
  start: Date;
  location?: string;
}) {
  function download() {
    const stamp = (d: Date) =>
      d
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//CareFlow//Booking//EN",
      "BEGIN:VEVENT",
      `UID:${crypto.randomUUID()}`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${title.replace(/([,;\\])/g, "\\$1")}`,
      location ? `LOCATION:${location.replace(/([,;\\])/g, "\\$1")}` : "",
      "END:VEVENT",
      "END:VCALENDAR",
    ]
      .filter(Boolean)
      .join("\r\n");

    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "appointment.ics";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={download}>
      <CalendarDays className="size-4" aria-hidden />
      Add to calendar
    </Button>
  );
}
