-- ============================================================================
-- Appointments negative-security suite (Phase 3)
--
-- Covers what's actually new in migration 0013 beyond the already-proven
-- clinic-scoped RLS shape: the update policy ORing three separate
-- permissions (update/cancel/reschedule), and the EXCLUDE constraint that
-- makes double-booking impossible even at the database level.
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

do $$
declare
  v_org_a uuid; v_org_b uuid;
  v_clinic_a uuid; v_clinic_b uuid;
  v_recept uuid; v_practitioner uuid; v_owner_b uuid; v_canceler uuid;
  v_role_recept uuid; v_role_practitioner uuid; v_role_owner uuid;
  v_role_cancel_only uuid;
  v_patient_a uuid; v_patient_b uuid;
  v_service_a uuid;
begin
  select id into v_role_recept       from public.roles where key = 'receptionist' and organization_id is null;
  select id into v_role_practitioner from public.roles where key = 'practitioner' and organization_id is null;
  select id into v_role_owner        from public.roles where key = 'owner' and organization_id is null;

  insert into auth.users (id, email) values (gen_random_uuid(), 'ap-recept@fixture.test') returning id into v_recept;
  -- practitioner holds appointments.view + appointments.update only (migration
  -- 0002 seed) -- no create/cancel/reschedule, and NOT staff-scoped: the
  -- positive test below proves they can update ANY clinic appointment, not
  -- just ones where they are staff_id.
  insert into auth.users (id, email) values (gen_random_uuid(), 'ap-practitioner@fixture.test') returning id into v_practitioner;
  insert into auth.users (id, email) values (gen_random_uuid(), 'ap-owner-b@fixture.test') returning id into v_owner_b;
  -- Custom org-scoped role holding ONLY appointments.cancel, to prove the
  -- update policy's three-way OR actually grants access via cancel alone,
  -- not just via appointments.update.
  insert into auth.users (id, email) values (gen_random_uuid(), 'ap-canceler@fixture.test') returning id into v_canceler;

  insert into public.organizations (name) values ('Appointments Fixture Org A') returning id into v_org_a;
  insert into public.organizations (name) values ('Appointments Fixture Org B') returning id into v_org_b;
  insert into public.clinics (organization_id, name) values (v_org_a, 'Fixture Clinic A') returning id into v_clinic_a;
  insert into public.clinics (organization_id, name) values (v_org_b, 'Fixture Clinic B') returning id into v_clinic_b;

  insert into public.organization_memberships (organization_id, user_id, status) values
    (v_org_a, v_recept, 'active'),
    (v_org_a, v_practitioner, 'active'),
    (v_org_a, v_canceler, 'active'),
    (v_org_b, v_owner_b, 'active');

  insert into public.roles (organization_id, key, name) values
    (v_org_a, 'cancel_only', 'Cancel Only (fixture)') returning id into v_role_cancel_only;
  insert into public.role_permissions (role_id, permission_key) values
    (v_role_cancel_only, 'appointments.view'),
    (v_role_cancel_only, 'appointments.cancel');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values
    (v_recept, v_role_recept, v_org_a, null),
    (v_practitioner, v_role_practitioner, v_org_a, null),
    (v_canceler, v_role_cancel_only, v_org_a, null),
    (v_owner_b, v_role_owner, v_org_b, null);

  insert into public.patients (organization_id, clinic_id, first_name, last_name)
    values (v_org_a, v_clinic_a, 'Ada', 'Fixture') returning id into v_patient_a;
  insert into public.patients (organization_id, clinic_id, first_name, last_name)
    values (v_org_b, v_clinic_b, 'Bea', 'Fixture') returning id into v_patient_b;

  insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
    values (v_org_a, v_clinic_a, 'Consultation', 30, 500) returning id into v_service_a;

  perform set_config('fx.org_a', v_org_a::text, false);
  perform set_config('fx.org_b', v_org_b::text, false);
  perform set_config('fx.clinic_a', v_clinic_a::text, false);
  perform set_config('fx.clinic_b', v_clinic_b::text, false);
  perform set_config('fx.recept', v_recept::text, false);
  perform set_config('fx.practitioner', v_practitioner::text, false);
  perform set_config('fx.owner_b', v_owner_b::text, false);
  perform set_config('fx.canceler', v_canceler::text, false);
  perform set_config('fx.patient_a', v_patient_a::text, false);
  perform set_config('fx.patient_b', v_patient_b::text, false);
  perform set_config('fx.service_a', v_service_a::text, false);
