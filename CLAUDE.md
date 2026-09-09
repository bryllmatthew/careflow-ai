# CareFlow AI — Engineering Instructions

Multi-tenant, AI-assisted practice-management SaaS for dental, medical, therapy, aesthetic and wellness clinics.

@AGENTS.md

## Product & specification source of truth

The product specs live in `docs/`. Read the relevant one before implementing a feature:

| Doc                       | Covers                                                                  |
| ------------------------- | ----------------------------------------------------------------------- |
| `docs/CLAUDE.md`          | Product overview, core principles, roles, AI principles, dev philosophy |
| `docs/PRODUCT_SPEC.md`    | Feature-level requirements, 16 modules                                  |
| `docs/ARCHITECTURE.md`    | Stack intent, entities, events, automation, security posture            |
| `docs/DATABASE_SCHEMA.md` | Table field inventory + 10 database rules                               |
| `docs/AUTHORIZATION.md`   | **Governing document for all access control**                           |
| `docs/UI_UX_SPEC.md`      | Navigation taxonomy, layout, page anatomies                             |
| `docs/MVP_ROADMAP.md`     | Phases and MVP definition                                               |
| `docs/AI_TOOLS.md`        | AI tool contracts and safety rules                                      |

The specs are a starting point, not gospel — they contain known contradictions and gaps. Where this
file or a migration deliberately deviates, the deviation is recorded in **Deliberate deviations** below.

## Non-negotiable security rules

These exist because the whole tenancy model rests on them. Violating any one is a cross-tenant breach.

1. **The `service_role` key never appears on a request path.** It is confined to `supabase/` migrations
   and `scripts/`. All request-path data access uses `@supabase/ssr` carrying the end user's JWT so RLS
   applies. An ESLint rule enforces this; do not suppress it.
2. **RLS is enabled on every table in `public`.** No exceptions. A table without RLS in an exposed
   schema is readable by any signed-in user. CI asserts this.
3. **Every view is created `with (security_invoker = on)`.** Without it a view runs with its owner's
   rights and bypasses RLS entirely, exposing every tenant. This is the most common Supabase leak.
4. **Never trust `organization_id`, `clinic_id`, role, or permission values from the client** — or from
   AI model output. Resolve them server-side from the session. Tenancy arguments are stripped from AI
   tool schemas and injected from context.
5. **Authorization helpers live in the private `app` schema**, are `STABLE SECURITY DEFINER`, pin
   `set search_path = pg_catalog, pg_temp`, and **never accept an actor parameter** — they derive the
   subject from `auth.uid()` internally. An actor parameter is a backdoor.
6. **No write policies on the authorization tables** (`user_roles`, `role_permissions`, `roles`,
   `organization_memberships`). All writes go through `SECURITY INVOKER` RPCs that enforce
   scope, owner-only-grants-owner, and the no-amplification rule.
7. **Frontend permission checks are UX only, never a security boundary** (`AUTHORIZATION.md` §19).

## Database conventions

- `id uuid primary key default gen_random_uuid()`.
- `created_at` / `updated_at timestamptz not null default now()`; `updated_at` maintained by the shared
  `set_updated_at()` trigger on every table.
- **Enums are `text` + `CHECK`**, not Postgres `ENUM` types — adding a value stays a one-line migration.
- All timestamps `timestamptz`. Appointment times are stored UTC and rendered in `clinics.timezone`.
- **Money is `numeric(14,2)`, read as a string, formatted with `Intl.NumberFormat`.** Never `float`,
  never `money`, never a JS `number` in transit.
- `organization_id` on every org-owned table; `clinic_id` **`NOT NULL`** on clinic-scoped tables.
- **Composite FKs** on `(clinic_id, organization_id)` → `clinics (id, organization_id)` for every
  clinic-scoped table. This makes cross-tenant references structurally impossible.
- `revoke update (organization_id, clinic_id)` from `authenticated` on every business table — RLS
  cannot express column immutability.
