# CareFlow AI — Authorization & Access Control Specification

## 1. Purpose

CareFlow AI is a multi-tenant SaaS application.

Users may belong to one or more organizations and may have access to one or more clinics.

Authorization must ensure that users can only access data and perform actions they are explicitly permitted to access.

Security must be enforced at the backend/database level.

Frontend restrictions are NOT sufficient.

---

# 2. Authorization Hierarchy

The access hierarchy is:

Organization
↓
Clinic
↓
User / Staff
↓
Resources

Examples:

Organization
- Clinic A
- Clinic B
- Clinic C

A user may have:

### Organization-level access

Access to all clinics within the organization.

### Clinic-level access

Access only to specific assigned clinics.

---

# 3. Roles

Initial system roles:

## Organization Owner

Full access to the organization.

Can:

- Manage organization
- Manage all clinics
- Manage users
- Manage roles
- Manage permissions
- View all patients
- View all appointments
- View all financial data
- View all inventory
- Manage integrations
- Manage billing/subscription
- Access all dashboards
- Configure organization settings

---

## Administrator

Operational management access.

Can:

- Manage clinics
- Manage staff
- Manage patients
- Manage appointments
- Manage services
- Manage invoices
- Manage payments
- Manage inventory
- View dashboards

Cannot:

- Transfer organization ownership
- Delete organization
- Modify platform-level configuration

---

## Clinic Manager

Access to assigned clinic(s).

Can:

- Manage clinic staff
- Manage patients
- Manage appointments
- Manage services
- Manage clinic inventory
- View clinic financial reports
- Manage follow-ups
- View clinic dashboard

Cannot access other clinics unless explicitly assigned.

---

## Practitioner

Examples:

- Dentist
- Doctor
- Therapist
- Aesthetic Practitioner

Can:

- View assigned patients
- View appointments
- Manage own availability
- Update appointment status
- Add service/treatment notes
- Create follow-ups
- View relevant patient history

Default restrictions:

- Cannot manage organization settings
- Cannot manage other users
- Cannot access organization-wide financial reporting
- Cannot modify inventory unless explicitly permitted

---

## Receptionist

Can:

- Create patients
- Edit patient contact information
- Schedule appointments
- Reschedule appointments
- Cancel appointments
- Confirm appointments
- Check patients in
- Create invoices
- Record permitted payments
- View appointment history
- Manage follow-ups

Cannot:

- Manage users
- Modify permissions
- Access sensitive organization-wide reports
- Modify inventory configuration unless permitted

---

## Finance

Can:

- View invoices
- Create invoices
- Edit invoices according to permission
- Record payments
- View payment history
- Process refunds where permitted
- View sales reports
- View financial dashboards
- Export financial reports

Cannot:

- Manage practitioners
- Manage appointments unless separately permitted
- Access unnecessary patient information

---

## Inventory Manager

Can:

- Manage products
- Manage inventory
- Record stock movements
- Manage suppliers
- Create purchase orders
- Receive inventory
- View inventory reports
- Configure low-stock thresholds

Cannot:

- Access financial data beyond information required for inventory operations
- Manage patients unless separately permitted

---

# 4. Permission-Based Authorization

Do not hardcode role checks everywhere.

Use permissions.

Example permissions:

organization.view

organization.update

clinic.view

clinic.create

clinic.update

clinic.delete

users.view

users.invite

users.update

users.remove

roles.view

roles.manage

patients.view

patients.create

patients.update

patients.delete

appointments.view

appointments.create

appointments.update

appointments.cancel

appointments.reschedule

services.view

services.manage

followups.view

followups.create

followups.manage

invoices.view

invoices.create

invoices.update

payments.view

payments.create

payments.refund

sales.view

inventory.view

inventory.manage

suppliers.view

suppliers.manage

purchase_orders.view

purchase_orders.manage

reports.view

reports.financial

reports.inventory

ai.use

settings.manage

---

# 5. Role vs Permission

Roles are collections of permissions.

Example:

Receptionist:

patients.view
patients.create
patients.update
appointments.view
appointments.create
appointments.update
appointments.cancel
followups.view
followups.create
invoices.view
invoices.create
payments.view

The application should check:

Does this user have permission X?

Rather than:

Is this user a receptionist?

This allows custom roles later.

---

# 6. Organization Isolation

Every organization-owned record must be associated with an organization_id.

Example:

patients.organization_id

appointments.organization_id

invoices.organization_id

payments.organization_id

inventory.organization_id

staff.organization_id

Users must never be able to retrieve another organization's records.

