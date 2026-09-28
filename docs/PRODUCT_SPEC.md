# CareFlow AI — Product Specification

## Product Vision

CareFlow AI is an AI-powered operating system for modern healthcare and aesthetic practices.

The goal is to replace fragmented tools with one centralized platform for managing:

- Clinics
- Patients
- Appointments
- Staff
- Payments
- Sales
- Inventory
- Follow-ups
- Business analytics
- AI-assisted operations

## Target Users

### Primary

- Dentists
- Dental Clinics
- Doctors
- Medical Clinics
- Therapists
- Therapy Clinics
- Aesthetic Clinics
- Skin Clinics
- Wellness Clinics

### Secondary

- Clinic owners
- Practice managers
- Receptionists
- Finance teams
- Inventory managers
- Marketing teams

---

# Core Modules

## 1. Authentication

Users can:

- Register
- Log in
- Log out
- Reset password
- Verify email
- Manage profile
- Manage security settings

Authentication must support organization membership.

---

# 2. Organization Management

An organization represents the business.

Example:

"ABC Dental Group"

An organization can contain multiple clinics.

Example:

ABC Dental Group
- Davao Branch
- Cebu Branch
- Manila Branch

Organization-level users can view centralized data.

---

# 3. Clinic Management

Each clinic should have:

- Name
- Address
- Contact information
- Operating hours
- Timezone
- Services
- Staff
- Rooms
- Equipment/resources
- Payment settings
- Notification settings

Clinic owners can configure availability.

---

# 4. Staff Management

Staff profiles should include:

- Name
- Email
- Phone
- Role
- Clinic
- Specialty
- Availability
- Working hours
- Appointment capacity

Staff can have different permissions.

---

# 5. Patient / Client Management

Create a centralized patient database.

Patient profile should include:

- Full name
- Contact information
- Date of birth
- Gender where applicable
- Address
- Notes
- Assigned practitioner
- Appointment history
- Treatment/service history
- Invoice history
- Payment history
- Follow-up history
- Communication history

The system should provide a unified patient timeline.

Example:

Patient
↓
Appointment
↓
Service
↓
Invoice
↓
Payment
↓
Follow-up
↓
Future Appointment

---

# 6. Scheduling

The scheduling system is one of the core modules.

Features:

- Calendar
- Day view
- Week view
- Month view
- Practitioner schedule
- Clinic schedule
- Room/resource schedule
- Appointment creation
- Appointment editing
- Appointment cancellation
- Rescheduling
- Recurring appointments
- Availability management
- Conflict detection
- Double-booking prevention

Appointments should support statuses:

- Pending
- Confirmed
- Checked In
- In Progress
- Completed
- Cancelled
- No Show
- Rescheduled

---

# 7. Appointment Reminders

Automated reminders should support:

- SMS
- Email
- In-app notifications
- Messaging integrations where available

Example reminder sequence:

Appointment booked
↓
Confirmation
↓
24-hour reminder
↓
2-hour reminder
↓
Appointment
↓
Post-appointment follow-up

Reminder templates should be customizable.

---

# 8. Follow-Up Automation

Users can create follow-up rules.

Examples:

After appointment:
→ Follow up after 1 day

After treatment:
→ Follow up after 7 days

After consultation:
→ Follow up after 3 days

No-show:
→ Send rescheduling message

Unpaid invoice:
→ Send payment reminder

The system should support automated workflows.

---

# 9. Payments

The platform should support in-app payments.

Payment functionality should include:

- Payment collection
- Payment status
- Partial payments
- Full payments
- Refunds
- Payment history
- Payment methods
- Payment receipts

Never store raw card information.

Use a PCI-compliant payment provider.

Payment status:

- Pending
- Paid
- Partially Paid
- Failed
- Refunded
- Cancelled

---

# 10. Sales & Invoicing

Invoices should contain:

- Patient
- Clinic
- Practitioner
- Services
- Products
- Discounts
- Taxes
- Subtotal
- Total
- Payment status
- Invoice date
- Due date

Sales should connect to:

- Appointments
- Patients
- Services
- Products
- Payments

Generate:

- Invoice
- Receipt
- Sales reports

---

# 11. Services

Each clinic can define services.

Example:

Dental:

- Cleaning
- Consultation
- Whitening
- Extraction
- Braces

Aesthetic:

- Facial
- Laser treatment
- Injectables
- Skin treatment

Therapy:

- Initial consultation
- Individual session
- Couples session
- Follow-up

Each service can have:

- Name
- Description
- Price
- Duration
- Practitioner requirements
- Clinic availability
- Inventory requirements

---

# 12. Inventory

Inventory should support:

- Products
- Medical/service supplies
- Stock quantity
- Minimum stock level
- Cost
- Selling price
- Supplier
- Batch number where applicable
- Expiration date where applicable
- Stock movements

