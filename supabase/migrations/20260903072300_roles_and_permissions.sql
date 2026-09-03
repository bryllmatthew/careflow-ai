-- ============================================================================
-- 0002 — Roles, permissions and role grants
--
-- docs/AUTHORIZATION.md sections 4, 5 and 14. The application asks "does this
-- user hold permission X for clinic Y?", never "is this user a receptionist?",
-- so roles are named bundles of permission strings and can be extended per
-- organization later.
--
-- Neither `permissions` nor `role_permissions` exists in docs/DATABASE_SCHEMA.md
-- even though the whole authorization model rests on them; both are added here.
--
-- RLS is enabled with no policies (deny-all) until 0003.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- permissions — the catalogue of permission strings
--
-- Not tenant data: the same catalogue applies platform-wide. `category` exists
-- only to group checkboxes in the role editor.
-- ----------------------------------------------------------------------------

create table public.permissions (
  key         text primary key check (key ~ '^[a-z_]+(\.[a-z_]+){1,2}$'),
  category    text not null,
  description text not null
);

comment on table public.permissions is
  'Catalogue of permission strings. Seeded by migration and immutable to client roles.';

insert into public.permissions (key, category, description) values
  ('organization.view',        'Organization', 'View organization profile and settings'),
  ('organization.update',      'Organization', 'Update organization profile and settings'),
  ('settings.manage',          'Organization', 'Manage organization-level settings'),
  ('integrations.manage',      'Organization', 'Connect and configure third-party integrations'),
  ('audit.view',               'Organization', 'View the audit log'),

  ('clinic.view',              'Clinics',      'View clinics'),
  ('clinic.create',            'Clinics',      'Create clinics'),
  ('clinic.update',            'Clinics',      'Update clinic details and operating hours'),
  ('clinic.delete',            'Clinics',      'Deactivate or delete clinics'),

  ('users.view',               'Users',        'View users and their role assignments'),
  ('users.invite',             'Users',        'Invite users to the organization'),
  ('users.update',             'Users',        'Update user records and membership status'),
  ('users.remove',             'Users',        'Remove users from the organization'),
  ('roles.view',               'Users',        'View roles and their permissions'),
  ('roles.manage',             'Users',        'Create roles and grant or revoke role assignments'),
  ('staff.manage',             'Users',        'Manage staff profiles, specialties and clinic assignments'),

  ('patients.view',            'Patients',     'View all patients in an accessible clinic'),
  ('patients.view.assigned',   'Patients',     'View only patients assigned to this practitioner'),
  ('patients.create',          'Patients',     'Create patients'),
  ('patients.update',          'Patients',     'Update patient records'),
  ('patients.delete',          'Patients',     'Soft-delete patients'),

  ('appointments.view',        'Scheduling',   'View appointments'),
  ('appointments.create',      'Scheduling',   'Book appointments'),
  ('appointments.update',      'Scheduling',   'Update appointment details and status'),
  ('appointments.cancel',      'Scheduling',   'Cancel appointments'),
  ('appointments.reschedule',  'Scheduling',   'Reschedule appointments'),

  ('services.view',            'Services',     'View the service catalogue'),
  ('services.manage',          'Services',     'Create and update services and pricing'),

  ('followups.view',           'Follow-ups',   'View follow-ups'),
  ('followups.create',         'Follow-ups',   'Create follow-ups'),
  ('followups.manage',         'Follow-ups',   'Complete, reassign and configure follow-up rules'),
  ('reminders.manage',         'Follow-ups',   'Manage reminder templates and scheduling'),

  ('invoices.view',            'Billing',      'View invoices'),
  ('invoices.create',          'Billing',      'Create invoices'),
  ('invoices.update',          'Billing',      'Update draft invoices'),
  ('invoices.void',            'Billing',      'Void an issued invoice'),
  ('payments.view',            'Billing',      'View payments'),
  ('payments.create',          'Billing',      'Record payments'),
  ('payments.refund',          'Billing',      'Process refunds'),
  ('sales.view',               'Billing',      'View sales'),

  ('inventory.view',           'Inventory',    'View stock levels and movements'),
  ('inventory.manage',         'Inventory',    'Adjust stock, record movements and set thresholds'),
  ('products.manage',          'Inventory',    'Manage the product catalogue'),
  ('suppliers.view',           'Inventory',    'View suppliers'),
  ('suppliers.manage',         'Inventory',    'Create and update suppliers'),
  ('purchase_orders.view',     'Inventory',    'View purchase orders'),
  ('purchase_orders.manage',   'Inventory',    'Create, send and receive purchase orders'),

  ('reports.view',             'Reports',      'View business reports and dashboards'),
  ('reports.financial',        'Reports',      'View and export financial reports'),
  ('reports.inventory',        'Reports',      'View and export inventory reports'),

  ('ai.use',                   'AI',           'Use the AI assistant');

