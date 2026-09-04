-- ============================================================================
-- Automation / reminders / follow-ups negative-security suite (Phase 4)
--
-- Covers what's new here beyond the already-proven clinic-scoped RLS shape:
-- idempotency (the unique partial indexes automation dispatch relies on),
-- follow_ups' broad-vs-assigned update split, and create_notification()'s
-- cross-org injection guard.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

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
  v_recept uuid; v_practitioner uuid; v_finance uuid; v_owner_b uuid; v_manager uuid;
  v_role_recept uuid; v_role_practitioner uuid; v_role_owner uuid; v_role_finance uuid; v_role_manager uuid;
  v_patient_a uuid; v_patient_b uuid;
  v_service_a uuid; v_service_b uuid;
  v_appt_a uuid;
  v_rule_no_show uuid;
begin
  select id into v_role_recept       from public.roles where key = 'receptionist' and organization_id is null;
  select id into v_role_practitioner from public.roles where key = 'practitioner' and organization_id is null;
  select id into v_role_owner        from public.roles where key = 'owner' and organization_id is null;
  select id into v_role_finance      from public.roles where key = 'finance' and organization_id is null;
  select id into v_role_manager      from public.roles where key = 'clinic_manager' and organization_id is null;

  insert into auth.users (id, email) values (gen_random_uuid(), 'au-recept@fixture.test') returning id into v_recept;
  insert into auth.users (id, email) values (gen_random_uuid(), 'au-practitioner@fixture.test') returning id into v_practitioner;
  insert into auth.users (id, email) values (gen_random_uuid(), 'au-finance@fixture.test') returning id into v_finance;
  insert into auth.users (id, email) values (gen_random_uuid(), 'au-owner-b@fixture.test') returning id into v_owner_b;
  -- clinic_manager holds automations.view AND automations.manage (migration
  -- 0014 seed) -- the receptionist below holds neither, so it's the wrong
  -- fixture user for a "can see the rule" positive check.
  insert into auth.users (id, email) values (gen_random_uuid(), 'au-manager@fixture.test') returning id into v_manager;

  insert into public.organizations (name) values ('Automation Fixture Org A') returning id into v_org_a;
  insert into public.organizations (name) values ('Automation Fixture Org B') returning id into v_org_b;
  insert into public.clinics (organization_id, name) values (v_org_a, 'Fixture Clinic A') returning id into v_clinic_a;
  insert into public.clinics (organization_id, name) values (v_org_b, 'Fixture Clinic B') returning id into v_clinic_b;

  insert into public.organization_memberships (organization_id, user_id, status) values
    (v_org_a, v_recept, 'active'),
    (v_org_a, v_practitioner, 'active'),
    (v_org_a, v_finance, 'active'),
    (v_org_a, v_manager, 'active'),
    (v_org_b, v_owner_b, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values
    (v_recept, v_role_recept, v_org_a, null),
    (v_practitioner, v_role_practitioner, v_org_a, null),
    (v_finance, v_role_finance, v_org_a, null),
    (v_manager, v_role_manager, v_org_a, null),
    (v_owner_b, v_role_owner, v_org_b, null);

  insert into public.patients (organization_id, clinic_id, first_name, last_name)
    values (v_org_a, v_clinic_a, 'Ada', 'Fixture') returning id into v_patient_a;
  insert into public.patients (organization_id, clinic_id, first_name, last_name)
    values (v_org_b, v_clinic_b, 'Bea', 'Fixture') returning id into v_patient_b;

  insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
    values (v_org_a, v_clinic_a, 'Consultation', 30, 500) returning id into v_service_a;
  insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
    values (v_org_b, v_clinic_b, 'Consultation B', 30, 500) returning id into v_service_b;

  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at)
    values (v_org_a, v_clinic_a, v_patient_a, v_service_a, v_practitioner,
            '2026-02-10 09:00+00', '2026-02-10 09:30+00')
    returning id into v_appt_a;

  -- This fixture builds its org directly (not via create_organization()), so
  -- the automatic seed doesn't apply here -- insert the one rule this suite
  -- needs by hand.
  insert into public.automation_rules (organization_id, trigger_type, action_type, action_key, name, config)
    values (v_org_a, 'appointment.no_show', 'followup', 'followup_no_show', 'No-show follow-up',
            '{"followup_type": "no_show", "due_in_hours": 4, "priority": "high"}'::jsonb)
    returning id into v_rule_no_show;

  perform set_config('fx.org_a', v_org_a::text, false);
  perform set_config('fx.org_b', v_org_b::text, false);
  perform set_config('fx.clinic_a', v_clinic_a::text, false);
  perform set_config('fx.clinic_b', v_clinic_b::text, false);
  perform set_config('fx.recept', v_recept::text, false);
  perform set_config('fx.manager', v_manager::text, false);
  perform set_config('fx.practitioner', v_practitioner::text, false);
  perform set_config('fx.finance', v_finance::text, false);
  perform set_config('fx.owner_b', v_owner_b::text, false);
  perform set_config('fx.patient_a', v_patient_a::text, false);
  perform set_config('fx.patient_b', v_patient_b::text, false);
  perform set_config('fx.appt_a', v_appt_a::text, false);
  perform set_config('fx.rule_no_show', v_rule_no_show::text, false);
