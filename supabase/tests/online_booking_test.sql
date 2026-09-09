-- ============================================================================
-- Phase 10 — Online booking: tenancy, the public RPC surface, and the booking
-- engine's own guarantees.
--
-- The negative cases are the point. A public booking page is the first surface
-- in this application reachable without a session at all, so the questions
-- that matter are "what can an anonymous caller reach?" and "can a slug for
-- Clinic A ever produce data or a booking belonging to Clinic B?"
--
-- Fixture: two organizations, each with one clinic, one service and one
-- practitioner. Org A's clinic is publicly bookable; Org B's is not.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

-- ---------------------------------------------------------------- fixture --

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner-a@booking.test', 'x', now(), now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'owner-b@booking.test', 'x', now(), now(), now(), '', '', '', ''),
  -- Deliberately NOT an all-zero-version UUID: this one exists to prove the
  -- notification fan-out excludes people, and a second id shape here would
  -- confuse that with an id-parsing problem.
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'stockkeeper-a@booking.test', 'x', now(), now(), now(), '', '', '', '');

insert into public.organizations (id, name, timezone) values
  ('00000000-0000-0000-0000-00000000a000', 'Booking Org A', 'Asia/Manila'),
  ('00000000-0000-0000-0000-00000000b000', 'Booking Org B', 'Asia/Manila');

insert into public.organization_memberships (organization_id, user_id, status) values
  ('00000000-0000-0000-0000-00000000a000', '00000000-0000-0000-0000-0000000000b1', 'active'),
  ('00000000-0000-0000-0000-00000000b000', '00000000-0000-0000-0000-0000000000b2', 'active'),
  ('00000000-0000-0000-0000-00000000a000', '00000000-0000-0000-0000-0000000000b3', 'active');

insert into public.user_roles (user_id, role_id, organization_id, clinic_id)
select '00000000-0000-0000-0000-0000000000b1', id, '00000000-0000-0000-0000-00000000a000', null
  from public.roles where organization_id is null and key = 'owner';
insert into public.user_roles (user_id, role_id, organization_id, clinic_id)
select '00000000-0000-0000-0000-0000000000b2', id, '00000000-0000-0000-0000-00000000b000', null
  from public.roles where organization_id is null and key = 'owner';
-- An Org A member with no appointments.view: inventory_manager holds stock and
-- reporting permissions and nothing scheduling-related (migration 0002).
insert into public.user_roles (user_id, role_id, organization_id, clinic_id)
select '00000000-0000-0000-0000-0000000000b3', id, '00000000-0000-0000-0000-00000000a000', null
  from public.roles where organization_id is null and key = 'inventory_manager';

-- Open every day, so the tests never depend on which weekday they run on.
insert into public.clinics (id, organization_id, name, slug, timezone, operating_hours) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a000', 'Clinic A', 'clinic-a', 'Asia/Manila',
   '{"mon":[{"open":"08:00","close":"20:00"}],"tue":[{"open":"08:00","close":"20:00"}],
     "wed":[{"open":"08:00","close":"20:00"}],"thu":[{"open":"08:00","close":"20:00"}],
     "fri":[{"open":"08:00","close":"20:00"}],"sat":[{"open":"08:00","close":"20:00"}],
     "sun":[{"open":"08:00","close":"20:00"}]}'::jsonb),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b000', 'Clinic B', 'clinic-b', 'Asia/Manila',
   '{"mon":[{"open":"08:00","close":"20:00"}],"tue":[{"open":"08:00","close":"20:00"}],
     "wed":[{"open":"08:00","close":"20:00"}],"thu":[{"open":"08:00","close":"20:00"}],
     "fri":[{"open":"08:00","close":"20:00"}],"sat":[{"open":"08:00","close":"20:00"}],
     "sun":[{"open":"08:00","close":"20:00"}]}'::jsonb);

insert into public.services (id, organization_id, clinic_id, name, duration_minutes, price, online_booking_enabled) values
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a000', '00000000-0000-0000-0000-00000000a001', 'Cleaning A', 30, 1500, true),
  ('00000000-0000-0000-0000-00000000a003', '00000000-0000-0000-0000-00000000a000', '00000000-0000-0000-0000-00000000a001', 'Internal Only A', 30, 9999, false),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-00000000b000', '00000000-0000-0000-0000-00000000b001', 'Cleaning B', 30, 1500, true);

