-- ============================================================================
-- Patients negative-security suite (Phase 2)
--
-- Split into its own file rather than growing authorization_test.sql
-- indefinitely -- `supabase test db` runs every file under supabase/tests/
-- and each gets its own plan()/finish(), so this is a clean domain boundary,
-- not a change to how the suite runs. Merge gate per CLAUDE.md: run via
-- `pnpm test:rls`.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

create or replace function pg_temp.act_as(p_fixture_key text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting('fx.' || p_fixture_key), 'role', 'authenticated')::text,
    true);
$$;

-- ----------------------------------------------------------------------------
-- Fixture: two organizations, one clinic each, a receptionist (broad
-- patients.view) and a practitioner (patients.view.assigned only) in org A,
-- two patients in org A's clinic -- one assigned to the practitioner, one not
-- -- and one patient in org B's clinic.
-- ----------------------------------------------------------------------------

do $$
declare
  v_org_a uuid; v_org_b uuid;
  v_clinic_a uuid; v_clinic_b uuid;
  v_recept uuid; v_practitioner uuid; v_finance uuid;
  v_role_recept uuid; v_role_practitioner uuid; v_role_owner uuid; v_role_finance uuid;
  v_patient_assigned uuid; v_patient_unassigned uuid; v_patient_b uuid;