end $$;

set local role authenticated;

-- ----------------------------------------------------------------------------
-- automation_rules: seeded automatically by create_organization() -- confirm
-- the fixture's direct insert-based org (which doesn't call that RPC) is a
-- fair stand-in, then test isolation + permission on the real per-org rows
-- created for orgs that WERE bootstrapped via the RPC in earlier suites.
-- Here we just confirm org isolation on the rows the fixture itself owns.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('manager');

select is(
  (select count(*)::int from public.automation_rules where id = current_setting('fx.rule_no_show')::uuid),
  1,
  'a clinic manager (automations.view) can see their org''s automation rule'
);

-- Receptionist holds neither automations.view nor automations.manage
-- (migration 0014 seed) -- they can't even SELECT the row, so the UPDATE
-- silently matches 0 rows (SELECT-visibility gates UPDATE targeting in
-- Postgres RLS, the same shape as migrations 0011/0013), not a thrown
-- exception -- confirmed via an authorized readback rather than throws_ok.
select pg_temp.act_as('recept');
update public.automation_rules set enabled = false where id = current_setting('fx.rule_no_show')::uuid;

select pg_temp.act_as('manager');
select is(
  (select enabled from public.automation_rules where id = current_setting('fx.rule_no_show')::uuid),
  true,
  'a receptionist (no automations.view or automations.manage) cannot toggle an automation rule -- it is left unchanged'
);

select pg_temp.act_as('owner_b');
select is(
  (select count(*)::int from public.automation_rules where id = current_setting('fx.rule_no_show')::uuid),
  0,
  'an org B owner cannot see org A''s automation rule'
);

-- ----------------------------------------------------------------------------
-- Idempotency: the unique partial indexes reminders/follow_ups rely on.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('recept');

insert into public.reminders (organization_id, clinic_id, patient_id, appointment_id, reminder_type, scheduled_for)
values (current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid, current_setting('fx.patient_a')::uuid,
        current_setting('fx.appt_a')::uuid, 'confirmation', now());

select throws_ok(
  format($sql$insert into public.reminders (organization_id, clinic_id, patient_id, appointment_id, reminder_type, scheduled_for) values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, 'confirmation', now())$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a'), current_setting('fx.patient_a'), current_setting('fx.appt_a')),
  '23505',
  null,
  'a second non-cancelled confirmation reminder for the same appointment is rejected -- dispatch relies on this for idempotency'
);

insert into public.follow_ups (organization_id, clinic_id, patient_id, appointment_id, type, due_at)
values (current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid, current_setting('fx.patient_a')::uuid,
        current_setting('fx.appt_a')::uuid, 'no_show', now());

select throws_ok(
  format($sql$insert into public.follow_ups (organization_id, clinic_id, patient_id, appointment_id, type, due_at) values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, 'no_show', now())$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a'), current_setting('fx.patient_a'), current_setting('fx.appt_a')),
  '23505',
  null,
  'a second non-cancelled no_show follow-up for the same appointment is rejected -- the no-show automation cannot double-fire'
);

-- A cancelled reminder does not block a fresh one of the same type (the
-- reschedule flow relies on this: cancel the old, create a new one).
update public.reminders set status = 'cancelled'
  where appointment_id = current_setting('fx.appt_a')::uuid and reminder_type = 'confirmation';

insert into public.reminders (organization_id, clinic_id, patient_id, appointment_id, reminder_type, scheduled_for)
values (current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid, current_setting('fx.patient_a')::uuid,
        current_setting('fx.appt_a')::uuid, 'confirmation', now())
returning id as new_reminder_id \gset

select ok(
  :'new_reminder_id' is not null,
  'once the prior confirmation reminder is cancelled, a fresh one for the same appointment can be created'
);

-- ----------------------------------------------------------------------------
-- follow_ups: broad (followups.manage) vs assigned-only (followups.view +
-- assigned_to = self) update split.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('recept');

insert into public.follow_ups (organization_id, clinic_id, patient_id, type, due_at, assigned_to)
values (current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid, current_setting('fx.patient_a')::uuid,
        'general', now(), current_setting('fx.practitioner')::uuid)
returning id as general_followup_id \gset
select set_config('fx.followup_general', :'general_followup_id', false);

