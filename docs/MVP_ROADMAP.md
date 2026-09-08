# CareFlow AI — MVP Development Roadmap

## Phase 1 — Foundation

Build:

- Project setup
- Database
- Authentication
- Organization creation
- Clinic creation
- User management
- Roles
- Permissions
- Base dashboard
- Navigation
- Settings

Goal:

A user can create an organization, create clinics, invite staff, and securely access the platform.

---

# Phase 2 — Patient Management

Build:

- Patient list
- Search
- Filters
- Patient creation
- Patient editing
- Patient profile
- Patient timeline
- Appointment history
- Invoice history
- Payment history
- Follow-up history

Goal:

The clinic has one centralized patient database.

---

# Phase 3 — Scheduling

Build:

- Calendar
- Day view
- Week view
- Month view
- Staff availability
- Clinic hours
- Appointment creation
- Appointment editing
- Appointment cancellation
- Rescheduling
- Conflict detection
- Appointment status

Goal:

The clinic can operate its daily schedule completely inside CareFlow AI.

---

# Phase 4 — Reminders & Follow-Ups

Build:

- Reminder templates
- Appointment confirmations
- Reminder scheduling
- Follow-up creation
- Follow-up dashboard
- Automated follow-up rules
- Notification center

Goal:

Reduce missed appointments and forgotten follow-ups.

---

# Phase 5 — Sales & Invoicing

Build:

- Services
- Service pricing
- Invoice creation
- Invoice items
- Discounts
- Taxes
- Invoice statuses
- Receipts
- Sales dashboard
- Outstanding balances

Goal:

Clinic can manage revenue and billing.

---

# Phase 6 — Payments

Build:

- Payment provider integration
- Payment checkout
- Payment status
- Partial payments
- Refunds
- Receipts
- Payment history

Goal:

Patients can pay through the application.

---

# Phase 7 — Inventory & Supplies

Build:

- Products
- Inventory
- Stock movements
- Suppliers
- Purchase orders
- Low-stock alerts
- Inventory dashboard

Goal:

Clinic can track supplies and inventory.

---

# Phase 8 — Centralized Dashboard

Build organization-level dashboard.

Metrics:

- Revenue
- Appointments
- New patients
- Returning patients
- No-shows
- Cancellations
- Outstanding invoices
- Payments
- Inventory
- Clinic performance

Add:

- Date filters
- Clinic filters
- Practitioner filters
- Service filters

---

# Phase 9 — AI Assistant

Build:

- AI chat interface
- Tool calling
- Business data queries
- Dashboard summaries
- Follow-up suggestions
- Scheduling assistance
- Inventory insights

Example questions:

"How much revenue did we generate this month?"

"Which clinic has the most appointments?"

"Who needs a follow-up?"

"What invoices are unpaid?"

"What supplies are low?"

---

# Phase 10 — Future Marketing

Do NOT build this during the initial MVP unless specifically requested.

Future:

- Social account connections
- Content calendar
- AI content generation
- Social media scheduling
- Cross-platform publishing
- Social analytics
- Lead tracking
- Campaign tracking
- Marketing ROI

---

# Definition of MVP

The MVP is complete when a real clinic can:

1. Create its organization.
2. Create one or more clinics.
3. Add staff.
4. Add patients.
5. Add services.
6. Schedule appointments.
7. Send appointment reminders.
8. Manage follow-ups.
9. Create invoices.
10. Record/receive payments.
11. Track sales.
12. Track inventory and supplies.
13. View centralized business dashboards.
14. Use the AI assistant for operational insights.

---

## Phase 10 - Private Clinic Online Booking (shipped)

Each clinic gets its own patient-facing booking page at `/book/{slug}`, branded from its own
clinic record, with no patient account required.

Delivered:

- Dynamic clinic branding (name, logo, address/contact, opening hours) sourced from
  `public.clinics` -- never duplicated into a booking-specific profile.
- Clinic logo upload / replace / remove, with an initials fallback.
- Per-clinic booking settings: notice period, booking horizon, slot interval, confirmation
  mode, self-service permissions, and which contact details are public.
- Opt-in public services and practitioners.
- A server-side availability engine (`app.booking_slots`) built on `clinics.operating_hours`
  and the existing appointment rows -- Phase 3 never had one; see the deviation note in
  `CLAUDE.md`.
- Public booking with server-side availability recheck, clinic-scoped patient matching,
  idempotency, and the existing EXCLUDE constraint as the final double-booking arbiter.
- Patient self-service cancel/reschedule by unguessable token.
- Campaign booking links with UTM attribution, and QR codes.
- Phase 4 reminders, Phase 8 reporting and one Phase 9 AI tool, all through the existing
  engines.

Explicitly **not** built: the CareFlow public marketplace, clinic discovery/search,
geolocation, reviews, marketplace payments, and autonomous AI booking. `booking_source`
already carries `'marketplace'` so that phase needs no schema change.

Full detail: `docs/modules/ONLINE_BOOKING.md`.
