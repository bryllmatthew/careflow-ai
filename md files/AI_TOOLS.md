# CareFlow AI — AI Tools & Assistant Specification

## 1. Purpose

CareFlow AI includes an AI assistant that acts as an operational assistant for clinic owners, managers, practitioners, receptionists, finance teams, and inventory managers.

The AI is NOT a generic chatbot.

It should interact with real application data through controlled tools.

---

# 2. Core Principle

The AI must never receive unrestricted database access.

Architecture:

User
↓
AI Assistant
↓
Intent Detection
↓
Permission Check
↓
AI Tool
↓
Authorized Query
↓
Result
↓
AI Response

The AI should only access information the authenticated user is allowed to access.

---

# 3. AI Context

The AI may know:

- Current user
- User role
- Organization
- Accessible clinics
- User permissions
- Current date/time
- Relevant application context

The AI should NOT automatically receive the entire patient database.

---

# 4. Tool Architecture

Create a controlled tool layer.

Examples:

get_dashboard_summary

get_revenue_summary

get_appointments

get_upcoming_appointments

get_patient

search_patients

get_patient_history

get_followups

get_overdue_followups

get_unpaid_invoices

get_payment_summary

get_inventory_status

get_low_stock_items

get_inventory_usage

get_sales_summary

get_clinic_performance

get_practitioner_performance

---

# 5. Tool Requirements

Every tool must:

1. Receive authenticated user context.
2. Determine organization.
3. Determine accessible clinics.
4. Verify required permission.
5. Query only authorized records.
6. Return structured data.
7. Never bypass authorization.

The AI model itself must NOT decide whether a user has permission.

The application decides.

---

# 6. Dashboard Tools

## get_dashboard_summary

Purpose:

Provide high-level business performance.

Possible inputs:

- organization_id
- clinic_id optional
- start_date
- end_date

Returns:

- revenue
- appointments
- completed appointments
- cancelled appointments
- no-shows
- new patients
- returning patients
- outstanding invoices

---

# 7. Revenue Tool

## get_revenue_summary

Example user questions:

"How much did we make this month?"

"Compare this month with last month."

"Which clinic generated the most revenue?"

Returns structured financial data.

The AI should calculate comparisons only from actual returned data.

Never invent missing values.

---

# 8. Appointment Tool

## get_appointments

Supports:

- date range
- clinic
- practitioner
- status
- patient

Example:

"What appointments do I have tomorrow?"

"How many appointments are scheduled this week?"

"Show today's cancelled appointments."

---

# 9. Patient Search

## search_patients

Supports:

- name
- phone
- email
- patient ID

Only return patients the user is authorized to access.

---

# 10. Patient Information

## get_patient

Returns only information appropriate to the requesting user's permissions.

Example:

Practitioner may receive:

- Contact information
- Appointment history
- Relevant service history
- Follow-ups

Finance may receive:

- Patient identity
- Invoices
- Payments
- Balances

Avoid exposing unrelated information.

---

# 11. Follow-Up Tools

## get_followups

Example:

"Who needs follow-up today?"

"Which patients haven't been contacted?"

"Show overdue follow-ups."

The tool should return:

- Patient
- Follow-up type
- Due date
- Related appointment
- Status

---

# 12. Invoice Tools

## get_unpaid_invoices

Example:

"Show all unpaid invoices."

"How much money is outstanding?"

Return:

- Invoice number
- Patient
- Clinic
- Total
- Amount paid
- Balance
- Due date
- Status

Only users with the appropriate permission may access financial information.

---

# 13. Inventory Tools

## get_low_stock_items

Example:

"What supplies are running low?"

Return:

- Product
- Current quantity
- Minimum quantity
- Suggested reorder quantity
- Clinic

---

## get_inventory_usage

Example:

"What supplies are we using the most?"

Return historical inventory movement data.

---

# 14. AI Business Insights

The AI can generate insights from real data.

Examples:

"Revenue increased 12% compared with the previous period."

"Clinic A generated the highest revenue."

"No-show appointments increased by 8%."

"Five inventory items are below minimum stock."

Every insight must be based on actual retrieved data.

---

# 15. AI Scheduling Assistance

The AI may help users find suitable appointment slots.

Example:

"Find a 60-minute slot for John next week."

The AI should:

1. Identify patient.
2. Identify required service.
3. Identify practitioner requirements.
4. Check clinic availability.
5. Check practitioner availability.
6. Check room/resource availability.
7. Detect conflicts.
8. Suggest available times.

The AI should NOT directly create an appointment unless the application explicitly supports an authorized action tool.

---

# 16. Action Tools

Read-only tools should be implemented first.

Later, controlled action tools can be added.

Examples:

create_appointment

reschedule_appointment

create_followup

create_invoice

send_reminder

record_payment

create_purchase_order

Action tools must require:

- Authentication
- Authorization
- Input validation
- Confirmation where appropriate
- Audit logging

---

# 17. Confirmation Rules

The AI should ask for confirmation before high-impact actions.

Examples:

"Would you like me to reschedule John's appointment from 2:00 PM to 4:00 PM?"

"Would you like me to send this reminder to 12 patients?"

"Would you like me to create this purchase order?"

Financial actions should generally require explicit confirmation.

---

# 18. AI Communication Style

The AI should be:

- Concise
- Professional
- Helpful
- Action-oriented
- Clear

Avoid unnecessarily long responses.

Example:

User:

"How are we doing this month?"

AI:

"You're at ₱842,500 in revenue this month, up 14% from the previous period.

Appointments: 286
Completed: 241
No-shows: 11
Outstanding invoices: ₱94,200

Your Davao clinic is currently the top-performing location."

---

# 19. AI Hallucination Prevention

Never fabricate:

- Revenue
- Patient information
- Appointment times
- Inventory quantities
- Payment status
- Business metrics

If data is unavailable:

"I don't have enough data to determine that."

Do not guess.

---

# 20. Medical Safety

CareFlow AI is an operational platform.

The AI must NOT:

- Diagnose medical conditions
- Prescribe medication
- Recommend medical treatment as a substitute for a professional
- Make clinical decisions
- Claim certainty about medical conditions

The AI may assist with administrative tasks and organization of information.

Clinical decisions remain with qualified professionals.

---

# 21. Patient Privacy

Minimize patient information sent to AI providers.

Only send data required for the task.

Avoid including:

- Unnecessary personal information
- Unnecessary medical information
- Sensitive information unrelated to the request

AI provider configuration should support appropriate data protection requirements for the deployment jurisdiction.

---

# 22. AI Audit Logging

Record:

- User
- Organization
- Session
- Tool invoked
- Timestamp
- Request type
- Success/failure

Avoid storing unnecessary sensitive patient data in AI logs.

---

# 23. AI Future Capabilities

Future versions may include:

- Predictive no-show detection
- Follow-up recommendations
- Revenue forecasting
- Inventory forecasting
- Appointment optimization
- Patient reactivation suggestions
- Business anomaly detection
- Marketing recommendations
- AI-generated content
- Lead analysis
- Marketing ROI analysis

These should be added only after the core AI tool architecture is stable.