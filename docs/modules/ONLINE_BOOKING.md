# Online Booking (Phase 10)

Private, per-clinic patient-facing booking pages at `/book/{slug}`, the clinic-side
configuration that drives them, and the attribution that connects a booking back to the
channel it came from.

The governing principle, and the reason the architecture looks the way it does:

> **One booking engine, many entry points.**

Phase 10 builds the first entry point (a clinic's own link). A future marketplace becomes
another one without a rewrite, because nothing below assumes a booking originated from a
direct clinic link — only that *something* resolved a clinic and asked for a slot.

---

## 1. Architecture at a glance

```
Patient (no account, no session)
        │
        ▼
/book/{slug}                     ← Next.js, dynamically rendered
        │  anon Supabase client (lib/booking/public-client.ts)
        ▼
public.get_public_booking_page(slug)          ─┐
public.get_public_booking_availability(...)    │  SECURITY DEFINER RPCs
public.create_public_booking(...)              │  migration 0020
public.get_public_booking / cancel / reschedule┘
        │
        ├── app.bookable_clinic(slug)        slug → clinic, or nothing
        ├── app.booking_slots(...)           the availability engine
        ├── app.consume_rate_limit(...)      abuse protection
        └── public.run_appointment_automation(...)   ← the SAME Phase 4 engine
                                                       staff actions use
        ▼
public.appointments  (booking_source = 'direct_booking')
public.patients      (found, or created, scoped to the clinic)
public.reminders     (confirmation + 24h/2h, via Phase 4 rules)
public.audit_logs    (booking.public_created)
```

### Why SECURITY DEFINER RPCs rather than anon-facing RLS

Migration 0001 revoked every table privilege in `public` from `anon`, and Phase 10 kept it
that way. An anonymous visitor cannot read one row of one table; they can call exactly the
functions granted in migration 0020. Two reasons this shape was chosen:

1. **RLS answers the wrong question.** A policy answers "which rows may this caller see?".
   The booking page needs "given a slug, project a curated view of one clinic" — a
   function, not a predicate. Doing it with policies would mean granting `anon` SELECT on
   `clinics`, `services`, `profiles` and `appointments` and then clawing it back, where one
   policy mistake is a cross-tenant leak.
2. **One transaction per request.** PostgREST gives one transaction per HTTP request
   (`CLAUDE.md` → Architecture rules). Creating a booking resolves a patient, inserts an
   appointment and fires automation — it *must* be a single RPC.

The security surface of the whole phase is therefore a short, readable list of function
grants rather than a matrix of policies. `supabase/tests/online_booking_test.sql` asserts
the negative half of it directly.

---

## 2. The public routes

| Route | What it is |
| --- | --- |
| `/book/{slug}` | The clinic's booking page. `?k={token}` selects a campaign link. |
| `/book/manage/{token}` | The patient's self-service page for one booking. |

`/book/manage/...` lives under `/book/`, not `/booking/`, because `/booking/` is the
clinic-side administration area — `/booking/{clinicId}` and `/booking/{token}` would be
ambiguous to the router and to anyone reading a URL. `manage` is therefore a **reserved
slug** (`lib/validation/booking.schema.ts`), along with a handful of other segments that
could plausibly become static routes under `/book/` later; a clinic holding one would have
a booking page that 404s, and taking a slug back after it has been printed on a poster is
not something this app can do.

### Clinic-side routes

| Route | Permission |
| --- | --- |
| `/booking` | `booking.view` |
| `/booking/{clinicId}` | `booking.view` to read, `booking.manage` to change |

---

## 3. Dynamic clinic branding

The clinic record is the single source of truth. `clinics.name` is the only name the public
page ever shows, and there is deliberately **no editable "booking page clinic name"** field
anywhere — a second name would immediately raise the question of which one is real.

| What | Where it lives |
| --- | --- |
| Name | `clinics.name` (read-only on the branding screen) |
| Logo | `clinics.logo_url` → the `clinic-branding` storage bucket |
| Slug | `clinics.slug` |
| Address / phone / email | `clinics.*`, published only when the matching `show_*` flag is on |
| Opening hours | `clinics.operating_hours` |

Renaming a clinic changes the booking page's heading, `<title>`, Open Graph title and
initials fallback on the next request. The page is dynamically rendered specifically so
this is unconditionally true — `CLAUDE.md`'s caching latitude was declined here because
branding and availability arrive in one payload and availability is time-sensitive anyway.

**Verified live**, not by inspection: renaming `Davao Branch` → `Smile Dental & Aesthetic
Center` changed the title, the heading and the fallback initials (`DB` → `SD`) with no
booking-page edit.

### Logo storage

Bucket `clinic-branding`, **public read**, path `{organization_id}/{clinic_id}/{random}.{ext}`.

- Public because the asset's entire purpose is to be rendered by anonymous visitors on a URL
  handed out on Facebook, in an SMS and on a printed QR code. A signed URL would expire
  mid-session, break social-card previews, and protect nothing that is deliberately
  published. What is constrained is **writing**, via `storage.objects` policies keyed on
  `app.storage_clinic_id(name)` and gated by `clinic.update`.
- The object name is random, not `logo.png`: a stable name would be served stale by the
  storage CDN after a replacement, defeating the point of the feature.
- Replacement uploads the new object first and deletes the old one only after the
  `clinics.logo_url` update succeeds, so a failed upload never leaves a clinic with no logo.

**SVG is not accepted.** An SVG is an executable document that can carry `<script>`, and
these files are embedded on a public page. Accepting it safely needs a sanitizer this
project does not have; restricting to PNG/JPEG/WEBP is the option the brief itself offers
and the one that does not depend on getting sanitization right.

**MIME type is sniffed, never trusted.** `file.type` is whatever the client says. The
bucket's `allowed_mime_types` checks that same untrusted header, so the real check is
magic-byte inspection in `uploadClinicLogoAction`.

### Fallback

No logo renders up-to-two initials from the clinic name on a tinted chip — a designed
fallback, never a broken image, and the same component the clinic sees while configuring,
so they know exactly what patients see before uploading anything.

---

## 4. The availability engine

**Phases 1–9 never built one.** Appointments were booked at an arbitrary instant with the
`appointments_no_staff_overlap` EXCLUDE constraint (migration 0013) as the only arbiter.
That is fine for a receptionist looking at a calendar and unworkable for a patient who
cannot. So Phase 10 adds slot generation — `app.booking_slots()` — built **on** the
existing primitives rather than beside them:

| Input | Source |
| --- | --- |
| The day's windows | `clinics.operating_hours` |
| Appointment length | `services.duration_minutes` |
| Existing bookings | `appointments`, with the same status exclusions the EXCLUDE constraint uses |
| Grid, notice, horizon | `clinic_booking_settings` |
| Timezone | `clinics.timezone` |

Two properties worth stating explicitly:

- **The EXCLUDE constraint remains the final arbiter.** A slot this function offers can
  still lose a race and be refused with `slot_taken`. That is the correct division of
  labour: slot generation makes conflicts *rare*, the constraint makes them *impossible*.
- **The existing-appointment check is deliberately not tenant-filtered**, exactly matching
  the EXCLUDE constraint: a practitioner is one person and cannot be in two places at once,
  even across clinics or organizations. Cross-tenant rows are read but never returned — the
  output is a list of times, never appointment data.

A second window on the same day *is* the lunch break (09:00–12:00, 13:00–17:00); there is no
separate "breaks" concept, because a gap between two windows already is one.

### The picker

`components/booking/slot-picker.tsx` renders a month calendar (dates with availability are
selectable, everything else is dimmed) and then a dropdown of that date's times — the
date-then-time shape patients already know from consumer booking tools. It fetches **one
month at a time**, clipped to `[today, today + max_advance_days]`, so a month entirely
outside the booking horizon costs no request.

It is shared by the booking flow and the reschedule page rather than written twice: a patient
rescheduling meets exactly the control they booked with. All of its date arithmetic runs on
UTC-noon anchors and `YYYY-MM-DD` strings, never local `Date` construction, and "today" is
resolved in the clinic's timezone — a patient in another country must not see the month
shifted by one.

`clinics.operating_hours` has existed since migration 0001 with nothing ever writing to it,
because no feature read it. The booking settings screen is its first editor, and it writes
the real column — not a booking-specific copy — so any future scheduling feature inherits
the data.

### Timezone

Slot generation happens in the clinic's zone in Postgres (`AT TIME ZONE`), and the browser
computes its calendar window in the clinic's zone too (`Intl.DateTimeFormat` with the
clinic's `timeZone`), so a patient booking from another country does not shift the calendar
by a day. This is the one place the app does *not* follow `CLAUDE.md`'s note that booking
treats the browser's zone as the clinic's — that shortcut is defensible for a receptionist
standing in the clinic and indefensible for a public page.

---

## 5. Making a booking

`public.create_public_booking()` runs this order, and the order is the security model:

1. **slug → clinic** — never a client-supplied clinic id.
2. **rate limit** — 5 bookings per 10 minutes per client key.
3. **idempotency replay** — same key returns the *same* booking, never a second one.
4. **input validation** — name required; phone **or** email required.
5. **service validation** — must belong to this clinic, be active, and be published.
6. **practitioner validation** — must be in this clinic's published, still-active list.
7. **availability recheck** — the submitted instant must match a freshly generated slot.
8. **patient resolution** — matched *within the clinic*, or created.
9. **appointment insert** — EXCLUDE constraint is the final arbiter.
10. **automation** — the shared Phase 4 engine.
11. **audit** — `booking.public_created`, with `user_id` NULL.

Step 7 is not defensive duplication. The browser's slot list is a snapshot that can be
minutes old, and a client that skipped the UI never had one. Nothing the client says about
*when* a service runs, how long it takes, or who may perform it is trusted — only the start
instant is taken as input, and it must match a slot the server generates.

### Patient matching

Matching is scoped to the clinic, by normalized phone or lowercased email, excluding
archived patients. The clinic predicate is not optional: phone numbers are shared between
family members and reused between people over time, so a wider match would merge strangers'
medical records. `app.normalize_phone` is digits-only rather than a full E.164 parser —
matching `0917 555 1234` against `09175551234` is the real-world case, and handling it needs
no library and no country-code assumption.

### Confirmation mode

`manual` (default) lands the appointment as `pending` for the clinic to confirm; `auto`
lands it `confirmed` and tells the patient so. Both are ordinary appointments in the
calendar from the moment they are created.

### Idempotency

The client generates one key per mounted form. A double-click, a retried request or a
browser back-button resubmit resolves to the original booking. The replay response
deliberately **does not** re-issue the manage token — the token was issued once, to the
original response, and only its SHA-256 is stored.

---

## 6. Patient self-service

Cancel and reschedule are addressed by an unguessable token, never by appointment id:
`/appointment/123` does not exist as a public surface. The token is compared as a SHA-256
hash, so the lookup path never holds anything reversible.

Eligibility (`canCancel` / `canReschedule`) is computed **in the database on every call** —
the clinic's toggles, the cutoff window, and the appointment still being live — and never
carried over from what the page rendered. A reschedule keeps the same practitioner: it moves
an appointment, it does not reassign it to whoever happens to be free.

When neither action is available the page says why rather than silently omitting the
buttons, which otherwise reads as broken.

---

## 7. Booking links and attribution

A booking link is a **tracked variant** of the clinic's own page, never a separate page. It
can pre-select a service or practitioner and carries `utm_source` / `utm_medium` /
`utm_campaign` onto every appointment booked through it.

The token is a **public identifier, not a secret** — it grants nothing the bare slug does
not. Its length exists to stop casual enumeration of a clinic's campaign links, not to
protect data. Deactivating a link therefore closes a marketing channel; it does not close
the clinic's booking page, and the link's copy/QR actions stay available so a printed poster
can be reactivated rather than reprinted.

Attribution lands as three columns on the appointment. There is no `booking_attributions`
table: a 1:1 side table for three nullable strings is the "do not duplicate existing
entities" rule read backwards.

QR codes are rendered with `uqr` (zero dependencies) as inline SVG, so they stay crisp on a
printed poster and need no client-side rendering. **A QR encodes only the public booking
URL** — no patient information, no identifiers.

---

## 8. Automation: one engine, moved to SQL

Phase 4 implemented the appointment automation rule loop in `lib/automation/dispatch.ts`,
which works only for a signed-in caller holding INSERT rights on `reminders` / `follow_ups`.
A public booking has no caller at all.

Rather than write a second copy of the rule loop for the anonymous path — which is exactly
the "parallel implementation" this phase exists to avoid — **the loop moved into
`public.run_appointment_automation()`** (SECURITY DEFINER), and `dispatchAppointmentEvent`
is now a thin wrapper over it. One engine, two entry points. Semantics were ported exactly,
including the "a 24h reminder for an appointment already sooner than 24h away is skipped,
not fired late" rule and the ON CONFLICT idempotency. The full Phase 4 test suite passes
unchanged.

The invoice-side dispatcher stayed in TypeScript: no anonymous invoice path exists to force
the same move, and moving it anyway would be churn.

Public bookings therefore get the confirmation message and the 24h/2h reminders through the
existing Phase 4 machinery, delivered by the existing `app/api/cron/process-reminders` job.

> **Reminder timing caveat.** `CLAUDE.md` already records that `vercel.json`'s crons run
> once daily on the Vercel Hobby plan, so a reminder's actual send can lag its
> `scheduled_for` by up to ~24h. That applies to public bookings exactly as it does to
> staff-created ones.

---

## 8a. Telling the clinic

A booking that arrives while nobody is watching the calendar is the core risk of putting a
booking page on the internet — the clinic finds out when the patient turns up. Three things
close that loop, all through machinery that already existed:

| Surface | What it shows |
| --- | --- |
| Notification bell | One notification per staff member holding `appointments.view` for that clinic, for **booked / cancelled / rescheduled** |
| Appointments nav badge | Count of online bookings still awaiting confirmation |
| Appointment detail sheet | An `Online` chip and the `CF-XXXXXX` reference, shown only for patient-made bookings |

Recipients come from `app.clinic_notify_targets(clinic, permission)` — the inverse of
`app.permitted_clinics()`, which answers "which clinics may the current user touch" and is
useless here because there is no current user. It applies the same membership-status rule, so a
suspended member stops being notified at the exact moment they stop being able to open the
appointment.

`public.create_notification()` could not be reused: it requires `auth.uid()` and refuses an
unauthenticated caller, which is precisely this caller. `app.notify_booking()` writes the same
rows into the same table and is reachable only from inside the booking RPCs.

The notice line renders in the **clinic's** timezone — "Ana Reyes · Dental Cleaning · Wed 09
Sep, 1:00 PM". A notification that said 5:00 AM for a 1:00 PM appointment would be worse than
none. The patient's name is included because every recipient already holds `appointments.view`
for that clinic; withholding it would make the alert useless rather than safer.

The badge counts **pending direct bookings**, not unread notifications, so it measures work
still to do and clears when the clinic actually confirms. A clinic on `auto` confirmation mode
never sees a badge, which is correct — nothing is waiting on them.

Bookings are ordinary appointments, so they appear in `/appointments`, `/calendar`, the patient
timeline and every report with no filtering change anywhere.

---

## 9. Multi-tenant isolation

Every public function derives the organization and clinic from the slug or from the
appointment row. **No public function accepts an `organization_id` or `clinic_id`.**

Proven, not asserted (`supabase/tests/online_booking_test.sql`, 38 assertions):

| Attempt | Result |
| --- | --- |
| `anon` reads `clinics` / `appointments` / `patients` / `services` / `booking_links` | `42501` |
| `anon` calls `app.booking_slots` or `run_appointment_automation` | `42501` |
| Org B's service id via Org A's slug | `service_unavailable`, no availability |
| Org B's practitioner id via Org A's slug | `practitioner_unavailable` |
| An unpublished internal service | `service_unavailable` |
| A clinic with booking switched off | `unavailable` |
| A start time the server never generated | `slot_unavailable` |
| A slot already taken | `slot_unavailable` / `slot_taken` |

"Unknown slug" and "booking disabled" are one indistinguishable state — telling them apart
would confirm which clinic slugs exist in CareFlow.

---

## 10. Abuse protection

`booking_rate_limits` is a fixed-window counter in Postgres, because this app has no Redis
and runs on serverless functions with no shared memory — the database is the only place a
counter can actually be shared between two concurrent requests. The
`INSERT ... ON CONFLICT DO UPDATE` is atomic, so the count cannot be lost the way a
read-then-write would lose it.

| Bucket | Budget |
| --- | --- |
| availability | 120 / minute |
| booking | 5 / 10 minutes |
| manage (cancel/reschedule) | 20 / 10 minutes |

The client key is a **SHA-256 of the forwarded IP**, never the IP itself: the counter table
would otherwise become an undeclared log of every visitor's address, which is personal data
under the Philippine Data Privacy Act (`CLAUDE.md`'s "Known open questions" flags the
compliance regime as unresolved — a reason to collect less, not a licence to collect
freely). With no forwarded address the limiter **fails open** rather than throttling every
visitor into one shared bucket; it is a throttle, not an authorization check, and the
EXCLUDE constraint plus the idempotency key remain the real guarantees.

No CAPTCHA. Adding one means a third-party script on a page whose whole job is to convert a
patient in as few taps as possible, and it is not obviously the right trade before any abuse
has been observed. The rate limiter, idempotency and the availability recheck are the
protections that cost the patient nothing.

---

## 11. Reporting and AI

Online-booking metrics come from `getOnlineBookingMetrics()`, which reads the same
`appointments` table every other report reads, filtered on `booking_source`. No separate
analytics store, no event pipeline. It surfaces in two places:

- **Business Reports → Online Booking** — volume, share, and breakdowns by service,
  practitioner, source and campaign.
- **`get_online_booking_summary`** — one read-only AI tool, a thin wrapper over that *same*
  function so the assistant can never disagree with the dashboard. Gated on `reports.view`,
  matching every other aggregate tool.

There is deliberately **no booking action tool**: the brief rules out autonomous AI booking,
and a public booking carries patient-supplied contact details the assistant has no business
inventing.

---

## 12. Permissions

Two new keys, not the seven the brief suggested — following the precedent `CLAUDE.md`
already records for Phase 7's inventory permissions:

| Permission | Granted to |
| --- | --- |
| `booking.view` | owner, admin, clinic_manager, receptionist |
| `booking.manage` | owner, admin, clinic_manager |

Branding reuses the existing **`clinic.update`**: a logo is a clinic detail, and the people
who may rename a clinic are the people who may set its logo. Splitting
`booking.settings.manage` / `booking.links.manage` / `clinic.branding.manage` apart would
mean re-reviewing every role's grants for distinctions no screen in this app makes.

---

## 13. Deferred, with reasons

- **Deposits and online payment at booking.** The `PaymentProvider` is `not-configured` and
  no gateway exists, so a "require deposit" toggle could not be honored. A money-handling
  setting that silently does nothing is worse than its absence — a clinic would believe it
  was collecting deposits it never received. The booking RPCs leave the seam open; wire it
  when a real provider lands in Phase 6.
- **Practitioner ↔ service eligibility.** Nothing in Phases 1–9 models it (there is still no
  staff table, and `services` has no practitioner-requirement column), so public
  practitioner visibility is clinic-scoped only. Inventing an eligibility matrix here would
  add a new, unpopulated, unmaintained concept.
- **Rooms and resources in availability.** `rooms` still does not exist (migration 0013
  records why). Availability considers practitioner and clinic hours only.
- **Booking-page theming beyond a colour and a welcome message.** The schema has
  `primary_color` and `welcome_message`; a full white-label theme builder is explicitly out
  of scope.
- **The marketplace.** `booking_source` carries `'marketplace'` in its CHECK from day one so
  the future entry point needs no schema change, and nothing in the engine assumes a booking
  came from a direct clinic link. Nothing marketplace-related is implemented.

---

## 14. Files

| Area | Path |
| --- | --- |
| Schema | `supabase/migrations/20260909090000_online_booking_core.sql` |
| Public service layer | `supabase/migrations/20260909091000_online_booking_rpcs.sql` |
| Storage | `supabase/migrations/20260909092000_clinic_branding_storage.sql` |
| Tests | `supabase/tests/online_booking_test.sql` |
| Public page | `app/book/[slug]/` |
| Patient self-service | `app/book/manage/[token]/` |
| Clinic administration | `app/(app)/booking/` |
| Anon client, URLs, QR | `lib/booking/` |
| Validation | `lib/validation/booking.schema.ts` |
| AI tool | `lib/ai/tools/read-booking.ts` |
| Shared branding UI | `components/booking/clinic-brand.tsx` |
| Shared date/time picker | `components/booking/slot-picker.tsx` |