- Soft delete via `deleted_at`, and **`deleted_at` stays out of RLS `USING` clauses** (it breaks
  upserts, restore, and leaks an existence oracle through unique-constraint errors). Filter it in
  `*_active` views and the query layer instead, and make unique indexes partial on
  `where deleted_at is null`.
- **Financial records are voided or cancelled, never soft-deleted** (`AUTHORIZATION.md` §12).
  `payments` is an append-only ledger; refunds are new rows with `kind = 'refund'`.
- Derived financial values (invoice totals, stock levels) are computed **only** in the database by
  `SECURITY DEFINER` rollup triggers. The app never computes a total it then writes.

## Architecture rules

- **PostgREST gives one transaction per HTTP request.** You cannot `BEGIN` across two `supabase-js`
  calls, so every multi-row or financial operation **must** be a Postgres RPC. This is a hard
  constraint, not a preference.
- Server Components for reads; Server Actions for mutations, wrapped in `authedAction()`
  (authenticate → `requirePermission` → Zod parse → execute → audit).
- Route Handlers only for AI streaming, webhooks, and cron.
- `middleware.ts` refreshes the session and does **nothing else** — it is never an authorization check.
- Providers sit behind interfaces (`PaymentProvider`, `MessagingProvider`, `AIProvider`,
  `StorageProvider`) so no vendor is load-bearing.

## Code conventions

- TypeScript `strict` + `noUncheckedIndexedAccess`. No `any`; use `unknown` and narrow.
- Zod schemas in `lib/validation/`, shared between client and server. Parse at every boundary.
- DB types are generated (`pnpm db:types`) into `lib/db/types.generated.ts` and committed. Never
  hand-edit.
- Server-only modules import `server-only`. Never leak a Supabase admin client into a client bundle.
- Prefer RSC and `searchParams` for list state over client state. No global store.
- Reuse the shared patterns in `components/patterns/` (`DataTable`, `PageHeader`, `StatTile`,
  `EmptyState`, `ErrorState`, `Money`, `DateTime`, `PermissionGate`) rather than re-rolling them.

## Working process

Per `docs/CLAUDE.md` §9 — before implementing: read the relevant spec, check the schema and
authorization requirements, then **implement the smallest complete version and test it** before
expanding. Build in small, testable modules; do not attempt whole phases at once.

**The authorization test suite is a merge gate.** Any migration touching a policy must pass the full
negative-security matrix (`pnpm test:rls`) before merge. Per `AUTHORIZATION.md` §695, these tests are
mandatory before the MVP can be called production-ready.

## Deliberate deviations from the specs

Recorded so the code and docs stop contradicting each other:

- **`profiles` replaces the spec's `users` table** — org-agnostic, 1:1 with `auth.users`. Organization
  relationships live in `organization_memberships`. Resolves the `DATABASE_SCHEMA.md` /
  `AUTHORIZATION.md` §15 contradiction. MVP UI assumes one active org (no org switcher).
- **`clinic_memberships` (§16) is dropped as redundant** — `user_roles` already carries both the grant
  and its scope; `clinic_id IS NULL` means org-wide. Two overlapping mechanisms would diverge.
- **`products` are org-level**, not clinic-level; `inventory` stays clinic-level. Otherwise the same
  SKU is duplicated per clinic.
- **`patients.clinic_id` is `NOT NULL`** (spec had nullable `primary_clinic_id`), with a
  `patient_clinics` join for records shared across branches.
- **Services shipped immediately before Scheduling** (spec had Phase 5), as a Phase 3 prerequisite
  rather than inside Phase 2. `appointments.service_id` supplies duration, price and practitioner
  requirements, so scheduling cannot ship without it. `docs/CLAUDE.md` §3 already ranks Services
  before Scheduling.
- **Manual payment recording stays in Phase 6**, matching the spec's original phase numbering after
  all — an earlier version of this note said Phase 5 would take it, but Phase 5's own brief was
  explicit that payment records are Phase 6's job. `invoices.amount_paid`/`balance` exist as real
  columns from Phase 5 (so Phase 6 extends this table rather than restructuring it), but nothing
  writes to `amount_paid` yet; no `payments` table exists.