---

# 7. Clinic Isolation

Clinic-specific records must also contain:

clinic_id

A user assigned to Clinic A must not access Clinic B data unless their permissions explicitly allow organization-wide access.

Example:

User:

John

Assigned:

Clinic A

John requests:

Clinic B appointments

Result:

DENIED

---

# 8. Server-Side Authorization

Never trust:

- organization_id from frontend
- clinic_id from frontend
- user role from frontend
- permission flags from frontend

Determine the authenticated user from the server-side authentication context.

Then determine:

1. User identity
2. Organization membership
3. Clinic membership
4. Role
5. Permissions
6. Resource ownership

Only then execute the operation.

---

# 9. Database-Level Security

If using Supabase/PostgreSQL:

Use Row Level Security wherever appropriate.

Example conceptual policy:

A user may SELECT a patient only if:

user belongs to patient's organization

AND

user has access to patient's clinic

OR

user has organization-wide permission

Never rely exclusively on application code.

---

# 10. Resource Authorization

Authorization must be checked at the resource level.

Example:

User attempts:

UPDATE appointment ID 123

The backend must verify:

- Appointment exists
- Appointment belongs to the user's organization
- Appointment belongs to an accessible clinic
- User has appointment update permission

Only then perform update.

---

# 11. Sensitive Information

Patient information should follow least-privilege access.

Users should only receive information necessary for their role.

For example:

Inventory Manager does not need unrestricted access to patient financial information.

Practitioners should not automatically receive organization-wide financial reports.

---

# 12. Financial Operations

Financial operations require stricter permissions.

Examples:

Creating invoice:

invoices.create

Recording payment:

payments.create

Refund:

payments.refund

Viewing financial reports:

reports.financial

Deleting financial records should generally be prohibited.

Prefer:

- Void
- Cancel
- Refund
- Adjustment
- Audit trail

rather than physical deletion.

---

# 13. Audit Logging

Record security-sensitive actions.

Examples:

- User invited
- User removed
- Permission changed
- Patient created
- Patient updated
- Appointment modified
- Invoice modified
- Payment recorded
- Refund processed
- Inventory adjusted
- Organization settings changed

Audit log:

- organization_id
- user_id
- action
- entity_type
- entity_id
- timestamp
- metadata

Do not store unnecessary sensitive patient information in audit metadata.

---

# 14. Role Assignment

Only authorized users may modify roles.

Default:

Organization Owner
→ Can manage roles

Administrator
→ Can manage users but not organization ownership

Other roles
→ Cannot modify permissions unless explicitly granted

A user must never be able to grant themselves additional permissions.

---

# 15. Organization Membership

Users should have explicit organization membership.

Suggested structure:

organization_memberships

- id
- organization_id
- user_id
- status
- created_at

Possible statuses:

- invited
- active
- suspended
- removed

---

# 16. Clinic Membership

Users may belong to one or more clinics.

Suggested structure:

clinic_memberships

- id
- clinic_id
- user_id
- status
- created_at

This allows:

User A
→ Clinic A

User B
→ Clinic A + Clinic B

User C
→ All clinics

---

# 17. Authorization Helper

Create reusable authorization functions.

Conceptual examples:

can(user, permission)

canAccessOrganization(user, organizationId)

canAccessClinic(user, clinicId)

canAccessPatient(user, patientId)

canAccessAppointment(user, appointmentId)

canAccessInvoice(user, invoiceId)

These functions must be reusable throughout the application.

---

# 18. API Protection

Every protected API endpoint must:

1. Authenticate the user.
2. Determine organization membership.
3. Determine clinic access.
4. Check required permission.
5. Validate resource ownership.
6. Execute the operation.
7. Return only authorized data.

---

# 19. Frontend Authorization

Frontend authorization exists for UX only.

Examples:

Hide buttons the user cannot use.

Disable unavailable actions.

Hide navigation items.

But frontend authorization must NEVER be considered a security boundary.

Backend/database authorization remains authoritative.

---

# 20. Testing Authorization

Create automated tests for:

### Organization isolation

Organization A cannot access Organization B.

### Clinic isolation

Clinic A users cannot access Clinic B.

### Role restrictions

Receptionist cannot modify organization settings.

Practitioner cannot access financial reports unless permitted.

Inventory Manager cannot access unrelated patient information.

### Permission escalation

Users cannot grant themselves permissions.

### Resource ownership

A user cannot modify an appointment belonging to an inaccessible clinic.

Authorization tests are mandatory before declaring the MVP production-ready.