-- ----------------------------------------------------------------------------
-- roles
--
-- organization_id IS NULL marks a system role, shared platform-wide. Per-org
-- custom roles carry their organization_id. docs/DATABASE_SCHEMA.md omitted
-- organization_id entirely, which made the spec's own "this allows custom roles
-- later" impossible.
-- ----------------------------------------------------------------------------

create table public.roles (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        references public.organizations (id) on delete cascade,
  key             text        not null check (key ~ '^[a-z][a-z0-9_]*$'),
  name            text        not null check (length(btrim(name)) between 1 and 100),
  description     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.roles.organization_id is
  'NULL marks a system role, seeded by migration and immutable to all client roles. Non-null marks a per-organization custom role.';

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function public.set_updated_at();

-- Two partial unique indexes rather than one four-column constraint: in
-- PostgreSQL NULL is never equal to NULL, so a plain UNIQUE including a
-- nullable organization_id would happily accept two `owner` system roles and
-- make role resolution non-deterministic.
create unique index roles_system_key_uk
  on public.roles (key) where organization_id is null;

create unique index roles_org_key_uk
  on public.roles (organization_id, key) where organization_id is not null;

-- ----------------------------------------------------------------------------
-- role_permissions
-- ----------------------------------------------------------------------------

create table public.role_permissions (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete restrict,
  primary key (role_id, permission_key)
);

-- Exact index for the authorization helpers' join direction.
create index role_permissions_perm_ix
  on public.role_permissions (permission_key) include (role_id);

-- ----------------------------------------------------------------------------
-- user_roles — a role grant, scoped to an organization or a single clinic
--
-- clinic_id IS NULL means the grant is ORGANIZATION-WIDE and therefore also
-- covers clinics created tomorrow. Non-null scopes it to that one clinic.
-- ----------------------------------------------------------------------------

create table public.user_roles (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  role_id         uuid        not null references public.roles (id) on delete restrict,
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  clinic_id       uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Composite FK. MATCH SIMPLE (the default) skips the check entirely when
  -- clinic_id IS NULL, which is exactly right for an org-wide grant. When it is
  -- non-null, the clinic must belong to this same organization -- otherwise a
  -- grant could point at another tenant's clinic and hand out access there.
  constraint user_roles_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id) on delete cascade
);

comment on column public.user_roles.clinic_id is
  'NULL means the grant is organization-wide (covers all clinics, including future ones). Non-null scopes it to that clinic only.';

create trigger user_roles_set_updated_at
  before update on public.user_roles
  for each row execute function public.set_updated_at();

-- Same NULL-inequality trap as `roles`: without the partial split, a plain
-- UNIQUE would accept unlimited duplicate organization-wide grants.
create unique index user_roles_clinic_grant_uk
  on public.user_roles (user_id, role_id, organization_id, clinic_id)
  where clinic_id is not null;

create unique index user_roles_orgwide_grant_uk
  on public.user_roles (user_id, role_id, organization_id)
  where clinic_id is null;

-- Authorization hot path: resolve every grant for the current user in one
-- index-only scan.
create index user_roles_user_ix
  on public.user_roles (user_id) include (organization_id, clinic_id, role_id);

-- Admin UI: list the grants within an organization.
create index user_roles_org_user_ix
  on public.user_roles (organization_id, user_id);