end $$;

set local role authenticated;
select pg_temp.act_as('recept');

insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at)
values (
  current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid,
  current_setting('fx.patient_a')::uuid, current_setting('fx.service_a')::uuid,
  current_setting('fx.practitioner')::uuid,
  '2026-01-05 09:00+00', '2026-01-05 09:30+00'
)
returning id as appt_a_id \gset
select set_config('fx.appt_a', :'appt_a_id', false);

select pg_temp.act_as('owner_b');

insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
values (current_setting('fx.org_b')::uuid, current_setting('fx.clinic_b')::uuid, 'Org B Service', 30, 500)
returning id as service_b_id \gset

insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at)
values (
  current_setting('fx.org_b')::uuid, current_setting('fx.clinic_b')::uuid,
  current_setting('fx.patient_b')::uuid, :'service_b_id'::uuid,
  current_setting('fx.owner_b')::uuid,
  '2026-01-05 09:00+00', '2026-01-05 09:30+00'
)
returning id as appt_b_id \gset
select set_config('fx.appt_b', :'appt_b_id', false);

-- ----------------------------------------------------------------------------
-- Org isolation
-- ----------------------------------------------------------------------------

select pg_temp.act_as('recept');

select is(
  (select count(*)::int from public.appointments where id = current_setting('fx.appt_b')::uuid),
  0,
  'Test A: an org A receptionist cannot retrieve an org B appointment'
);

select is(
  (select count(*)::int from public.appointments where id = current_setting('fx.appt_a')::uuid),
  1,
  'the receptionist sees the org A appointment they created'
);

-- ----------------------------------------------------------------------------
-- Practitioner access is clinic-scoped, not staff-scoped (see migration
-- 0013's header comment) -- they see every appointment in an accessible
-- clinic, not only ones where they are staff_id.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('practitioner');

select is(
  (select count(*)::int from public.appointments where id = current_setting('fx.appt_a')::uuid),
  1,
  'a practitioner with clinic-scoped appointments.view sees the appointment (they ARE staff_id here, but the policy does not require it)'
);

-- ----------------------------------------------------------------------------
-- Insert denial: practitioner lacks appointments.create (booking is
-- front-desk's job -- migration 0002's seed comment).
-- ----------------------------------------------------------------------------

select throws_ok(
  format($sql$insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at) values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid, '2026-02-01 09:00+00', '2026-02-01 09:30+00')$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a'), current_setting('fx.patient_a'),
         current_setting('fx.service_a'), current_setting('fx.practitioner')),
  '42501',
  null,
  'a practitioner (no appointments.create grant) cannot book an appointment'
);

-- ----------------------------------------------------------------------------
-- Practitioner CAN update the appointment's status -- proving appointments.
-- update is clinic-scoped, not restricted to appointments where they are staff.
-- ----------------------------------------------------------------------------

update public.appointments set status = 'confirmed' where id = current_setting('fx.appt_a')::uuid;
select is(
  (select status from public.appointments where id = current_setting('fx.appt_a')::uuid),
  'confirmed',
  'a practitioner CAN update an appointment status via appointments.update'
);

-- ----------------------------------------------------------------------------
-- Cross-org isolation on UPDATE: owner_b has zero grants in org A, so this is
-- a silent 0-row update (SELECT-visibility gates UPDATE targeting), same
-- pattern documented in migration 0011 / patients_test.sql.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('owner_b');
update public.appointments set notes = 'sneaky' where id = current_setting('fx.appt_a')::uuid;

select pg_temp.act_as('recept');
select is(
  (select notes from public.appointments where id = current_setting('fx.appt_a')::uuid),
  null,
  'an org B user cannot update an org A appointment -- the row is left unchanged'
);

-- ----------------------------------------------------------------------------
-- The update policy's three-way OR: a custom role holding ONLY
-- appointments.cancel (not appointments.update) can still perform the
-- UPDATE, proving the OR actually grants access via cancel alone.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('canceler');
update public.appointments set status = 'cancelled' where id = current_setting('fx.appt_a')::uuid;
select is(
  (select status from public.appointments where id = current_setting('fx.appt_a')::uuid),
  'cancelled',
  'a role holding ONLY appointments.cancel (not appointments.update) can still cancel an appointment -- the update policy''s three-way OR works'
);

