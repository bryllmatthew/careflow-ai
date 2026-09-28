/**
 * Mirrors the seeded catalogue in
 * supabase/migrations/20260903072300_roles_and_permissions.sql. Kept as a
 * literal union (not generated) because the permission *set* is a slow-moving
 * design decision, not schema noise -- unlike lib/db/types.generated.ts, this
 * file is meant to be read and reviewed like code.
 */
export const PERMISSIONS = [
  "organization.view",
  "organization.update",
  "settings.manage",
  "integrations.manage",
  "audit.view",

  "clinic.view",
  "clinic.create",
  "clinic.update",
  "clinic.delete",

  "users.view",
  "users.invite",
  "users.update",
  "users.remove",
  "roles.view",
  "roles.manage",
  "staff.manage",

  "patients.view",
  "patients.view.assigned",
  "patients.create",
  "patients.update",
  "patients.delete",

  "appointments.view",
  "appointments.create",
  "appointments.update",
  "appointments.cancel",
  "appointments.reschedule",

  "services.view",
  "services.manage",

  "booking.view",
  "booking.manage",

  "dental.view",
  "dental.record",
  "dental.complete",

  "followups.view",
  "followups.create",
  "followups.manage",
  "reminders.view",
  "reminders.manage",
  "automations.view",
  "automations.manage",
  "notifications.view",
  "notifications.manage",

  "invoices.view",
  "invoices.create",
  "invoices.update",
  "invoices.issue",
  "invoices.void",
  "invoices.apply_discount",
  "payments.view",
  "payments.create",
  "payments.record_manual",
  "payments.process",
  "payments.refund",
  "payments.reconcile",
  "payments.manage",
  "sales.view",

  "inventory.view",
  "inventory.manage",
  "products.manage",
  "suppliers.view",
  "suppliers.manage",
  "purchase_orders.view",
  "purchase_orders.manage",

  "reports.view",
  "reports.financial",
  "reports.inventory",

  "ai.use",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
