# Dashboards & Reporting (Phase 8)

Module reference for `lib/reporting/` and `app/(app)/reports/*-queries.ts`. Covers both the
Executive Dashboard (`app/(app)/dashboard/page.tsx`) and the three report pages
(`/reports/financial`, `/reports/business`, `/reports/inventory`), since they share one query layer.

Read `CLAUDE.md`'s "Deliberate deviations" section first for the scope decisions this phase made.

## Architecture

```
UI (dashboard/report page, RSC)
  ↓ searchParams (range, clinic, practitioner, service, tab, page, aging)
app/(app)/reports/context.ts  -- resolves org timezone/currency/authorized clinics, parses filters
  ↓
app/(app)/reports/*-queries.ts  -- one file per domain (revenue, appointment, patient, performance,
  followup, receivables, dashboard) -- the ONLY place a KPI is computed
  ↓
Supabase, via the normal RLS-respecting server client (never the admin client)
```

No new database tables, views, or RPCs were added this phase (section 59). Every reporting query
runs `SELECT`/aggregate operations over the existing transactional tables through the same
`getSupabaseServerClient()` every other module uses -- **RLS is what makes aggregation security
free**, not a new mechanism (see "Aggregation security" below).

## Date range & timezone (section 5)

`lib/reporting/timezone.ts` is a small, zero-dependency IANA timezone module (no `date-fns`/`dayjs`
was added -- see `CLAUDE.md`). It uses the standard `Intl.DateTimeFormat` round-trip technique to
convert a wall-clock date/time in an arbitrary timezone to the correct UTC instant, including across
DST transitions. Verified directly (not just by inspection) against known-correct conversions:
Sept 5 00:00 in `Asia/Manila` (UTC+8) resolves to `2026-09-04T16:00:00.000Z`, never the naive (and
wrong) `2026-09-05T00:00:00.000Z`; `America/New_York` resolves EDT (UTC-4) in July and EST (UTC-5) in
January correctly.

`lib/reporting/date-range.ts` builds every preset (`Today` … `Last Year`, `Custom Range`) on top of
that primitive, always against **the organization's `organizations.timezone`** (`clinics.timezone`
is not used for boundary math -- a multi-timezone single organization is not a scenario this
platform's target market needs, and using one canonical timezone avoids the boundary shifting every
time the clinic filter changes). Weeks start **Monday** (ISO 8601) -- not specified anywhere in the
spec set; documented here as the one place that decision lives.

**Period comparison (section 29)** is one generic rule for every range, named or custom:
`previousStart = selectedStart - duration`, `previousEnd = selectedStart`. This is not a
per-key special case -- it happens to reduce to "this month vs last month" for the `this_month` key
because the durations line up exactly, and it was verified directly against the spec's own worked
example (`Sept 1–15` → `Aug 17–31`).

## Aggregation security (sections 36-38, 56)

**No new RLS policy exists for reporting.** Every table a reporting query touches
(`invoices`, `payments`, `refunds`, `appointments`, `patients`, `follow_ups`, `reminders`,
`inventory`, `inventory_batches`, `services`) already has a `SELECT` policy scoped to
`app.permitted_clinics(...)`/`app.permitted_orgs(...)`, from its own phase. Postgres RLS filters
rows out **before** any `SUM`/`COUNT` ever sees them -- there is no way for a query to "compute
first, filter after." Concretely:

- A clinic-A1-scoped user's `SUM(invoices.total) WHERE organization_id = X` (no clinic filter --
  "All Clinics") can only ever include clinic A1's rows, structurally, never A1 + an unauthorized
  clinic A2. This is the exact property section 38 requires ("All Clinics" must mean the union of
  *authorized* clinics, never every clinic).
- An org-wide owner's identical query legitimately includes every clinic -- the exclusion above is
  authorization-based, not an accidental under-count.