-- ----------------------------------------------------------------------------
-- A grant's role must be either a system role or a role owned by the same
-- organization. This cannot be a composite FK because roles.organization_id is
-- nullable, so it is a trigger.
-- ----------------------------------------------------------------------------

create or replace function public.assert_role_matches_organization()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_role_org uuid;
  v_found    boolean;
begin
  select r.organization_id, true
    into v_role_org, v_found
    from public.roles r
   where r.id = new.role_id;

  if not coalesce(v_found, false) then
    raise exception 'unknown role %', new.role_id using errcode = '23503';
  end if;

  if v_role_org is not null and v_role_org <> new.organization_id then
    raise exception 'role % belongs to a different organization', new.role_id
      using errcode = '23514';
  end if;

  return new;
end;
$fn$;

create trigger user_roles_role_org_consistency
  before insert or update on public.user_roles
  for each row execute function public.assert_role_matches_organization();

-- ----------------------------------------------------------------------------
-- System roles are platform-wide shared state.
--
-- `role_permissions` has no tenant column and roles.organization_id IS NULL
-- marks a system role, so one tenant editing the permissions of the `owner`
-- role would change them for EVERY tenant on the platform. That is a
-- platform-wide privilege escalation, not a tenant-local one.
--
-- System-role permissions are therefore seeded by migration and immutable to
-- every client role, enforced by a trigger rather than by RLS alone. The
-- trigger is bypassed only by the table owner running a migration.
-- ----------------------------------------------------------------------------

create or replace function public.assert_role_is_tenant_owned()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_role_org uuid;
begin
  select r.organization_id into v_role_org
    from public.roles r
   where r.id = coalesce(new.role_id, old.role_id);

  if v_role_org is null then
    raise exception 'system role permissions are immutable'
      using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$fn$;

create trigger role_permissions_no_system_writes
  before insert or update or delete on public.role_permissions
  for each row execute function public.assert_role_is_tenant_owned();

-- No client may mint a new system role.
create or replace function public.assert_role_is_org_scoped()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if new.organization_id is null then
    raise exception 'system roles may only be created by a migration'
      using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create trigger roles_no_client_system_roles
  before insert or update on public.roles
  for each row execute function public.assert_role_is_org_scoped();

-- ----------------------------------------------------------------------------
-- Seed the seven system roles (docs/AUTHORIZATION.md section 3).
--
-- ALTER TABLE ... DISABLE TRIGGER is used so the seed can create system roles
-- and their permissions, which the guards above otherwise forbid.
-- ----------------------------------------------------------------------------

alter table public.roles            disable trigger roles_no_client_system_roles;
alter table public.role_permissions disable trigger role_permissions_no_system_writes;

insert into public.roles (organization_id, key, name, description) values
  (null, 'owner',             'Organization Owner', 'Full access to the organization, including roles, billing and integrations.'),
  (null, 'admin',             'Administrator',      'Operational management across clinics, staff, patients, billing and inventory.'),
  (null, 'clinic_manager',    'Clinic Manager',     'Manages the clinics they are assigned to.'),
  (null, 'practitioner',      'Practitioner',       'Dentist, doctor, therapist or aesthetic practitioner. Sees their own patients and schedule.'),
  (null, 'receptionist',      'Receptionist',       'Front desk: patients, scheduling, check-in, invoices and payments.'),
  (null, 'finance',           'Finance',            'Invoicing, payments, refunds and financial reporting.'),
  (null, 'inventory_manager', 'Inventory Manager',  'Products, stock, suppliers and purchase orders.');

-- owner: every permission in the catalogue.
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
 cross join public.permissions p
 where r.organization_id is null and r.key = 'owner';

