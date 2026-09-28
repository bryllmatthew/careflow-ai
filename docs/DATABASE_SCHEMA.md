# CareFlow AI — Database Schema

## Core Principle

The database must be designed around organizations and clinics.

Every organization-owned record must be scoped to the correct organization.

---

# organizations

Fields:

- id
- name
- business_type
- logo_url
- email
- phone
- timezone
- currency
- created_at
- updated_at

business_type examples:

- dental
- medical
- therapy
- aesthetic
- wellness
- other

---

# clinics

Fields:

- id
- organization_id
- name
- address
- phone
- email
- timezone
- operating_hours
- status
- created_at
- updated_at

---

# users

Fields:

- id
- organization_id
- auth_user_id
- name
- email
- phone
- avatar_url
- status
- created_at
- updated_at

---

# roles

Fields:

- id
- name
- description

---

# user_roles

Fields:

- id
- user_id
- role_id
- organization_id
- clinic_id nullable

A user may have organization-wide or clinic-specific permissions.

---

# patients

Fields:

- id
- organization_id
- primary_clinic_id
- first_name
- last_name
- email
- phone
- date_of_birth
- address
- notes
- status
- created_at
- updated_at

---

# staff

Fields:

- id
- organization_id
- user_id
- clinic_id
- specialty
- license_reference nullable
- appointment_color
- status
- created_at
- updated_at

---

# services

Fields:

- id
- organization_id
- clinic_id
- name
- description
- duration_minutes
- price
- cost nullable
- status
- created_at
- updated_at

---

# appointments

Fields:

- id
- organization_id
- clinic_id
- patient_id
- staff_id
- service_id
- room_id nullable
- start_at
- end_at
- status
- notes
- created_at
- updated_at

---

# invoices

Fields:

- id
- organization_id
- clinic_id
- patient_id
- appointment_id nullable
- invoice_number
- subtotal
- discount
- tax
- total
- amount_paid
- balance
- status
- issued_at
- due_at
- created_at
- updated_at

---

# invoice_items

Fields:

- id
- invoice_id
- service_id nullable
- product_id nullable
- description
- quantity
- unit_price
- discount
- total

---

# payments

Fields:

- id
- organization_id
- clinic_id
- patient_id
- invoice_id
- amount
- payment_method
- provider
- provider_reference
- status
- paid_at
- created_at

Never store raw card numbers, CVV, or equivalent sensitive payment credentials.

---

# products

Fields:

- id
- organization_id
- clinic_id
- name
- sku
- description
- cost
- selling_price
- supplier_id nullable
- track_batch
- track_expiration
- status
- created_at
- updated_at

---

# inventory

Fields:

- id
- organization_id
- clinic_id
- product_id
- quantity
- minimum_quantity
- reorder_quantity
- updated_at

---

# inventory_movements

Fields:

- id
- organization_id
- clinic_id
- product_id
- type
- quantity
- reference_type
- reference_id
- notes
- created_by
- created_at

---

# suppliers

Fields:

- id
- organization_id
- name
- contact_name
- email
- phone
- address
- status
- created_at
- updated_at

---

# purchase_orders

Fields:

- id
- organization_id
- clinic_id
- supplier_id
- purchase_order_number
- status
- subtotal
- tax
- total
- ordered_at
- expected_at
- received_at
- created_at
- updated_at

---

# reminders

Fields:

- id
- organization_id
- clinic_id
- patient_id
- appointment_id nullable
- channel
- scheduled_at
- sent_at
- status
- template_id nullable
- created_at

---

# follow_ups

Fields:

- id
- organization_id
- clinic_id
- patient_id
- appointment_id nullable
- type
- scheduled_at
- completed_at
- status
- notes
- created_at
- updated_at

---

# notifications

Fields:

- id
- organization_id
- user_id
- type
- title
- message
- read_at
- created_at

---

# audit_logs

Fields:

- id
- organization_id
- user_id
- action
- entity_type
- entity_id
- metadata
- created_at

---

# AI interactions

Fields:

- id
- organization_id
- user_id
- session_id
- request_type
- user_message
- response_summary
- created_at

Do not unnecessarily store sensitive patient information inside AI interaction logs.

---

# Database Rules