begin
  select id into v_role_recept       from public.roles where key = 'receptionist' and organization_id is null;
  select id into v_role_practitioner from public.roles where key = 'practitioner' and organization_id is null;
  select id into v_role_owner        from public.roles where key = 'owner' and organization_id is null;
  select id into v_role_finance      from public.roles where key = 'finance' and organization_id is null;

  insert into auth.users (id, email) values (gen_random_uuid(), 'pt-recept@fixture.test') returning id into v_recept;
  insert into auth.users (id, email) values (gen_random_uuid(), 'pt-practitioner@fixture.test') returning id into v_practitioner;
  -- finance holds no patients.* permission at all (migration 0002 seed) --
  -- the genuine "Test C: unauthorized user" case, distinct from
  -- practitioner/receptionist, who both legitimately hold patients.update.
  insert into auth.users (id, email) values (gen_random_uuid(), 'pt-finance@fixture.test') returning id into v_finance;

  insert into public.organizations (name) values ('Patients Fixture Org A') returning id into v_org_a;
  insert into public.organizations (name) values ('Patients Fixture Org B') returning id into v_org_b;
  insert into public.clinics (organization_id, name) values (v_org_a, 'Fixture Clinic A') returning id into v_clinic_a;
  insert into public.clinics (organization_id, name) values (v_org_b, 'Fixture Clinic B') returning id into v_clinic_b;

  insert into public.organization_memberships (organization_id, user_id, status) values
    (v_org_a, v_recept, 'active'),
    (v_org_a, v_practitioner, 'active'),
    (v_org_a, v_finance, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values
    (v_recept, v_role_recept, v_org_a, null),
    (v_practitioner, v_role_practitioner, v_org_a, null),
    (v_finance, v_role_finance, v_org_a, null);

  -- Owner of org B, needed to create patient_b as a legitimate org-B insert.
  declare v_owner_b uuid;
  begin
    insert into auth.users (id, email) values (gen_random_uuid(), 'pt-owner-b@fixture.test') returning id into v_owner_b;
    insert into public.organization_memberships (organization_id, user_id, status) values (v_org_b, v_owner_b, 'active');
    insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values (v_owner_b, v_role_owner, v_org_b, null);
    perform set_config('fx.owner_b', v_owner_b::text, false);
  end;

  perform set_config('fx.org_a', v_org_a::text, false);
  perform set_config('fx.org_b', v_org_b::text, false);
  perform set_config('fx.clinic_a', v_clinic_a::text, false);
  perform set_config('fx.clinic_b', v_clinic_b::text, false);
  perform set_config('fx.recept', v_recept::text, false);
  perform set_config('fx.finance', v_finance::text, false);
  perform set_config('fx.practitioner', v_practitioner::text, false);
end $$;

-- Insert the three patients as their respective org owners/receptionists
-- (through the real RLS path, not as the migration role), proving the
-- insert path itself works before testing denial paths.

set local role authenticated;
select pg_temp.act_as('recept');

insert into public.patients (organization_id, clinic_id, first_name, last_name, assigned_staff_id)
values (current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid, 'Assigned', 'Patient', current_setting('fx.practitioner')::uuid)
returning id as patient_assigned_id \gset
select set_config('fx.patient_assigned', :'patient_assigned_id', false);

insert into public.patients (organization_id, clinic_id, first_name, last_name)
values (current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid, 'Unassigned', 'Patient')
returning id as patient_unassigned_id \gset
select set_config('fx.patient_unassigned', :'patient_unassigned_id', false);

select pg_temp.act_as('owner_b');

insert into public.patients (organization_id, clinic_id, first_name, last_name)
values (current_setting('fx.org_b')::uuid, current_setting('fx.clinic_b')::uuid, 'Org B', 'Patient')
returning id as patient_b_id \gset
select set_config('fx.patient_b', :'patient_b_id', false);

-- ----------------------------------------------------------------------------
-- Test A: organization isolation
-- ----------------------------------------------------------------------------

select pg_temp.act_as('recept');

select is(
  (select count(*)::int from public.patients where id = current_setting('fx.patient_b')::uuid),
  0,
  'Test A: an org A receptionist cannot retrieve an org B patient'
);

select is(
  (select count(*)::int from public.patients where organization_id = current_setting('fx.org_a')::uuid),
  2,
  'a receptionist with broad patients.view sees both org A patients regardless of assignment'
);

-- ----------------------------------------------------------------------------
-- Test B: row-scope for practitioners (patients.view.assigned)
-- ----------------------------------------------------------------------------

select pg_temp.act_as('practitioner');

select is(
  (select count(*)::int from public.patients where id = current_setting('fx.patient_assigned')::uuid),
  1,
  'a practitioner sees a patient assigned to them'
);

select is(
  (select count(*)::int from public.patients where id = current_setting('fx.patient_unassigned')::uuid),
  0,
  'Test B (adapted): a practitioner (patients.view.assigned only) cannot see a patient assigned to someone else, even in their own clinic'
);

select is(
  (select count(*)::int from public.patients where id = current_setting('fx.patient_b')::uuid),
  0,
  'a practitioner cannot see a patient in another organization'
);

-- ----------------------------------------------------------------------------
-- Test C: unauthorized update. Uses finance, not practitioner: practitioner
-- and receptionist both legitimately hold patients.update in the seed
-- (migration 0002), so neither is the genuine "lacks the permission
-- entirely" case the spec's Test C asks for -- finance holds no patients.*
-- permission at all.
-- ----------------------------------------------------------------------------

-- An UPDATE denied by a false USING clause is a silent 0-row update, not a
-- thrown exception -- RLS filters rows for UPDATE/SELECT the way a WHERE
-- clause does; only INSERT's WITH CHECK raises 42501 on the row it is
-- actively trying to create. Same pattern already found for
-- organization_memberships in Task 1.6 (authorization_test.sql). Assert on
-- the row staying unchanged, read back through an authorized session, not
-- on an exception.
select pg_temp.act_as('finance');
update public.patients set notes = 'sneaky' where id = current_setting('fx.patient_unassigned')::uuid;

select pg_temp.act_as('recept');
select is(
  (select notes from public.patients where id = current_setting('fx.patient_unassigned')::uuid),
  null,
  'Test C: a user with no patients.update grant (finance) cannot update a patient -- the row is left unchanged'
);

-- practitioner DOES hold patients.update (migration 0002 seed), and the
-- patients_update POLICY's own USING/WITH CHECK is not assignment-scoped --
-- but PostgreSQL requires a row to be SELECT-visible before UPDATE can
-- locate it at all, and this practitioner cannot SELECT the unassigned
-- patient (only patients.view.assigned, not assigned to them). Net effect:
-- the update silently matches 0 rows, not because of anything in the UPDATE
-- policy, but because the row was never reachable to begin with. Confirmed
-- directly via psql before writing this assertion (see migration 0011's
-- updated comment) -- this was NOT the original expectation and changed
-- both the migration's comment and this test.
select pg_temp.act_as('practitioner');
update public.patients set notes = 'practitioner note' where id = current_setting('fx.patient_unassigned')::uuid;

select pg_temp.act_as('recept');
select is(
  (select notes from public.patients where id = current_setting('fx.patient_unassigned')::uuid),
  null,
  'a practitioner CANNOT update a patient they cannot even see, despite holding patients.update -- SELECT-visibility gates UPDATE targeting in Postgres RLS, not just the UPDATE policy itself'
);

-- The positive case: the practitioner CAN update their assigned patient,
-- since patients_select_assigned makes that row visible to them.
select pg_temp.act_as('practitioner');
update public.patients set notes = 'practitioner note on assigned patient' where id = current_setting('fx.patient_assigned')::uuid;
select is(
  (select notes from public.patients where id = current_setting('fx.patient_assigned')::uuid),
  'practitioner note on assigned patient',
  'a practitioner CAN update their own assigned patient'
);

-- ----------------------------------------------------------------------------
-- Insert denial: practitioner lacks patients.create. Re-establish
-- act_as('practitioner') -- the previous block ended on recept (for the
-- readback).
-- ----------------------------------------------------------------------------

select pg_temp.act_as('practitioner');

select throws_ok(
  format($sql$insert into public.patients (organization_id, clinic_id, first_name, last_name) values (%L::uuid, %L::uuid, 'Sneaky', 'Insert')$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a')),
  '42501',
  null,
  'a practitioner (no patients.create grant) cannot insert a patient'
);

-- ----------------------------------------------------------------------------
-- Cross-tenant clinic_id on insert -- composite FK, not just RLS. Run at
-- elevated privilege (reset role): for any REAL authenticated actor,
-- permitted_clinics('patients.create') only ever returns clinics that
-- genuinely belong to an org they have a grant in, so the RLS WITH CHECK
-- would always reject a cross-org clinic_id before the FK gets a chance to
-- -- confirmed live (this test originally asserted 23503 as an authenticated
-- receptionist and got 42501 instead). Testing the FK specifically requires
-- bypassing RLS, exactly like the equivalent clinics test in
-- authorization_test.sql.
-- ----------------------------------------------------------------------------

reset role;

select throws_ok(
  format($sql$insert into public.patients (organization_id, clinic_id, first_name, last_name) values (%L::uuid, %L::uuid, 'Cross', 'Tenant')$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_b')),
  '23503',
  null,
  'a patient referencing a clinic from a different organization is rejected by the composite foreign key'
);

-- ----------------------------------------------------------------------------
-- Column immutability. Back to the normal authenticated/recept context after
-- the elevated-privilege FK test above.
-- ----------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('recept');

select throws_ok(
  format('update public.patients set organization_id = %L::uuid where id = %L::uuid',
         current_setting('fx.org_b'), current_setting('fx.patient_assigned')),
  '42501',
  null,
  'a receptionist cannot move a patient into another organization by updating organization_id'
);

select throws_ok(
  format('update public.patients set clinic_id = %L::uuid where id = %L::uuid',
         current_setting('fx.clinic_b'), current_setting('fx.patient_assigned')),
  '42501',
  null,
  'a receptionist cannot move a patient to a clinic in another organization by updating clinic_id'
);

-- Proves the column revoke above is not over-broad.
update public.patients set notes = 'updated by receptionist' where id = current_setting('fx.patient_assigned')::uuid;
select is(
  (select notes from public.patients where id = current_setting('fx.patient_assigned')::uuid),
  'updated by receptionist',
  'a receptionist CAN still update an ordinary column (notes)'
);

-- ----------------------------------------------------------------------------
-- Search text stays in sync (generated column correctness, not RLS, but
-- cheap to prove here since the fixture already exists)
-- ----------------------------------------------------------------------------

-- Compares against the real function rather than a hand-derived literal --
-- the exact spacing from concatenating two empty (phone/email) fields with
-- their separators is easy to miscount by hand and not the property worth
-- testing; that the generated column matches the function it's generated
-- from is.
select is(
  (select search_text from public.patients where id = current_setting('fx.patient_assigned')::uuid),
  public.patient_search_text('Assigned', 'Patient', null, null, current_setting('fx.patient_assigned')::uuid),
  'search_text matches patient_search_text() for the same inputs'
);

-- ----------------------------------------------------------------------------
-- Archive is a plain status update at the RLS layer (patients.delete is
-- enforced in the application action, not a separate RLS permission -- same
-- split as clinics' deleteClinicAction). Confirms a receptionist (who does
-- NOT hold patients.delete in the seed) can still perform the underlying
-- UPDATE at the database level; the application layer is what would deny
-- them before ever issuing it.
-- ----------------------------------------------------------------------------

update public.patients set status = 'archived' where id = current_setting('fx.patient_unassigned')::uuid;
select is(
  (select status from public.patients where id = current_setting('fx.patient_unassigned')::uuid),
  'archived',
  'archiving is a plain status update permitted by patients.update at the RLS layer (patients.delete is an application-layer gate, documented in migration 0011)'
);

-- ----------------------------------------------------------------------------
select * from finish();
rollback;