-- The remaining six roles, derived from the Can/Cannot prose in
-- docs/AUTHORIZATION.md section 3. Only the Receptionist mapping is actually
-- written out in the spec (section 5); the other five are authored here and
-- REQUIRE HUMAN REVIEW -- they define what every user of the system can do.
-- Deviations from a literal reading are commented inline.
insert into public.role_permissions (role_id, permission_key)
select r.id, x.permission_key
  from public.roles r
  join (values
    -- ---- admin ---------------------------------------------------------
    -- "Operational management access." Withheld: roles.manage (section 14
    -- reserves role management to the owner by default) and
    -- integrations.manage (section 3 forbids "platform-level configuration").
    ('admin', 'organization.view'), ('admin', 'organization.update'),
    ('admin', 'settings.manage'),   ('admin', 'audit.view'),
    ('admin', 'clinic.view'),       ('admin', 'clinic.create'),
    ('admin', 'clinic.update'),     ('admin', 'clinic.delete'),
    ('admin', 'users.view'),        ('admin', 'users.invite'),
    ('admin', 'users.update'),      ('admin', 'users.remove'),
    ('admin', 'roles.view'),        ('admin', 'staff.manage'),
    ('admin', 'patients.view'),     ('admin', 'patients.create'),
    ('admin', 'patients.update'),   ('admin', 'patients.delete'),
    ('admin', 'appointments.view'), ('admin', 'appointments.create'),
    ('admin', 'appointments.update'), ('admin', 'appointments.cancel'),
    ('admin', 'appointments.reschedule'),
    ('admin', 'services.view'),     ('admin', 'services.manage'),
    ('admin', 'followups.view'),    ('admin', 'followups.create'),
    ('admin', 'followups.manage'),  ('admin', 'reminders.manage'),
    ('admin', 'invoices.view'),     ('admin', 'invoices.create'),
    ('admin', 'invoices.update'),   ('admin', 'invoices.void'),
    ('admin', 'payments.view'),     ('admin', 'payments.create'),
    ('admin', 'payments.refund'),   ('admin', 'sales.view'),
    ('admin', 'inventory.view'),    ('admin', 'inventory.manage'),
    ('admin', 'products.manage'),   ('admin', 'suppliers.view'),
    ('admin', 'suppliers.manage'),  ('admin', 'purchase_orders.view'),
    ('admin', 'purchase_orders.manage'),
    ('admin', 'reports.view'),      ('admin', 'reports.financial'),
    ('admin', 'reports.inventory'), ('admin', 'ai.use'),

    -- ---- clinic_manager ------------------------------------------------
    -- "Access to assigned clinic(s)"; scope is enforced by user_roles.clinic_id,
    -- not by the permission set. clinic.update is granted so a manager can
    -- maintain operating hours (docs/PRODUCT_SPEC.md section 3). Withheld:
    -- clinic.create/delete, products.manage (org-level catalogue),
    -- users.remove, roles.manage, organization.update.
    ('clinic_manager', 'organization.view'),
    ('clinic_manager', 'clinic.view'),          ('clinic_manager', 'clinic.update'),
    ('clinic_manager', 'users.view'),           ('clinic_manager', 'users.invite'),
    ('clinic_manager', 'roles.view'),           ('clinic_manager', 'staff.manage'),
    ('clinic_manager', 'patients.view'),        ('clinic_manager', 'patients.create'),
    ('clinic_manager', 'patients.update'),
    ('clinic_manager', 'appointments.view'),    ('clinic_manager', 'appointments.create'),
    ('clinic_manager', 'appointments.update'),  ('clinic_manager', 'appointments.cancel'),
    ('clinic_manager', 'appointments.reschedule'),
    ('clinic_manager', 'services.view'),        ('clinic_manager', 'services.manage'),
    ('clinic_manager', 'followups.view'),       ('clinic_manager', 'followups.create'),
    ('clinic_manager', 'followups.manage'),     ('clinic_manager', 'reminders.manage'),
    ('clinic_manager', 'invoices.view'),        ('clinic_manager', 'invoices.create'),
    ('clinic_manager', 'invoices.update'),
    ('clinic_manager', 'payments.view'),        ('clinic_manager', 'payments.create'),
    ('clinic_manager', 'sales.view'),
    ('clinic_manager', 'inventory.view'),       ('clinic_manager', 'inventory.manage'),
    ('clinic_manager', 'reports.view'),         ('clinic_manager', 'reports.financial'),
    ('clinic_manager', 'reports.inventory'),    ('clinic_manager', 'ai.use'),

    -- ---- practitioner --------------------------------------------------
    -- Deliberately granted patients.view.assigned, NOT patients.view: section
    -- 128 says a practitioner views *assigned* patients, and a flat
    -- patients.view would expose every patient in the clinic. Row scope is
    -- applied by a second policy branch in 0003.
    -- Withheld: appointments.create/cancel/reschedule (booking is front-desk
    -- work), all billing, reports.financial, and inventory.
    ('practitioner', 'organization.view'),
    ('practitioner', 'clinic.view'),
    ('practitioner', 'patients.view.assigned'),
    ('practitioner', 'patients.update'),
    ('practitioner', 'appointments.view'),      ('practitioner', 'appointments.update'),
    ('practitioner', 'services.view'),
    ('practitioner', 'followups.view'),         ('practitioner', 'followups.create'),
    ('practitioner', 'reports.view'),           ('practitioner', 'ai.use'),

    -- ---- receptionist --------------------------------------------------
    -- The twelve permissions in docs/AUTHORIZATION.md section 5 verbatim, plus
    -- appointments.reschedule, payments.create ("record permitted payments"),
    -- followups.manage ("manage follow-ups") and services.view -- all four
    -- required by the section 3 prose but absent from the section 5 list.
    ('receptionist', 'clinic.view'),
    ('receptionist', 'patients.view'),          ('receptionist', 'patients.create'),
    ('receptionist', 'patients.update'),
    ('receptionist', 'appointments.view'),      ('receptionist', 'appointments.create'),
    ('receptionist', 'appointments.update'),    ('receptionist', 'appointments.cancel'),
    ('receptionist', 'appointments.reschedule'),
    ('receptionist', 'services.view'),
    ('receptionist', 'followups.view'),         ('receptionist', 'followups.create'),
    ('receptionist', 'followups.manage'),
    ('receptionist', 'invoices.view'),          ('receptionist', 'invoices.create'),
    ('receptionist', 'payments.view'),          ('receptionist', 'payments.create'),
    ('receptionist', 'ai.use'),

    -- ---- finance -------------------------------------------------------
    -- patients.view is granted because invoicing requires patient identity
    -- (docs/AI_TOOLS.md section 10 lists identity, invoices, payments and
    -- balances as Finance's view). Withheld: all scheduling, inventory,
    -- staff and user management.
    ('finance', 'organization.view'),
    ('finance', 'clinic.view'),
    ('finance', 'patients.view'),
    ('finance', 'services.view'),
    ('finance', 'invoices.view'),               ('finance', 'invoices.create'),
    ('finance', 'invoices.update'),             ('finance', 'invoices.void'),
    ('finance', 'payments.view'),               ('finance', 'payments.create'),
    ('finance', 'payments.refund'),             ('finance', 'sales.view'),
    ('finance', 'reports.view'),                ('finance', 'reports.financial'),
    ('finance', 'ai.use'),

    -- ---- inventory_manager ---------------------------------------------
    -- No patient access and no financial access beyond inventory reporting,
    -- per the section 3 Cannot list and section 11 (least privilege).
    ('inventory_manager', 'organization.view'),
    ('inventory_manager', 'clinic.view'),
    ('inventory_manager', 'inventory.view'),        ('inventory_manager', 'inventory.manage'),
    ('inventory_manager', 'products.manage'),
    ('inventory_manager', 'suppliers.view'),        ('inventory_manager', 'suppliers.manage'),
    ('inventory_manager', 'purchase_orders.view'),  ('inventory_manager', 'purchase_orders.manage'),
    ('inventory_manager', 'reports.view'),          ('inventory_manager', 'reports.inventory'),
    ('inventory_manager', 'ai.use')
  ) as x (role_key, permission_key) on x.role_key = r.key
 where r.organization_id is null;

alter table public.roles            enable trigger roles_no_client_system_roles;
alter table public.role_permissions enable trigger role_permissions_no_system_writes;

-- ----------------------------------------------------------------------------
-- Row Level Security — enabled, deny-all until 0003.
-- ----------------------------------------------------------------------------

alter table public.permissions      enable row level security;
alter table public.roles            enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles       enable row level security;
