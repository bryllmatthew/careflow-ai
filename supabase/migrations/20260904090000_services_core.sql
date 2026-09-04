-- ============================================================================
-- 0012 — Services (Phase 3 prerequisite)
--
-- CLAUDE.md's "Deliberate deviations" already records why this comes before
-- Scheduling: appointments.service_id supplies duration, price and
-- practitioner requirements, so appointments cannot be booked meaningfully
-- without a service catalogue existing first. services.view/manage were
-- already seeded per role in migration 0002.
--
-- Same shape as clinics/patients: org + clinic scoped, composite FK to
-- clinics, soft-deleted via deleted_at (services are a catalogue entity, not
-- a financial record, so deleted_at applies -- unlike invoices/payments).
-- ============================================================================

create table public.services (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  clinic_id         uuid        not null,
  name              text        not null check (length(btrim(name)) between 1 and 200),
  description       text,
  duration_minutes  integer     not null check (duration_minutes > 0 and duration_minutes <= 1440),
  price             numeric(14, 2) not null default 0 check (price >= 0),
  -- Internal cost, distinct from patient-facing price -- docs/DATABASE_SCHEMA.md
  -- lists it nullable (not every clinic tracks cost per service).
  cost              numeric(14, 2) check (cost is null or cost >= 0),
  status            text        not null default 'active'
                                check (status in ('active', 'inactive')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint services_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id)
);

comment on table public.services is
  'The clinic''s bookable service catalogue (docs/PRODUCT_SPEC.md section 11). Supplies duration/price/status to appointments.service_id.';

create trigger services_set_updated_at
  before update on public.services
  for each row execute function public.set_updated_at();

create index services_org_ix on public.services (organization_id);
create index services_clinic_status_ix on public.services (clinic_id, status) where deleted_at is null;

create unique index services_clinic_name_uk
  on public.services (clinic_id, lower(btrim(name)))
  where deleted_at is null;

-- ----------------------------------------------------------------------------
-- Row Level Security -- identical shape to clinics (migration 0003).
-- ----------------------------------------------------------------------------

alter table public.services enable row level security;

create policy services_select on public.services
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('services.view'))) );

create policy services_insert on public.services
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('services.manage'))) );

create policy services_update on public.services
  for update to authenticated
  using      ( clinic_id = any (select unnest(app.permitted_clinics('services.manage'))) )
  with check ( clinic_id = any (select unnest(app.permitted_clinics('services.manage'))) );

-- No DELETE policy: services are soft-deleted (deleted_at) via UPDATE, gated
-- by the same services.manage permission -- matches clinics' pattern, and
-- keeps a service usable as a historical reference on old appointments/
-- invoices even after it's retired from the active catalogue.

revoke update on public.services from authenticated;
grant update (name, description, duration_minutes, price, cost, status, deleted_at)
  on public.services to authenticated;