-- ----------------------------------------------------------------------------
-- Double-booking prevention (the EXCLUDE constraint)
-- ----------------------------------------------------------------------------

select pg_temp.act_as('recept');

-- appt_a is now cancelled, so it no longer occupies the 09:00-09:30 slot for
-- this staff member -- a new active booking at the exact same time succeeds.
insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at)
values (
  current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid,
  current_setting('fx.patient_a')::uuid, current_setting('fx.service_a')::uuid,
  current_setting('fx.practitioner')::uuid,
  '2026-01-05 09:00+00', '2026-01-05 09:30+00'
)
returning id as appt_d_id \gset
select set_config('fx.appt_d', :'appt_d_id', false);

select is(
  (select count(*)::int from public.appointments where id = current_setting('fx.appt_d')::uuid and status <> 'cancelled'),
  1,
  'once the original booking is cancelled, a new active booking for the same staff and time succeeds'
);

-- A second ACTIVE booking overlapping appt_d (same staff, same window) is
-- rejected by the EXCLUDE constraint -- this is what makes double-booking
-- structurally impossible, not just discouraged by application code.
select throws_ok(
  format($sql$insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at) values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid, '2026-01-05 09:15+00', '2026-01-05 09:45+00')$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a'), current_setting('fx.patient_a'),
         current_setting('fx.service_a'), current_setting('fx.practitioner')),
  '23P01',
  null,
  'a second active, overlapping booking for the same staff member is rejected by the EXCLUDE constraint'
);

-- A back-to-back booking (starts exactly when appt_d ends) is NOT an overlap
-- -- the range is half-open ('['/')'), so this must succeed.
insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at)
values (
  current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid,
  current_setting('fx.patient_a')::uuid, current_setting('fx.service_a')::uuid,
  current_setting('fx.practitioner')::uuid,
  '2026-01-05 09:30+00', '2026-01-05 10:00+00'
)
returning id as appt_e_id \gset

select is(
  (select count(*)::int from public.appointments where id = :'appt_e_id'::uuid),
  1,
  'a back-to-back booking starting exactly when the previous one ends is not an overlap and succeeds'
);

-- ----------------------------------------------------------------------------
-- Composite FK: an appointment cannot reference a patient from another
-- organization. Tested at elevated privilege (reset role), matching
-- patients_test.sql -- for any real authenticated actor, the RLS WITH CHECK
-- would reject the cross-org clinic_id/patient_id before the FK is reached.
-- ----------------------------------------------------------------------------

reset role;

select throws_ok(
  format($sql$insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at) values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, %L::uuid, '2026-03-01 09:00+00', '2026-03-01 09:30+00')$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a'), current_setting('fx.patient_b'),
         current_setting('fx.service_a'), current_setting('fx.practitioner')),
  '23503',
  null,
  'an appointment referencing a patient from a different organization is rejected by the composite foreign key'
);

-- ----------------------------------------------------------------------------
-- Column immutability
-- ----------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('recept');

select throws_ok(
  format('update public.appointments set organization_id = %L::uuid where id = %L::uuid',
         current_setting('fx.org_b'), current_setting('fx.appt_a')),
  '42501',
  null,
  'a receptionist cannot move an appointment into another organization'
);

select throws_ok(
  format('update public.appointments set clinic_id = %L::uuid where id = %L::uuid',
         current_setting('fx.clinic_b'), current_setting('fx.appt_a')),
  '42501',
  null,
  'a receptionist cannot move an appointment to a clinic in another organization'
);

select throws_ok(
  format('update public.appointments set patient_id = %L::uuid where id = %L::uuid',
         current_setting('fx.patient_b'), current_setting('fx.appt_a')),
  '42501',
  null,
  'a receptionist cannot reassign an appointment to a different patient by updating patient_id'
);

-- Proves the column revokes above are not over-broad.
update public.appointments set notes = 'updated by receptionist' where id = current_setting('fx.appt_a')::uuid;
select is(
  (select notes from public.appointments where id = current_setting('fx.appt_a')::uuid),
  'updated by receptionist',
  'a receptionist CAN still update an ordinary column (notes)'
);

select * from finish();
rollback;