- A cross-organization aggregate (org B querying with org A's id) returns zero, not a partial or
  wrong total.

All three properties are proven by `supabase/tests/reporting_test.sql` (12 pgTAP assertions), which
runs real `SUM`/`COUNT` queries as differently-scoped fixture users rather than asserting on
application code.

## KPI definitions

| KPI | Formula | Source |
|---|---|---|
| Invoiced | `SUM(invoices.total)` where `status NOT IN (draft, void, cancelled)`, `issue_date` in range | `invoices` |
| Collected | `SUM(payments.amount)` where `status = 'succeeded'`, `paid_at` in range | `payments` |
| Refunded | `SUM(refunds.amount)` where `status = 'succeeded'`, `completed_at` in range | `refunds` |
| Net Collected | `Collected - Refunded` | derived |
| Outstanding | `SUM(invoices.balance)` where `status IN (issued, overdue, partially_paid)` -- **always current, never date-ranged**: it is money owed *right now*, not money that became owed within the selected window | `invoices` |
| Eligible Appointments | Appointments whose `start_at` is in range AND `status IN (completed, cancelled, no_show)` -- excludes `pending`/`confirmed`/`checked_in`/`in_progress` since they have not concluded yet. **One definition, used by every rate below.** | `appointments` |
| Completion Rate | `completed / eligible` | derived |
| No-Show Rate | `no_show / eligible` | derived |
| Cancellation Rate | `cancelled / eligible` | derived |
| New Patients | `COUNT(patients)` where `created_at` in range | `patients` |
| Returning Patients | Distinct patients with a `completed` appointment in range who ALSO had a `completed` appointment before the range started (an operational metric, not clinical retention -- section 12) | `appointments` |
| Repeat Appointment Rate | (completed appointments in range belonging to a returning patient) / (all completed appointments in range) | derived |
| Service Revenue | `SUM(invoice_items.line_total)` for that service's line items, on invoices `NOT IN (draft, void, cancelled)`, `issue_date` in range -- **invoiced value, not collected revenue**: payments settle whole invoices, not individual line items, so there is no clean way to attribute a *payment* to one line | `invoice_items` |
| Practitioner Attributed Revenue | `SUM(invoices.total)` only for invoices with `appointment_id` set, joined to that appointment's `staff_id` -- **never a guessed split** of revenue with no explicit appointment link (section 16) | `invoices` + `appointments` |
| Inventory Value | `quantity_on_hand × products.unit_cost`, summed -- unchanged from Phase 7 | `inventory` + `products` |
| Reminder Success Rate | `sent / (sent + failed)` | `reminders` |
| Follow-Up Completion Rate | `completed / (completed + cancelled)`, within range | `follow_ups` |

Every percentage-change badge uses `lib/reporting/format.ts`'s `safePercentChange()`: a zero
previous-period value never produces `Infinity%` -- it renders `New` (current > 0) or `N/A`
(both zero), the one rule every KPI comparison uses (section 8/48).

## Permissions (section 34)

No new permissions were added. Phase 1 already seeded `reports.view`, `reports.financial`, and
`reports.inventory`, granted to the roles `AUTHORIZATION.md` describes -- this phase's dashboard and
report pages are gated by exactly those three:

- `reports.financial` -- Financial Reports (revenue, receivables, payments, invoice status), and the
  dashboard's revenue/outstanding tiles.
- `reports.view` -- Business Reports (appointments, patients, clinic/service/practitioner
  performance, follow-ups, reminders), and the dashboard's non-financial tiles.
- `reports.inventory` -- Inventory Reports and the dashboard's inventory-value figure.
- CSV export re-uses whichever of the above already gates the report being exported -- there is no
  separate `reports.export` permission. An export can never see more than the on-screen report it
  mirrors (section 33), enforced by calling `requirePermission()` with the same permission string
  inside `app/api/reports/export/route.ts` before running the same query function the page calls.

Each individual dashboard widget/report tab is further wrapped in `<PermissionGate>` against the
specific domain permission it needs (`appointments.view`, `patients.view`, `followups.view`,
`inventory.view`) -- so, per section 35, a Practitioner or Receptionist without `reports.financial`
sees the operational widgets (today's appointments, follow-ups) but never revenue/outstanding.

## Clinic/practitioner/service filters

`components/patterns/report-filter-bar.tsx` is the one filter bar every dashboard/report page uses,
writing to a shared searchParams shape (`range`, `from`, `to`, `clinic`, `practitioner`, `service`)
so navigating between report pages/tabs preserves scope (section 31) -- each page just reads the same
keys, it never re-serializes filters by hand. `components/patterns/url-tabs.tsx` mirrors the active
tab into a `tab` param the same way, so a dashboard cross-link like `/reports/business?tab=clinics`
lands correctly.

The **Clinic** dropdown only ever lists clinics `listClinicOptions()` (RLS-gated) returns -- an
unauthorized clinic cannot even be selected, on top of the aggregation-security guarantee above.

## Drill-down (section 26)

Dashboard/report metrics link into the **existing** list pages (`/appointments`, `/patients`,
`/invoices`, `/inventory`) via their own already-supported filter query params, rather than any new
list view. `/appointments` was extended (a small, additive change) to also accept `from`/`to` so a
"No-Show Rate" click opens exactly the no-shows that made up that number, not every no-show ever
recorded. `/patients` and `/invoices` drill-down currently carries `clinic`/`status` only, not the
exact date window -- see "Deferred" below.

## Charts (section 46)

`components/patterns/trend-chart.tsx` is a small hand-rolled SVG line chart (no charting library was
added -- two trend charts didn't justify one). It follows the dataviz skill's mark specs (2px lines,
round joins, ~10% area wash for a single series, hairline gridlines, a legend only for 2+ series,
hover crosshair + one tooltip listing every series). Series colors are the app's own `--chart-1`
through `--chart-5` CSS custom properties (`app/globals.css`), populated this phase with the dataviz
skill's validated categorical palette (worst adjacent CVD ΔE 9.1 light / 8.4 dark) -- they were
previously unused grayscale placeholders from the shadcn scaffold.

## Export (section 33)

CSV only (no PDF -- "where the existing architecture makes it practical" did not turn out to apply;
no PDF-generation dependency exists anywhere in the project). `app/api/reports/export/route.ts` is a
single Route Handler covering 8 export types, each a thin re-serialization of the exact query
function its on-screen report tab calls, behind the same `requirePermission()` and the same
RLS-respecting client -- never the admin client, never a separate "export" code path that could see
more than the screen.

## Deferred

- **Per-clinic timezone.** All date-range math uses the organization's timezone; `clinics.timezone`
  is not consulted. See "Date range & timezone" above.
- **PDF export.** CSV only.
- **`/patients` and `/invoices` drill-down date range.** These list pages predate per-record date
  filtering (Phases 2 and 5); extending their query functions/pages to accept `from`/`to` the way
  `/appointments` now does is deferred, not silently dropped -- clicking through from a KPI still
  lands on the correctly clinic/status-filtered subset, just not date-clipped to the exact KPI
  window.
- **Reporting cache (section 41).** Every dashboard/report query is a live database read. No caching
  layer exists yet; nothing here needs one at the row counts a single-organization MVP produces
  (section 40's "make it correct first" is the applicable rule, not "premature optimization").
- **AI tool wiring (section 50/51).** The query functions in `app/(app)/reports/*-queries.ts` already
  return small, structured, JSON-safe objects (never raw patient rows) precisely so a future Phase 9
  AI tool can call them directly -- but no tool registry or AI-facing wrapper exists yet.
- **Global search integration (section 52).** No ⌘K/global search feature exists anywhere in the app
  yet to integrate reports into.
