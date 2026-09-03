# CareFlow AI — Technical Architecture

## Architecture Goal

Build a scalable multi-tenant SaaS application.

The architecture must support:

- Multiple organizations
- Multiple clinics
- Multiple users
- Role-based permissions
- Modular features
- AI services
- External integrations
- Payment providers
- Messaging providers
- Future social media integrations

---

# Recommended Stack

Use the project's existing stack if one has already been established.

If starting from scratch, preferred architecture:

### Frontend

- Next.js
- TypeScript
- Tailwind CSS
- Component-based UI

### Backend

- Next.js server architecture or dedicated API layer
- TypeScript

### Database

- PostgreSQL
- Supabase is acceptable and preferred if already being used

### Authentication

- Supabase Auth or equivalent secure authentication provider

### Storage

- Supabase Storage or equivalent

### AI

Use an abstraction layer so the application is not tightly coupled to one AI provider.

Example:

AI Provider
↓
AI Service Layer
↓
Application

This allows future provider changes.

---

# Multi-Tenant Data Model

Every organization-owned table should contain:

organization_id

Clinic-specific records should additionally contain:

clinic_id

Example:

patients

- id
- organization_id
- clinic_id
- name
- phone
- email
- created_at

---

# Core Entities

Organization

Clinic

User

Role

Permission

Staff

Patient

Service

Appointment

AppointmentStatus

Availability

Room

Reminder

FollowUp

Communication

Invoice

InvoiceItem

Payment

Product

InventoryItem

InventoryMovement

Supplier

PurchaseOrder

PurchaseOrderItem

AIInteraction

Notification

---

# Relationship Model

Organization

has many Clinics

Organization

has many Users

Clinic

has many Staff

Clinic

has many Patients

Clinic

has many Services

Clinic

has many Appointments

Patient

has many Appointments

Patient

has many Invoices

Patient

has many Payments

Appointment

belongs to Patient

Appointment

belongs to Staff/Practitioner

Appointment

belongs to Clinic

Appointment

may generate Invoice

Invoice

has many InvoiceItems

Invoice

has many Payments

Service

may require InventoryItems

InventoryItem

has many InventoryMovements

Supplier

has many PurchaseOrders

---

# Event-Driven Automation

Important system events should be represented consistently.

Examples:

appointment.created

appointment.confirmed

appointment.cancelled

appointment.completed

appointment.no_show

invoice.created

invoice.overdue

payment.received

inventory.low_stock

inventory.expired

followup.created

followup.due

These events can trigger automations.

Example:

appointment.completed
→ create follow-up
→ schedule reminder
→ update dashboard

payment.received
→ update invoice
→ update revenue
→ generate receipt

inventory.low_stock
→ create notification
→ notify inventory manager

---

# Automation Engine

Build automation as a reusable system rather than hardcoding every workflow.

Basic structure:

Trigger
+
Conditions
+
Actions

Example:

TRIGGER:
appointment.completed

CONDITION:
service = "Dental Cleaning"

ACTION:
create follow-up after 6 months

Another:

TRIGGER:
invoice.overdue

ACTION:
send payment reminder

---

# Notification System

Create a centralized notification service.

Notification channels:

- In-app
- Email
- SMS
- Future messaging integrations

Notifications should have:

- user_id
- organization_id
- type
- title
- message
- status
- read_at
- created_at

---

# Audit Logging

Important actions should be logged.

Examples:

- Patient created
- Patient updated
- Appointment changed
- Invoice modified
- Payment recorded
- Inventory adjusted
- User permission changed

Audit logs should contain:

- User
- Organization
- Action
- Entity
- Entity ID
- Timestamp
- Relevant metadata

---

# Security

Security is a first-class requirement.

Implement:

- Organization-level data isolation
- Role-based access control
- Server-side authorization
- Input validation
- Rate limiting where appropriate
- Secure authentication
- Secure secrets management
- Audit logging
- No sensitive payment information storage
- Encrypted connections
- Safe AI data handling

Do not rely only on frontend authorization.

Every sensitive backend operation must verify permissions.

---

# AI Architecture

Never allow the AI model unrestricted database access.

Use tools/functions.

Example:

AI Assistant
↓
Tool Router
↓
get_revenue()
get_appointments()
get_patient_followups()
get_low_stock_items()
get_unpaid_invoices()
↓
Authorized Database Queries

The AI should only receive the minimum data necessary.

---

# Future Integrations

Design integration interfaces for:

Payment providers

Email providers

SMS providers

Calendar providers

Social media platforms

CRM systems

Accounting platforms

AI providers

Do not tightly couple the core system to a single external provider.