- **No org/clinic-level tax configuration table.** `invoices.tax_rate` is a plain per-invoice
  percentage, defaulting to 0 — `docs/CLAUDE.md`'s "Known open questions" already flags the
  compliance/tax regime (PH VAT vs. HIPAA-adjacent assumptions) as unresolved; a config table would
  encode a policy nobody has specified yet.
- **No product line items on invoices, even though `products`/`inventory` now exist (Phase 7).**
  `invoice_items.service_id` is still the only structured source column. Phase 7's own prompt
  explicitly allows leaving this integration point clean rather than retrofitting unsupported retail
  sales-through-invoice behavior; see `docs/modules/INVENTORY.md` §"Sales integration."
- **No `rooms` or `staff_availability` table yet**, despite both being named in the original Phase 1
  plan's table inventory. Double-booking prevention (the hard safety requirement) is enforced by
  `appointments`' `EXCLUDE` constraint on `(staff_id, time_range)`, which does not depend on either —
  room assignment and declared working hours are real, separable features with no UI to populate them
  yet, deferred rather than faked. See `supabase/migrations/..._appointments_core.sql`'s header comment.
- **Appointment booking treats the browser's local timezone as the clinic's timezone.** The booking
  form's date/time `<input>`s are combined into a UTC instant via the browser's own `Date` resolution,
  not `clinics.timezone` — correct as long as the person booking is physically at (or near) the clinic,
  which covers the MVP's real usage pattern. A true per-clinic timezone conversion needs a
  date-fns-tz–class dependency, deferred until it's a decision worth its own care rather than a detail
  inside the booking form.
- **`permissions`, `role_permissions`, `staff_clinics`, `service_products`, `purchase_order_items`,
  `inventory_batches`, `reminder_templates`, `automation_rules`, `communications`, `tax_rates`,
  `domain_events`, `document_counters` and `ai_tool_calls` are added** — each is required by a spec
  elsewhere but defined nowhere.
- **Next.js 16** (plan said 15; 16 was stable by build time).
- **Phase 7's inventory permission set uses the coarse grain migration 0002 already seeded**
  (`inventory.view`/`inventory.manage`, `products.manage`, `suppliers.view`/`.manage`,
  `purchase_orders.view`/`.manage`, `reports.inventory`) rather than inventing the Phase 7 prompt's
  finer-grained suggestions (`inventory.adjust`/`.receive`/`.transfer`, `purchase_orders.submit`, etc).
  Those permissions were already granted to owner/admin/clinic_manager/inventory_manager and
  human-reviewed in migration 0002; splitting them further now would mean re-reviewing every role's
  grants for a distinction the UI doesn't otherwise need. See `docs/modules/INVENTORY.md`.
- **`products.category` is free text, not a `product_categories` table.** Organizations type whatever
  they want (with suggested values in the UI); nothing forces a curated list and there is no
  category CRUD to build or maintain. Section 5 explicitly permits this.
- **A product has one preferred supplier (`products.supplier_id`), not a many-to-many
  `product_suppliers` join** — matches `docs/DATABASE_SCHEMA.md`'s own product field list and section
  22's "do not over-engineer procurement."
- **`purchase_orders.status` collapses Draft/Submitted/Ordered into `draft` → `ordered` →
  `partially_received`/`received` (or `cancelled`).** There is no internal-approval workflow being
  built between "submitted" and "ordered," and section 23 itself says "do not add unnecessary
  procurement workflows."
- **Batch/lot tracking is receiving-only, not FEFO-allocated on consumption.** `inventory_batches`
  rows are created when track_expiration stock is received (manually or via PO) for traceability and
  expiration reporting, but `consume_inventory_for_appointment()` decrements only the aggregate
  `inventory.quantity_on_hand` — it does not pick a specific batch by earliest-expiration. Manual
  batch-specific write-offs remain possible via `adjust_inventory()`'s optional `p_batch_id`. Section
  14 explicitly rules out "a highly complex pharmaceutical inventory system."
