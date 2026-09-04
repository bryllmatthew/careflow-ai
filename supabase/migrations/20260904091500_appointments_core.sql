-- ============================================================================
-- 0013 — Appointments (Phase 3)
--
-- docs/PRODUCT_SPEC.md section 6, docs/DATABASE_SCHEMA.md "appointments",
-- docs/ARCHITECTURE.md section 4.11 (this project's own plan document).
--
-- Deliberate scope decisions for this pass, recorded so they read as
-- decisions rather than gaps:
--   - No staff_availability / working-hours table yet. Double-booking
--     prevention (the hard safety requirement) is enforced below via a DB
--     EXCLUDE constraint, which does not depend on declared availability.
--     Warning when a booking falls outside a practitioner's working hours is
--     a real but separable feature, deferred rather than faked.
--   - No rooms/room_id. docs/DATABASE_SCHEMA.md lists it nullable and there
--     is no rooms management UI to populate it yet -- an unpopulatable FK
--     column is dead weight, not a real feature. Same reasoning as Phase 2's
--     deferred patient_clinics.
--   - staff_id references profiles directly, same as patients.assigned_
--     staff_id (migration 0011) -- there is still no dedicated staff table.
--   - Practitioner appointment access is clinic-scoped, not staff-scoped: the
--     permission catalogue (migration 0002) has no appointments.view.assigned
--     or appointments.update.assigned, and the practitioner role is seeded
--     with plain appointments.view/appointments.update covering the whole
--     clinic -- matching docs/AUTHORIZATION.md's Practitioner section, which
--     (unlike its Patient section) does not qualify appointment access to
--     "assigned" patients only. This policy enforces what is actually
--     granted, not a stricter reading the permission model doesn't express.
-- ============================================================================

create extension if not exists btree_gist with schema extensions;

-- patients and services predate this migration without the (id,
-- organization_id) composite-FK target that clinics already has (migration
-- 0001) -- add it now so appointments can reference both the same
-- structurally-safe way every other clinic-scoped table does.
alter table public.patients add constraint patients_id_org_uk unique (id, organization_id);
alter table public.services add constraint services_id_org_uk unique (id, organization_id);

create table public.appointments (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  clinic_id         uuid        not null,
  patient_id        uuid        not null,
  service_id        uuid        not null,
  -- Direct FK to profiles, not a staff table -- see header comment.
  staff_id          uuid        not null references public.profiles (id),
  start_at          timestamptz not null,
  end_at            timestamptz not null check (end_at > start_at),
  status            text        not null default 'pending'
                                check (status in (
                                  'pending', 'confirmed', 'checked_in', 'in_progress',
                                  'completed', 'cancelled', 'no_show', 'rescheduled'
                                )),
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint appointments_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint appointments_patient_fk foreign key (patient_id, organization_id)
    references public.patients (id, organization_id),
  constraint appointments_service_fk foreign key (service_id, organization_id)
    references public.services (id, organization_id)
);

comment on table public.appointments is
  'A booked slot for one patient with one practitioner (docs/PRODUCT_SPEC.md section 6). Duration/price come from service_id at booking time, not duplicated onto this row.';

create trigger appointments_set_updated_at
  before update on public.appointments
  for each row execute function public.set_updated_at();

create index appointments_org_ix on public.appointments (organization_id);
create index appointments_clinic_start_ix on public.appointments (clinic_id, start_at);
create index appointments_staff_start_ix on public.appointments (clinic_id, staff_id, start_at);
create index appointments_patient_start_ix on public.appointments (patient_id, start_at desc);

-- ----------------------------------------------------------------------------
-- Double-booking prevention -- a DB-level EXCLUDE constraint, not merely an
-- application check, because a race between two concurrent bookings must be
-- impossible to win, not just unlikely. Deliberately keyed on staff_id alone
-- (no clinic_id/organization_id in the exclusion) -- a practitioner is one
-- real person and cannot be in two places at once even across clinics or
-- organizations, so the exclusion is correctly tenant-agnostic here while
-- every read/write of the row it protects still goes through the RLS below.
--
-- 'cancelled', 'no_show' and 'rescheduled' are excluded from the guarded set:
-- a cancelled/no-show slot is not an active booking, and this app's
-- reschedule action moves start_at/end_at on the same row rather than
-- leaving a stale 'rescheduled' row behind (see actions.ts) -- 'rescheduled'
-- is kept in the CHECK constraint for schema completeness, not because this
-- codepath produces it today.
-- ----------------------------------------------------------------------------

alter table public.appointments add column time_range tstzrange
  generated always as (tstzrange(start_at, end_at, '[)')) stored;

alter table public.appointments add constraint appointments_no_staff_overlap
  exclude using gist (staff_id with =, time_range with &&)
  where (status not in ('cancelled', 'no_show', 'rescheduled'));

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.appointments enable row level security;

create policy appointments_select on public.appointments
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('appointments.view'))) );

create policy appointments_insert on public.appointments
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('appointments.create'))) );

-- One USING/WITH CHECK covers all three of update/cancel/reschedule -- the
-- database only sees "an UPDATE happened"; which of the three permissions
-- the caller actually needs for what they changed is enforced in
-- app/(app)/appointments/actions.ts, the same split Phase 2 used for
-- patients.update vs patients.delete on the archive action.
create policy appointments_update on public.appointments
  for update to authenticated
  using (
    clinic_id = any (select unnest(app.permitted_clinics('appointments.update')))
    or clinic_id = any (select unnest(app.permitted_clinics('appointments.cancel')))
    or clinic_id = any (select unnest(app.permitted_clinics('appointments.reschedule')))
  )
  with check (
    clinic_id = any (select unnest(app.permitted_clinics('appointments.update')))
    or clinic_id = any (select unnest(app.permitted_clinics('appointments.cancel')))
    or clinic_id = any (select unnest(app.permitted_clinics('appointments.reschedule')))
  );

-- No DELETE policy: cancellation is status = 'cancelled', never a physical
-- delete (docs/AUTHORIZATION.md section 12).

revoke update on public.appointments from authenticated;
grant update (staff_id, service_id, start_at, end_at, status, notes)
  on public.appointments to authenticated;