Stock movement types:

- Purchase
- Sale
- Usage
- Adjustment
- Return
- Transfer
- Expired

---

# 13. Supply Management

Supply management should support:

- Suppliers
- Purchase orders
- Incoming stock
- Purchase history
- Supplier pricing
- Stock forecasting
- Low-stock alerts

Future AI capability:

Predict when supplies will run out based on historical usage.

---

# 14. Multi-Clinic Dashboard

Organization owners should have a centralized dashboard.

Dashboard metrics:

- Total revenue
- Revenue by clinic
- Appointments
- Completed appointments
- Cancellation rate
- No-show rate
- New patients
- Returning patients
- Outstanding invoices
- Payments collected
- Inventory value
- Low-stock items

Filters:

- Date range
- Clinic
- Practitioner
- Service
- Department

---

# 15. AI Dashboard

The AI dashboard should summarize business activity.

Example:

"Revenue increased 18% compared with the previous period."

"Your Davao clinic generated the highest revenue."

"You have 14 outstanding invoices."

"Three supplies are projected to reach minimum stock within 10 days."

"Your no-show rate increased this week."

AI insights should always be traceable to underlying data.

Do not fabricate metrics.

---

# 16. AI Assistant

Provide a conversational AI assistant inside the application.

Users should be able to ask:

"How much did we make this month?"

"Which clinic performed best?"

"How many appointments do we have tomorrow?"

"Which patients need follow-up?"

"What supplies are running low?"

"Show me unpaid invoices."

"Which services generate the most revenue?"

The AI should retrieve data through controlled application tools rather than having unrestricted database access.

---

# Future Marketing Module

Marketing is intentionally excluded from the initial MVP.

The architecture should allow it to be added later.

Future features:

- Social media account connections
- Content calendar
- AI content generation
- Caption generation
- Creative briefs
- Post scheduling
- Automated cross-posting
- Facebook
- Instagram
- TikTok
- LinkedIn
- Other supported platforms
- Marketing analytics
- Campaign tracking
- Lead attribution

Future marketing architecture should connect:

Marketing
↓
Leads
↓
Appointments
↓
Services
↓
Revenue

This allows the platform to eventually measure marketing ROI.

---

## Phase 10 - Private Clinic Online Booking (shipped)

Every clinic can publish its own patient-facing booking page at `/book/{slug}`, branded from
its own clinic record. Patients book without an account.

- **Branding is dynamic.** Clinic name, logo, address, contact details and opening hours all
  come from the clinic record. Renaming a clinic or replacing its logo changes the public
  page on the next request, with no booking-page edit. There is no separate "booking page
  clinic name" to keep in sync.
- **Publishing is opt-in.** Services and practitioners appear publicly only when explicitly
  switched on, so enabling online booking never exposes an internal catalogue or a colleague
  who does not see patients.
- **Availability is server-computed** from the clinic's opening hours, the service duration
  and the practitioner's existing appointments, and rechecked at submission. The database's
  double-booking constraint remains the final arbiter.
- **Bookings are ordinary appointments** -- same table, same calendar, same reminders, same
  reports -- tagged with where they came from.
- **Patients can cancel or reschedule** through a private link, within limits the clinic
  sets.
- **Campaign links and QR codes** let a clinic tell which channel produced which bookings.

Not in this phase: the CareFlow public marketplace, clinic discovery, reviews, marketplace
payments, deposits at booking time, and autonomous AI booking. See
`docs/modules/ONLINE_BOOKING.md` for the deferrals and their reasons.

---

## Clinic types and the Dental module (shipped)

Full detail: `docs/modules/DENTAL.md`.

**Clinic type.** Sign-up now requires choosing a clinic type (Dental, Medical, Aesthetic,
Therapy / Rehabilitation, Wellness, Other). Each clinic carries its own type, because one
organization may run different kinds of branches; the organization's sign-up choice is the
default for new clinics. The type switches specialty modules on through a central capability
registry — never through scattered type checks.

**Dental module** (dental clinics only):

- Interactive odontogram of the permanent dentition, FDI or Universal numbering per clinic.
- Select one or several teeth; record findings per tooth and surface (mesial, distal,
  buccal/facial, lingual/palatal, occlusal, incisal).
- Findings: caries, restoration, crown, bridge, implant, root canal treated, missing,
  extracted, impacted, for extraction, under observation, other.
- Treatment planning: planned → scheduled (linked to an appointment) → completed (explicit
  sign-off), or cancelled. An appointment never marks treatment done by itself.
- A completed treatment can chart its result on the tooth (e.g. extraction → extracted).
- Patient-level Dental History and per-tooth history; nothing is deleted — mistakes are
  marked "entered in error" and stay visible.
- Opens from an appointment ("Dental chart"), pre-linking work to that visit.
- Clinical staff only by default: receptionist, finance and inventory roles have no access.