- **No proactive "expiring soon"/"just expired" cron notification.** Expiration status is fully
  live-visible in every inventory list/detail view (section 15's actual requirement — "must remain
  clearly visible," never "must be pushed"), but there is no scheduled job pushing an
  `inventory.expired` notification the way `payment.succeeded` pushes one. Built in Phase 8 alongside
  the rest of the reporting work rather than before it — see `docs/modules/REPORTING.md`.
- **Phase 8 (dashboards/reporting) adds ZERO new tables, views, or RPCs.** Every KPI is computed by
  reading the existing transactional tables through the normal RLS-respecting client — aggregation
  security (section 37/38: "All Clinics" must never include an unauthorized clinic) is a property of
  the _existing_ per-table RLS `SELECT` policies, not a new mechanism, since Postgres filters rows out
  before any `SUM`/`COUNT` ever sees them. Proven directly by `supabase/tests/reporting_test.sql`
  rather than assumed. See `docs/modules/REPORTING.md`.
- **No `date-fns`/`date-fns-tz` dependency.** `lib/reporting/timezone.ts` is a small,
  zero-dependency `Intl.DateTimeFormat`-based module instead — the only two primitives a reporting
  date boundary needs (zoned-time→UTC, and the reverse) don't justify a new dependency, and this keeps
  every conversion auditable in ~60 lines. Verified directly against known-correct UTC conversions
  for `Asia/Manila` and a DST-observing zone (`America/New_York`), not just by inspection.
- **Clinic/service/practitioner performance tables are aggregated in application code, not a new SQL
  view or RPC.** PostgREST's standard query builder has no `GROUP BY`; at this MVP's row counts,
  fetching the (already RLS-filtered) rows for the selected range and reducing them in JS is correct
  and simple, matching section 40's "make it correct first, optimize measured bottlenecks" — not a
  premature-optimization shortcut.
- **No new report permissions.** `reports.view`, `reports.financial`, and `reports.inventory`
  (seeded in migration 0002, Phase 1) already gate exactly the three report surfaces Phase 8 builds.
  CSV export reuses the same permission as the report it exports, rather than a separate
  `reports.export` permission nobody asked a role to hold independently.
- **Weeks start Monday** (ISO 8601) for every "This Week"/"Last Week" date-range preset — not
  specified anywhere in the spec set; this is the one place that decision is recorded.
- **Date-range boundaries use the organization's timezone only** — `clinics.timezone` is not
  consulted for report/dashboard boundaries. A single organization operating across multiple
  timezones is not this platform's target usage (Davao/Cebu/Manila share one timezone), and using one
  canonical timezone avoids the reporting window shifting depending on which clinic filter is
  selected.
- **Service revenue is invoiced value, not collected revenue**, and **practitioner-attributed
  revenue only counts invoices explicitly linked to one of that practitioner's appointments**
  (`invoices.appointment_id`) — never a guessed split of unattributed revenue. Both are documented
  formulas in `docs/modules/REPORTING.md`, following section 15/16's explicit caution against
  fabricating an attribution the data model doesn't support.
- **CSV export only, no PDF.** No PDF-generation dependency exists anywhere in the project; section
  33 makes PDF conditional on "where the existing architecture makes it practical," which it doesn't.
- **`/patients` and `/invoices` list pages do not yet accept a drill-down date range** (`/appointments`
  was extended to, since it's the highest-value case — Workflow 4). Clicking through from a KPI still
  lands on the correct clinic/status-filtered subset; it just isn't clipped to the exact date window
  yet. See `docs/modules/REPORTING.md` "Deferred."
- **AI tool schemas never accept `organization_id`, even though `AI_TOOLS.md` §6 lists it as a
  possible `get_dashboard_summary` input.** Every tool resolves the organization from the session
  (`lib/ai/context.ts`), never from model or client input — the same rule (§4 above) applied to the
  one place the original spec set contradicted it. See `docs/modules/AI_ASSISTANT.md`.
- **AI conversations are private to the user who started them**, not shared across the organization
  the way business tables are. An operational assistant's chat transcript isn't team-shared data by
  default; nothing in the spec set says otherwise, and every other precedent (audit logs, notification
  read state) in this app is per-user where it plausibly could go either way.
- **AI action tools reuse the exact existing Server Action a human would call** (`createAppointmentAction`,
  `recordManualPaymentAction`, etc.) behind a propose → confirm → execute flow, rather than a new RPC
  or write path — `AI_TOOLS.md` §16 lists the action names but not an implementation strategy; §66 of
  the Phase 9 brief is explicit that the AI should be "a new interface to CareFlow, not a parallel
  implementation of CareFlow."
- **`send_reminder` (AI action tool) does not call a messaging provider directly.** No such
  user-triggerable send path exists anywhere in the app — patient-facing reminders are only ever sent
  by the service-role `app/api/cron/process-reminders` job on their `scheduled_for` time, and rule 1
  above forbids adding a second service-role-touching request path. The tool instead moves the target
  reminder's `scheduled_for` to now, so the existing cron job sends it on its next run.
- **No token-level streaming to the browser for the AI chat.** `AIProvider.generateReply()` is
  non-streaming; each turn's tool loop runs to completion before a response is returned. Assistant
  replies are short operational answers, not long-form generation, so this is `CLAUDE.md`'s own
  "implement the smallest complete version" principle, not an oversight — see
  `docs/modules/AI_ASSISTANT.md` "Deferred."
- **Phase 10 adds an availability engine, because Phase 3 never built one.** Appointments
  were booked at an arbitrary instant with the `appointments_no_staff_overlap` EXCLUDE
  constraint as the only arbiter — fine for a receptionist looking at a calendar, unusable
  for a patient who cannot see one. `app.booking_slots()` generates slots from the existing
  primitives (`clinics.operating_hours`, `services.duration_minutes`, the same
  `appointments` rows and status exclusions the EXCLUDE constraint uses), and the constraint
  remains the final arbiter at write time. It is not a second scheduling system: slot
  generation makes conflicts rare, the constraint makes them impossible. See
  `docs/modules/ONLINE_BOOKING.md`.
- **The appointment automation rule loop moved from TypeScript into SQL**
  (`public.run_appointment_automation`, migration 0020); `lib/automation/dispatch.ts` is now
  a wrapper over it. Forced by a real requirement, not a refactor for its own sake: a public
  booking has no signed-in caller, so the TypeScript version — which depended on the
  caller's own INSERT rights on `reminders`/`follow_ups` — could not run for it. One engine,
  two entry points, rather than a second copy of the rules for the anonymous path. The
  invoice-side dispatcher stayed in TypeScript; no anonymous invoice path exists to force
  the same move.
- **The public booking page reaches the database only through SECURITY DEFINER RPCs.** `anon`
  holds no privilege on any table (migration 0001 revoked them; Phase 10 kept it that way),
  so the anonymous capability surface is a short list of function grants rather than a matrix
  of policies. RLS answers "which rows may this caller see?", and the booking page needs
  "given a slug, project a curated view of one clinic" — a function, not a predicate.
- **Phase 10 uses two new permissions (`booking.view`, `booking.manage`), not the seven the
  brief suggested**, and branding reuses the existing `clinic.update` — a logo is a clinic
  detail, and whoever may rename a clinic may set its logo. Same coarse-grain reasoning as
  Phase 7's inventory permissions.
- **Clinic branding (`slug`, `logo_url`) lives on `public.clinics`, not a `clinic_branding`
  table**, and there is no editable "booking page clinic name" anywhere — `clinics.name` is
  the only name the public page shows. Booking _policy_ does get its own table
  (`clinic_booking_settings`) because it is genuinely separable from clinic identity.
- **Clinic logo uploads accept PNG/JPEG/WEBP only; SVG is rejected.** An SVG is an
  executable document embedded on a public page, and accepting it safely needs a sanitizer
  this project does not have. MIME type is verified by magic bytes, never from the
  client-declared `file.type`.
- **No deposit or online-payment step at booking time.** The `PaymentProvider` is
  `not-configured` and no gateway exists, so a "require deposit" toggle could not be
  honored — a clinic would believe it was collecting deposits it never received. The
  booking RPCs leave the seam open. Deliberately absent rather than shipped inert.
- **No practitioner↔service eligibility.** Nothing in Phases 1–9 models it (no staff table,
  no practitioner-requirement column on `services`), so public practitioner visibility is
  clinic-scoped only rather than inventing an unpopulated eligibility matrix.
- **Rate limiting is a Postgres fixed-window counter (`booking_rate_limits`), and there is
  no CAPTCHA.** There is no Redis and serverless functions share no memory, so the database
  is the only place a counter can be shared between concurrent requests. The client key is a
  SHA-256 of the forwarded IP, never the IP itself. With no forwarded address the limiter
  fails open — it is a throttle, not an authorization check.
- **Ids in `lib/validation/booking.schema.ts` use a `uuidLike` regex, never Zod's `z.uuid()`.**
  Zod 4's `z.uuid()` enforces the RFC 4122 version and variant bits, but the Postgres `uuid`
  type accepts any 128-bit value — and this app is full of them: every seeded staff account
  has an id like `00000000-0000-0000-0000-0000000000a1`. Validating more strictly than the
  database rejects rows that are already stored. This shipped once and made the entire
  practitioner list unpublishable ("Invalid UUID"), which then surfaced on the public page as
  "Online booking isn't set up yet". Every other schema in `lib/validation/` uses a plain
  `z.string().min(1)` for ids for the same reason.
- **A public booking notifies clinic staff through the existing per-user notifications inbox**
  (migration 0022), gated on `appointments.view` so the alert and the row it links to are
  governed by one permission. It cannot use `public.create_notification()` — that RPC requires
  `auth.uid()`, and the booking path has no caller — so `app.notify_booking()` writes the same
  rows from inside the definer function. Patient-initiated cancellation and reschedule notify
  too: a patient silently cancelling is worse for a clinic than one silently booking.
- **The Appointments nav badge counts unconfirmed online bookings, not unread notifications.**
  It is a count of outstanding work, so it clears when the clinic confirms the appointments
  rather than when someone glances at an inbox — and a clinic on `auto` confirmation mode
  correctly never sees a badge, because nothing is waiting on them.
- **`vercel.json`'s cron schedules run once daily, not every 15 minutes / hourly**, on the deployed
  Vercel Hobby (free) plan, which caps cron frequency at once per day — a platform constraint, not a
  design choice. This means `reminder_24h`/`reminder_2h` reminders and overdue-invoice detection are
  checked once a day rather than near-real-time, so a reminder's actual send time can lag its
  `scheduled_for` by up to ~24h. Tighten `vercel.json` back to the original cadence
  (`*/15 * * * *` / `0 * * * *`) if/when the Vercel plan is upgraded.

## Known open questions

Not blockers for Phase 1, but they must be answered before the phase noted:

- **Compliance regime is unnamed** in every spec. `₱` and Davao/Cebu examples imply the Philippine
  Data Privacy Act rather than HIPAA. No retention policy, consent model, right-to-erasure flow, or
  vendor DPA/BAA is specified. Needed before production.
- **No pricing, plans, seats or subscription tables** exist, yet the Owner role "can manage
  billing/subscription". Needed before launch.
- **Six of seven role→permission matrices are unwritten** — only Receptionist is specified
  (`AUTHORIZATION.md` §5). Authored in migration 0002; requires human review.
- ~~**`get_patient` per-role field projection** (`AI_TOOLS.md` §10) and the **tool→permission mapping**
  for all 17 AI tools are unspecified. Needed for Phase 9.~~ Resolved in Phase 9: field inclusion is
  keyed to which permission the caller holds (`appointments.view`/`followups.view`/`reports.financial`),
  and every tool's permission mapping is recorded in `docs/modules/AI_ASSISTANT.md`.