-- Practitioner holds followups.view + followups.create but NOT
-- followups.manage (migration 0002 seed) -- they can still update THIS
-- follow-up because they are its assigned_to.
select pg_temp.act_as('practitioner');
update public.follow_ups set status = 'completed', completed_at = now()
  where id = current_setting('fx.followup_general')::uuid;

select is(
  (select status from public.follow_ups where id = current_setting('fx.followup_general')::uuid),
  'completed',
  'a practitioner without followups.manage CAN complete a follow-up assigned to them'
);

-- Finance holds none of followups.view/create/manage -- cannot even see it.
select pg_temp.act_as('finance');
select is(
  (select count(*)::int from public.follow_ups where id = current_setting('fx.followup_general')::uuid),
  0,
  'finance (no followups.* grant) cannot see the follow-up at all'
);

-- A second follow-up assigned to nobody in particular: practitioner is NOT
-- its assigned_to and lacks followups.manage, so an update must silently
-- match 0 rows (same SELECT-visibility-gates-UPDATE shape as migration 0011).
select pg_temp.act_as('recept');
insert into public.follow_ups (organization_id, clinic_id, patient_id, type, due_at)
values (current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid, current_setting('fx.patient_a')::uuid,
        'general', now())
returning id as unassigned_followup_id \gset
select set_config('fx.followup_unassigned', :'unassigned_followup_id', false);

select pg_temp.act_as('practitioner');
update public.follow_ups set notes = 'sneaky' where id = current_setting('fx.followup_unassigned')::uuid;

select pg_temp.act_as('recept');
select is(
  (select notes from public.follow_ups where id = current_setting('fx.followup_unassigned')::uuid),
  null,
  'a practitioner cannot update a follow-up neither assigned to them nor covered by followups.manage'
);

-- ----------------------------------------------------------------------------
-- Org isolation on reminders/follow_ups
-- ----------------------------------------------------------------------------

select pg_temp.act_as('owner_b');
select is(
  (select count(*)::int from public.reminders where appointment_id = current_setting('fx.appt_a')::uuid),
  0,
  'an org B user cannot see org A''s reminders'
);
select is(
  (select count(*)::int from public.follow_ups where patient_id = current_setting('fx.patient_a')::uuid),
  0,
  'an org B user cannot see org A''s follow-ups'
);

-- ----------------------------------------------------------------------------
-- create_notification(): the cross-org injection guard.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('recept');

-- Legitimate: recept notifying the practitioner, both members of org A.
select ok(
  public.create_notification(
    current_setting('fx.org_a')::uuid, current_setting('fx.practitioner')::uuid,
    'followup_due', 'Follow-up due', 'A follow-up is due.'
  ) is not null,
  'create_notification() succeeds when both actor and recipient are active members of the given org'
);

-- Actor is not a member of org B at all.
select throws_ok(
  format('select public.create_notification(%L::uuid, %L::uuid, ''followup_due'', ''x'', ''y'')',
         current_setting('fx.org_b'), current_setting('fx.owner_b')),
  '42501',
  null,
  'create_notification() rejects an actor who is not a member of the target organization'
);

-- Actor IS a member of org A, but the recipient (org B''s owner) is not --
-- this is the actual cross-tenant injection this RPC exists to prevent.
select throws_ok(
  format('select public.create_notification(%L::uuid, %L::uuid, ''followup_due'', ''x'', ''y'')',
         current_setting('fx.org_a'), current_setting('fx.owner_b')),
  '42501',
  null,
  'create_notification() rejects a recipient who is not a member of the same organization as the actor'
);

-- ----------------------------------------------------------------------------
-- Column immutability on the new tables (spot check reminders; follow_ups
-- uses the identical revoke/re-grant pattern).
-- ----------------------------------------------------------------------------

select throws_ok(
  format('update public.reminders set organization_id = %L::uuid where appointment_id = %L::uuid',
         current_setting('fx.org_b'), current_setting('fx.appt_a')),
  '42501',
  null,
  'a receptionist cannot move a reminder into another organization'
);

-- ----------------------------------------------------------------------------
-- Composite FK: a reminder cannot reference a patient from a different
-- organization than the appointment/clinic it's attached to (elevated
-- privilege, same pattern as migrations 0011/0013).
-- ----------------------------------------------------------------------------

reset role;

-- reminder_type is 'reminder_24h' here, not 'confirmation' -- a 'confirmation'
-- reminder already exists (active) for this appointment from the
-- idempotency test above, and that unique constraint would fire before this
-- FK ever gets a chance to.
select throws_ok(
  format($sql$insert into public.reminders (organization_id, clinic_id, patient_id, appointment_id, reminder_type, scheduled_for) values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, 'reminder_24h', now())$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a'), current_setting('fx.patient_b'), current_setting('fx.appt_a')),
  '23503',
  null,
  'a reminder referencing a patient from a different organization is rejected by the composite foreign key'
);

select * from finish();
rollback;
