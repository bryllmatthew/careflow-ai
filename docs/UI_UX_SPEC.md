# CareFlow AI — UI/UX Specification

## Design Direction

CareFlow AI should feel like a modern SaaS operating system rather than a traditional medical software application.

Design characteristics:

- Clean
- Premium
- Professional
- Modern
- Spacious
- Fast
- Simple
- Data-focused

Avoid:

- Cluttered medical software interfaces
- Excessive tables
- Too many colors
- Excessive gradients
- Complicated navigation
- Unnecessary animations

---

# Main Application Layout

Desktop:

Sidebar
+
Top Navigation
+
Main Content

Sidebar sections:

### Overview

- Dashboard
- AI Assistant

### Patients

- Patients
- Follow-ups

### Schedule

- Calendar
- Appointments

### Sales

- Sales
- Invoices
- Payments

### Inventory

- Products
- Inventory
- Suppliers
- Purchase Orders

### Management

- Staff
- Clinics
- Services

### Reports

- Business Reports
- Financial Reports
- Inventory Reports

### Settings

- Organization
- Clinic
- Users
- Roles
- Notifications
- Integrations

---

# Dashboard

The dashboard should immediately answer:

"How is my business performing?"

Top metrics:

Revenue

Appointments

New Patients

Outstanding Payments

Then:

Revenue chart

Appointment chart

Clinic comparison

Upcoming appointments

Follow-ups due

Low stock

AI insights

---

# Patient Profile

Patient profile should have a unified timeline.

Header:

Patient name
Contact
Status
Quick actions

Actions:

- Book Appointment
- Create Invoice
- Record Payment
- Add Follow-Up
- Send Message

Tabs:

Overview

Appointments

Services/Treatments

Invoices

Payments

Follow-Ups

Communication

---

# Calendar

Calendar should prioritize speed.

Users should be able to:

- Click a time slot to create appointment
- Drag appointments
- Resize appointments
- Change practitioner
- Change room
- Change status
- Quickly view patient information

Prevent accidental double booking.

---

# Global Search

Provide global search.

Search:

- Patients
- Appointments
- Invoices
- Products
- Staff

Future:

AI-powered natural language search.

Example:

"Show patients who haven't returned in 6 months."

---

# AI Assistant UX

The AI assistant should be accessible globally.

Example interface:

User:

"Which clinic made the most revenue last month?"

AI:

"Your Davao clinic generated ₱1.84M, which was 23% higher than Cebu."

Then provide:

View Report

The AI response must link to relevant application screens when possible.

---

# Responsive Design

Desktop-first for clinic operations.

Must still support:

- Tablet
- Mobile

Mobile should prioritize:

- Appointments
- Patients
- Notifications
- Follow-ups
- Payments

---

# Accessibility

Use:

- Keyboard navigation
- Clear labels
- Accessible forms
- Sufficient contrast
- Screen-reader friendly components
- Clear validation messages
---

# Dental Chart (dental clinics)

Patient profile gains **Dental Chart** and **Dental History** tabs after Overview, only when
the patient's clinic is dental and the viewer holds `dental.view`.

- **Chart tab** — odontogram card (upper and lower arches, patient's right on the viewer's
  left, five-zone surface diagram per tooth, roots drawn; findings painted by surface, crown
  or root; missing/extracted ghosted and crossed). Click or keyboard-select teeth; a side panel
  shows the selection's actions (Add condition / Plan treatment / Record performed), current
  findings (Resolve, Entered in error) and tooth history. Below: treatment plan list with
  Schedule / Mark as performed / Cancel, and a legend.
- **History tab** — patient-level timeline grouped by day; retracted entries struck through
  with their reason.
- **From an appointment** — the appointment sheet shows "Dental chart"; the chart then shows a
  banner and pre-links new treatments to that appointment.
- Narrow screens: the chart scrolls horizontally inside its card; the page itself never does.
- Clinics page shows a Type column; the clinic form has Clinic type and (for dental) Tooth
  numbering.
