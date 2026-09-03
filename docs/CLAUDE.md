# CareFlow AI — Claude Code Instructions

## 1. Project Overview

CareFlow AI is a multi-tenant, AI-powered practice management platform designed for:

- Dentists
- Doctors
- Therapists
- Aesthetic Clinics
- Wellness Clinics
- Other appointment-based healthcare/service practices

The platform should centralize:

- Clinic management
- Patient/client management
- Appointment scheduling
- Appointment reminders
- Follow-ups
- Payments
- Sales
- Invoicing
- Inventory
- Supplies
- Staff management
- Multi-clinic dashboards
- AI-powered operational assistance

A future version will also include:

- Social media marketing
- Content calendars
- AI content generation
- Social media scheduling
- Automated cross-posting
- Marketing analytics

## 2. Core Product Principle

CareFlow AI should not behave like a collection of disconnected features.

Everything should be connected through a central data model.

Example:

Patient → Appointment → Treatment/Service → Invoice → Payment → Follow-up → Reminder → Dashboard

Inventory should connect to services/products where applicable.

Example:

Service → Required Supplies → Inventory Deduction → Low Stock Alert

Marketing should eventually connect to business performance.

Example:

Campaign → Social Content → Leads → Appointments → Revenue

## 3. Development Philosophy

Build the application in small, testable modules.

Do NOT attempt to build the entire platform at once.

Prioritize:

1. Authentication
2. Organizations / Clinics
3. Users and Roles
4. Patients
5. Services
6. Scheduling
7. Appointments
8. Reminders
9. Follow-ups
10. Invoicing
11. Payments
12. Sales
13. Inventory
14. Supplies
15. Dashboards
16. AI Assistant

Marketing is a future module and should not complicate the initial MVP.

## 4. Multi-Tenant Architecture

The application must support multiple organizations.

An organization may have:

- One clinic
- Multiple clinics
- Multiple branches
- Multiple doctors
- Multiple dentists
- Multiple therapists
- Multiple staff members

All business data must belong to an organization.

Never expose data belonging to another organization.

Use strict organization-level authorization.

## 5. Account Structure

Support the following conceptual hierarchy:

Organization
    ↓
Clinics / Branches
    ↓
Departments / Services
    ↓
Staff
    ↓
Patients
    ↓
Appointments / Sales / Payments / Inventory

## 6. Roles

Initial roles:

### Organization Owner

Full access to the organization.

### Administrator

Operational and management access.

### Clinic Manager

Access to assigned clinics.

### Practitioner

Access primarily to:

- Assigned patients
- Appointments
- Clinical/service notes
- Follow-ups

### Receptionist

Access primarily to:

- Patients
- Scheduling
- Appointments
- Payments
- Invoices

### Finance

Access primarily to:

- Sales
- Invoices
- Payments
- Financial reports

### Inventory Manager

Access primarily to:

- Inventory
- Supplies
- Purchase orders
- Stock movements

Roles should be permission-based rather than hardcoded throughout the application.

## 7. AI Principles

AI should assist users rather than make autonomous medical decisions.

AI may assist with:

- Scheduling suggestions
- Follow-up suggestions
- Reminder generation
- Patient communication drafts
- Business insights
- Sales insights
- Inventory forecasting
- Low-stock predictions
- Dashboard summaries
- Administrative automation
- Content generation in the future

AI must NOT:

- Diagnose patients
- Prescribe medication
- Make clinical decisions
- Replace professional judgment

Any AI-generated healthcare-related information must clearly be treated as assistance and reviewed by an appropriate professional.

## 8. UX Principles

The application should feel:

- Modern
- Clean
- Professional
- Fast
- Minimal
- Data-driven
- Easy for non-technical staff

Avoid overwhelming users with unnecessary information.

Use dashboards and contextual actions.

Common actions should require as few clicks as possible.

## 9. Important Development Rule

Before implementing a feature:

1. Read the relevant `.md` specification.
2. Check the existing architecture.
3. Check database relationships.
4. Check authorization requirements.
5. Check whether another module depends on the feature.
6. Implement the smallest complete version.
7. Test it.
8. Only then expand functionality.

Do not invent architecture that conflicts with the specifications.

## 10. MVP Rule

When uncertain whether something belongs in MVP:

Prefer a simple, reliable implementation over a complex AI-powered implementation.

The MVP must be usable by a real clinic before advanced automation is added.