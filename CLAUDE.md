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
- **No product line items on invoices.** No products/inventory table exists until Phase 7 —
  `invoice_items.service_id` is the only structured source column; a `product_id` nobody could
  populate would be dead weight, not a real feature.
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

## Known open questions

Not blockers for Phase 1, but they must be answered before the phase noted:

- **Compliance regime is unnamed** in every spec. `₱` and Davao/Cebu examples imply the Philippine
  Data Privacy Act rather than HIPAA. No retention policy, consent model, right-to-erasure flow, or
  vendor DPA/BAA is specified. Needed before production.
- **No pricing, plans, seats or subscription tables** exist, yet the Owner role "can manage
  billing/subscription". Needed before launch.
- **Six of seven role→permission matrices are unwritten** — only Receptionist is specified
  (`AUTHORIZATION.md` §5). Authored in migration 0002; requires human review.
- **`get_patient` per-role field projection** (`AI_TOOLS.md` §10) and the **tool→permission mapping**
  for all 17 AI tools are unspecified. Needed for Phase 9.