insert into public.clinic_booking_settings (organization_id, clinic_id, online_booking_enabled, min_notice_hours, confirmation_mode) values
  ('00000000-0000-0000-0000-00000000a000', '00000000-0000-0000-0000-00000000a001', true, 0, 'auto'),
  -- Clinic B has a slug and settings but has NOT switched booking on.
  ('00000000-0000-0000-0000-00000000b000', '00000000-0000-0000-0000-00000000b001', false, 0, 'manual');

insert into public.clinic_booking_practitioners (organization_id, clinic_id, user_id, display_name, active) values
  ('00000000-0000-0000-0000-00000000a000', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-0000000000b1', 'Dr A', true),
  ('00000000-0000-0000-0000-00000000b000', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000b2', 'Dr B', true);

-- A stable, definitely-bookable slot: tomorrow 10:00 Manila time.
create temp table t_fixture as
select (((now() at time zone 'Asia/Manila')::date + 1)::text || ' 10:00')::timestamp
         at time zone 'Asia/Manila' as slot_at;

-- The tests below read this while running as `anon`, which owns nothing and is
-- granted nothing by default -- exactly the property the anonymous-surface
-- assertions verify. Granting it here keeps the fixture out of the way of what
-- is being tested.
grant select on t_fixture to anon;

-- =============================================================== structure ==

select has_column('public', 'clinics', 'slug', 'clinics carries the booking slug');
select has_column('public', 'clinics', 'logo_url', 'clinics carries the logo URL');
select has_column('public', 'appointments', 'booking_source', 'appointments record their booking source');
select col_default_is('public', 'appointments', 'booking_source', 'admin',
  'pre-existing appointments default to admin, so no backfill is needed');
select has_table('public', 'clinic_booking_settings', 'clinic_booking_settings exists');
select has_table('public', 'booking_links', 'booking_links exists');

-- Every new table has RLS on -- the same assertion authorization_test.sql
-- makes globally, restated here so a Phase 10 regression fails in the Phase 10
-- suite too.
select is(relrowsecurity, true, format('%s has RLS enabled', c.relname))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'clinic_booking_settings';
select is(relrowsecurity, true, format('%s has RLS enabled', c.relname))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'clinic_booking_practitioners';
select is(relrowsecurity, true, format('%s has RLS enabled', c.relname))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'booking_links';
select is(relrowsecurity, true, 'booking_rate_limits has RLS enabled')
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = 'booking_rate_limits';

-- ================================================ the anonymous attack surface

set local role anon;

-- The load-bearing property of the whole phase: anon reaches tables through
-- nothing but the granted RPCs.
select throws_ok('select 1 from public.clinics limit 1', '42501',
  null, 'anon cannot read clinics directly');
select throws_ok('select 1 from public.appointments limit 1', '42501',
  null, 'anon cannot read appointments directly');
select throws_ok('select 1 from public.patients limit 1', '42501',
  null, 'anon cannot read patients directly');
select throws_ok('select 1 from public.services limit 1', '42501',
  null, 'anon cannot read services directly');
select throws_ok('select 1 from public.booking_rate_limits limit 1', '42501',
  null, 'anon cannot read the rate-limit counters');
select throws_ok(
  $$select app.booking_slots(null, null, '{}'::uuid[], current_date)$$, '42501',
  null, 'anon cannot call the internal slot generator');
select throws_ok(
  $$select public.run_appointment_automation(gen_random_uuid(), 'appointment.created')$$, '42501',
  null, 'anon cannot trigger appointment automation directly');

-- ============================================================ page payload ==

select is(
  public.get_public_booking_page('clinic-a') -> 'clinic' ->> 'name',
  'Clinic A',
  'the booking page reads the clinic name from the clinic record');

select is(
  jsonb_array_length(public.get_public_booking_page('clinic-a') -> 'services'),
  1,
  'only services flagged for online booking are published');

select is(
  public.get_public_booking_page('clinic-b'),
  null,
  'a clinic that has not enabled online booking is indistinguishable from one that does not exist');

select is(
  public.get_public_booking_page('no-such-clinic'),
  null,
  'an unknown slug returns null rather than an error that confirms anything');

-- ========================================================= tenant isolation ==

select is(
  jsonb_array_length(
    public.get_public_booking_availability('clinic-a', '00000000-0000-0000-0000-00000000b002', null, null, 3, 'iso')
      -> 'days' -> 0 -> 'slots'),
  0,
  'Clinic B''s service produces no availability through Clinic A''s slug');

select is(
  public.create_public_booking(
    p_slug => 'clinic-a',
    p_service_id => '00000000-0000-0000-0000-00000000b002',
    p_start_at => (select slot_at from t_fixture),
    p_first_name => 'Mallory', p_last_name => 'Cross', p_phone => '0900 000 0001',
    p_client_key => 'iso-1') ->> 'error',
  'service_unavailable',
  'a booking cannot be made against another organization''s service');

select is(
  public.create_public_booking(
    p_slug => 'clinic-a',
    p_service_id => '00000000-0000-0000-0000-00000000a002',
    p_start_at => (select slot_at from t_fixture),
    p_staff_id => '00000000-0000-0000-0000-0000000000b2',
    p_first_name => 'Mallory', p_last_name => 'Cross', p_phone => '0900 000 0002',
    p_client_key => 'iso-2') ->> 'error',
  'practitioner_unavailable',
  'a booking cannot be assigned to another organization''s practitioner');

select is(
  public.create_public_booking(
    p_slug => 'clinic-a',
    p_service_id => '00000000-0000-0000-0000-00000000a003',
    p_start_at => (select slot_at from t_fixture),
    p_first_name => 'Mallory', p_last_name => 'Cross', p_phone => '0900 000 0003',
    p_client_key => 'iso-3') ->> 'error',
  'service_unavailable',
  'an internal service the clinic did not publish cannot be booked');

select is(
  public.create_public_booking(
    p_slug => 'clinic-b',
    p_service_id => '00000000-0000-0000-0000-00000000b002',
    p_start_at => (select slot_at from t_fixture),
    p_first_name => 'Mallory', p_last_name => 'Cross', p_phone => '0900 000 0004',
    p_client_key => 'iso-4') ->> 'error',
  'unavailable',
  'a clinic with online booking switched off refuses every booking');

-- ================================================================ validation

select is(
  public.create_public_booking(
    p_slug => 'clinic-a', p_service_id => '00000000-0000-0000-0000-00000000a002',
    p_start_at => (select slot_at from t_fixture),
    p_first_name => 'NoContact', p_last_name => 'Person',
    p_client_key => 'val-1') ->> 'error',
  'contact_required',
  'a booking with neither phone nor email is refused');

select is(
  public.create_public_booking(
    p_slug => 'clinic-a', p_service_id => '00000000-0000-0000-0000-00000000a002',
    -- 7 minutes off a 15-minute grid: a time the server never offered.
    p_start_at => (select slot_at + interval '7 minutes' from t_fixture),
    p_first_name => 'Offgrid', p_last_name => 'Person', p_phone => '0900 000 0005',
    p_client_key => 'val-2') ->> 'error',
  'slot_unavailable',
  'a start time the server never generated is refused, not trusted');

-- ================================================== the happy path, and race

select is(
  public.create_public_booking(
    p_slug => 'clinic-a', p_service_id => '00000000-0000-0000-0000-00000000a002',
    p_start_at => (select slot_at from t_fixture),
    p_first_name => 'Ana', p_last_name => 'Reyes',
    p_phone => '0999 111 2222', p_email => 'ana@booking.test',
    p_idempotency_key => 'idem-a-1', p_client_key => 'ok-1') ->> 'ok',
  'true',
  'a valid booking succeeds');

select is(
  public.create_public_booking(
    p_slug => 'clinic-a', p_service_id => '00000000-0000-0000-0000-00000000a002',
    p_start_at => (select slot_at from t_fixture),
    p_first_name => 'Ana', p_last_name => 'Reyes', p_phone => '0999 111 2222',
    p_idempotency_key => 'idem-a-1', p_client_key => 'ok-1') ->> 'duplicate',
  'true',
  'the same idempotency key returns the original booking, never a second one');

select is(
  public.create_public_booking(
    p_slug => 'clinic-a', p_service_id => '00000000-0000-0000-0000-00000000a002',
    p_start_at => (select slot_at from t_fixture),
    p_first_name => 'Ben', p_last_name => 'Cruz', p_phone => '0918 000 0000',
    p_idempotency_key => 'idem-a-2', p_client_key => 'ok-2') ->> 'error',
  'slot_unavailable',
  'a second patient cannot take a slot that is already booked');

reset role;

-- ===================================================== what actually landed ==
--
-- Every assertion below is scoped to THIS test's own organization and clinic.
-- An earlier version queried public.appointments globally, which passed only
-- against a pristine database and broke the moment the database held any other
-- public booking (a seeded demo, a developer's manual test). A test that
-- requires an empty database is testing the database's emptiness.

select is(
  (select booking_source from public.appointments
    where organization_id = '00000000-0000-0000-0000-00000000a000'
      and booking_reference is not null),
  'direct_booking',
  'the appointment records where it came from');

select is(
  (select status from public.appointments
    where organization_id = '00000000-0000-0000-0000-00000000a000'
      and booking_reference is not null),
  'confirmed',
  'confirmation_mode = auto lands the appointment as confirmed');

select is(
  (select count(*)::int from public.appointments
    where organization_id = '00000000-0000-0000-0000-00000000a000'
      and booking_reference is not null),
  1,
  'exactly one appointment was created, despite three booking attempts');

select ok(
  (select manage_token_hash ~ '^[0-9a-f]{64}$' from public.appointments
    where organization_id = '00000000-0000-0000-0000-00000000a000'
      and booking_reference is not null),
  'the manage token is stored only as a SHA-256 hash');

select is(
  (select count(*)::int from public.patients
    where clinic_id = '00000000-0000-0000-0000-00000000a001'
      and phone = '0999 111 2222'),
  1,
  'exactly one patient row was created for the booking');

select is(
  (select count(*)::int from public.patients
    where organization_id <> '00000000-0000-0000-0000-00000000a000'
      and phone = '0999 111 2222'),
  0,
  'the patient was not created in, or matched against, any other organization');

select is(
  (select count(*)::int from public.audit_logs
    where action = 'booking.public_created'
      and organization_id = '00000000-0000-0000-0000-00000000a000'),
  1,
  'the public booking is audited, with no user_id to invent');

-- ================================================ staff notifications (0022) ==
--
-- A booking nobody is told about is the core risk of a public booking page.
-- These assert both halves: the right people are told, and the wrong people
-- are not.

select is(
  (select count(*)::int from public.notifications
    where type = 'online_booking_created'
      and organization_id = '00000000-0000-0000-0000-00000000a000'),
  1,
  'a public booking notifies exactly the one Org A member holding appointments.view');

select is(
  (select user_id from public.notifications
    where type = 'online_booking_created'
      and organization_id = '00000000-0000-0000-0000-00000000a000'),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'the notification goes to the owner, who can open the appointment');

select is(
  (select count(*)::int from public.notifications
    where type = 'online_booking_created'
      and user_id = '00000000-0000-0000-0000-0000000000b3'),
  0,
  'a member without appointments.view is NOT told about the booking');

select is(
  (select count(*)::int from public.notifications
    where organization_id = '00000000-0000-0000-0000-00000000b000'),
  0,
  'no notification crosses into the other organization');

-- The notice line is what a staff member actually reads, so it must carry the
-- appointment in the CLINIC's timezone -- 10:00 Manila, never 02:00 UTC.
select ok(
  (select message like '%Ana Reyes%' and message like '%10:00 AM%'
     from public.notifications
    where type = 'online_booking_created'
      and organization_id = '00000000-0000-0000-0000-00000000a000'),
  'the notification names the patient and the clinic-local time');

select * from finish();
rollback;