1. Foreign keys must be enforced.
2. Organization isolation must be enforced.
3. Use indexes on frequently filtered fields.
4. Use timestamps consistently.
5. Avoid duplicated business logic inside database and application unless intentional.
6. Use database transactions for financial operations.
7. Never delete financial records without a controlled audit process.
8. Prefer soft deletion for important business entities.
9. Validate organization ownership on every cross-entity operation.
10. Never trust organization_id supplied directly by an unauthenticated client.

---

## Phase 10 additions - online booking

### New columns on existing tables

| Table | Columns | Notes |
| --- | --- | --- |
| `clinics` | `slug`, `logo_url` | Branding lives on the clinic record; `slug` is globally unique among live clinics (the public URL carries no organization component). |
| `services` | `online_booking_enabled`, `public_name`, `public_description` | Publishing is opt-IN, default false, so enabling booking never exposes an internal catalogue. |
| `appointments` | `booking_source`, `booking_link_id`, `booking_reference`, `manage_token_hash`, `utm_source`, `utm_medium`, `utm_campaign`, `booking_idempotency_key` | `booking_source` defaults to `'admin'`, so existing rows classify correctly with no backfill; `'marketplace'` is in the CHECK from day one. None of these are in the `authenticated` UPDATE grant -- only the booking RPCs write them. |

### New tables

| Table | Purpose |
| --- | --- |
| `clinic_booking_settings` | Per-clinic public booking policy, 1:1 with `clinics`, created on first save. Holds no clinic identity. |
| `clinic_booking_practitioners` | Opt-in list of publicly bookable practitioners per clinic, with patient-facing name/title/bio. Absence means "not bookable", never "bookable by default". |
| `booking_links` | Tracked entry points to one clinic's page, carrying UTM attribution and optional service/practitioner pre-selection. Deactivated, never deleted. |
| `booking_rate_limits` | Fixed-window abuse counters. No client role holds any privilege on it. |

All four carry `organization_id`, composite FKs to `clinics (id, organization_id)` where
clinic-scoped, `created_at`/`updated_at` with the shared trigger, RLS, and column-level
UPDATE grants that keep tenancy columns immutable.

### Deliberately not created

`booking_attributions` (three columns on the appointment instead), `booking_tokens` (a hash
on the appointment it manages), and `clinic_branding` (two columns on `clinics`). Each would
have been a side table expressing a 1:1 relationship the existing row already has. See
`docs/modules/ONLINE_BOOKING.md`.

## Clinic type and dental additions

### New columns on existing tables

- `clinics.clinic_type` — `dental|medical|aesthetic|therapy|wellness|other`, default `other`;
  backfilled from `organizations.business_type`. A trigger refuses re-typing a clinic that
  holds dental records to a non-dental type.
- `clinics.tooth_numbering` — `fdi|universal`, default `fdi`. Display only.

### New tables

| Table | Purpose |
| --- | --- |
| `dental_teeth` | Static reference: 32 permanent teeth keyed by ISO 3950 code (`code smallint` PK), with arch, side, position, class, name, derived Universal number. |
| `dental_conditions` | A finding on one tooth: `tooth_code`, `surfaces`, `condition`, `status` (`present|resolved|entered_in_error`), notes, `source_treatment_id`, `noted_at/by`, `closed_at/by`, `status_reason`. |
| `dental_treatments` | A procedure: `procedure`, `service_id`, `appointment_id`, `practitioner_id`, `resulting_condition`, `status` (`planned|scheduled|completed|cancelled|entered_in_error`), planned/completed/closed stamps. |
| `dental_treatment_teeth` | Teeth (and surfaces) a treatment covers — `unique (treatment_id, tooth_code)`. |

All clinic-scoped dental tables carry `organization_id` + `clinic_id NOT NULL` with composite
FKs to `clinics` and `patients`; the treatment's appointment and service FKs are composite
too, and triggers enforce same-patient appointments and same-clinic services.

Domains: `dental_condition_code`, `dental_surface_set` (text + CHECK, per convention).

**No `DELETE`** is granted on any dental table, and no `deleted_at` column exists: clinical
records are corrected (`entered_in_error`) or closed (`resolved`/`cancelled`), never removed.
