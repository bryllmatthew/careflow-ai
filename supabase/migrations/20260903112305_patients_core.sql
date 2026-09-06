-- ============================================================================
-- 0011 — Patients (Phase 2)
--
-- The permissions this migration relies on (patients.view, patients.view.
-- assigned, patients.create, patients.update, patients.delete) were already
-- seeded per role in migration 0002, including a deliberate comment that the
-- row-scope split for practitioners would land "in a second policy branch"
-- once the table existed. This is that migration.
--
-- Deliberate deviations from docs/DATABASE_SCHEMA.md, already recorded in
-- CLAUDE.md before this table existed:
--   - clinic_id (not the spec's nullable primary_clinic_id), NOT NULL, same
--     convention as every other clinic-scoped table. A patient shared across
--     branches is a `patient_clinics` join table -- explicitly out of scope
--     until a real multi-clinic-shared-patient need exists (CLAUDE.md).
--   - gender and assigned_staff_id added: PRODUCT_SPEC.md section 5 lists
--     both ("Gender where applicable", "Assigned practitioner") but
--     DATABASE_SCHEMA.md's field list omits them.
-- New deviation, recorded here and mirrored into CLAUDE.md below:
--   - No separate deleted_at. Patients already have a three-state status
--     (active/inactive/archived) where 'archived' IS the soft-delete
--     mechanism the Phase 2 spec asks for ("use soft deletion/archive
--     behavior") -- a second deleted_at column would be a redundant, harder
--     to reason about SECOND soft-delete mechanism on the same table.
-- ============================================================================

create extension if not exists pg_trgm with schema extensions;

create table public.patients (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  clinic_id         uuid        not null,
  first_name        text        not null check (length(btrim(first_name)) between 1 and 100),
  last_name         text        not null check (length(btrim(last_name)) between 1 and 100),
  email             text,
  phone             text,
  date_of_birth     date,
  gender            text        check (gender in ('female', 'male', 'other', 'prefer_not_to_say')),
  address           text,
  notes             text,
  -- Direct FK to profiles rather than a dedicated staff table -- Staff
  -- Management is its own future nav item/module (lib/navigation.ts already
  -- reserves "Staff" as a placeholder route); a practitioner IS the
  -- profile/auth user in the current model, so no extra indirection is
  -- needed to answer "which patients is this practitioner assigned to".
  assigned_staff_id uuid        references public.profiles (id) on delete set null,
  status            text        not null default 'active'
                                check (status in ('active', 'inactive', 'archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- MATCH SIMPLE composite FK: cannot reference a clinic in another
  -- organization, structurally, not just by policy. See CLAUDE.md.
  constraint patients_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id)
);

comment on table public.patients is
  'The centralized patient/client record (docs/PRODUCT_SPEC.md section 5). status=''archived'' is the soft-delete mechanism -- there is no separate deleted_at column, see this migration''s header comment.';

comment on column public.patients.assigned_staff_id is
  'The practitioner primarily responsible for this patient. Gates patients.view.assigned in the RLS policy below -- a practitioner with only that permission (not the broader patients.view) sees just their assigned patients.';

create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------

create index patients_org_ix on public.patients (organization_id);
create index patients_clinic_status_ix on public.patients (clinic_id, status);
create index patients_assigned_staff_ix on public.patients (assigned_staff_id) where assigned_staff_id is not null;

-- One trigram index serves every search field the Phase 2 spec asks for
-- (first/last/full name, phone, email, and the short display id below) via a
-- single ILIKE-style match, so the search query never has to fall back to a
-- sequential scan as the table grows. Generated + stored so it is indexable
-- and never drifts from the source columns.
create or replace function public.patient_search_text(
  p_first_name text, p_last_name text, p_phone text, p_email text, p_id uuid
) returns text
language sql
immutable
as $fn$
  select lower(
    p_first_name || ' ' || p_last_name || ' ' ||
    coalesce(p_phone, '') || ' ' || coalesce(p_email, '') || ' ' ||
    right(p_id::text, 8)
  )
$fn$;

alter table public.patients add column search_text text
  generated always as (
    public.patient_search_text(first_name, last_name, phone, email, id)
  ) stored;

create index patients_search_trgm_ix on public.patients using gin (search_text extensions.gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.patients enable row level security;

-- Two permissive policies, OR'd together by Postgres: broad clinic access via
-- patients.view, or narrow assigned-only access via patients.view.assigned.
-- A practitioner holding only the latter (the seeded default -- see migration
-- 0002) sees exactly their own assigned patients within clinics that grant
-- covers; a receptionist/admin/clinic_manager holding patients.view sees
-- everyone in their accessible clinics, matching every other table's pattern.
create policy patients_select_broad on public.patients
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('patients.view'))) );

create policy patients_select_assigned on public.patients
  for select to authenticated
  using (
    assigned_staff_id = (select auth.uid())
    and clinic_id = any (select unnest(app.permitted_clinics('patients.view.assigned')))
  );

create policy patients_insert on public.patients
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('patients.create'))) );

-- patients.update's own USING/WITH CHECK is not row-scoped to
-- assigned_staff_id: the permission catalogue (migration 0002) has no
-- patients.update.assigned, and a practitioner is seeded with plain
-- patients.update -- this policy enforces what is actually granted, not a
-- stricter reading of intent the permission model itself does not express.
--
-- In practice this ends up narrower than it looks, and correctly so:
-- PostgreSQL requires a row to be visible under the table's SELECT policies
-- before UPDATE can locate it to apply this policy's USING clause at all --
-- confirmed live (supabase/tests/patients_test.sql). A practitioner holding
-- only patients.view.assigned therefore cannot update a patient who is not
-- assigned to them, even though this UPDATE policy alone would allow it,
-- because they can never SELECT that row in the first place. The failure
-- mode is "0 rows updated", not an exception -- RLS filters UPDATE targets
-- the way a WHERE clause does, and only INSERT's WITH CHECK raises 42501 on
-- the row it is actively trying to create.
create policy patients_update on public.patients
  for update to authenticated
  using      ( clinic_id = any (select unnest(app.permitted_clinics('patients.update'))) )
  with check ( clinic_id = any (select unnest(app.permitted_clinics('patients.update'))) );

-- No DELETE policy: archiving is an UPDATE (status='archived'), gated by
-- patients.delete in application code (app/(app)/patients/actions.ts), never
-- a physical delete. Matches "prefer void/cancel/archive over deletion"
-- (docs/AUTHORIZATION.md section 12) and this table's own no-deleted_at
-- design above.

-- RLS cannot express column immutability, and (per the real bug found and
-- fixed in migration 0007) a column-level REVOKE is a no-op when the
-- privilege came from Supabase's default table-level grant -- the table-level
-- grant must be revoked first, then re-granted on exactly the columns a
-- client should be able to write.
revoke update on public.patients from authenticated;
grant update (
  first_name, last_name, email, phone, date_of_birth, gender, address, notes,
  assigned_staff_id, status
) on public.patients to authenticated;
