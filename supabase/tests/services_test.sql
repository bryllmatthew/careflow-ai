-- ============================================================================
-- Services negative-security suite (Phase 3 prerequisite)
--
-- services_select/insert/update are structurally identical to clinics'
-- policies (migration 0003) -- this suite proves the same shape holds for
-- this table rather than re-deriving RLS theory already covered there.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

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
  v_manager uuid; v_practitioner uuid;
  v_role_manager uuid; v_role_practitioner uuid; v_role_owner uuid;
  v_owner_b uuid;
begin
  select id into v_role_manager      from public.roles where key = 'clinic_manager' and organization_id is null;
  select id into v_role_practitioner from public.roles where key = 'practitioner' and organization_id is null;
  select id into v_role_owner        from public.roles where key = 'owner' and organization_id is null;

  insert into auth.users (id, email) values (gen_random_uuid(), 'svc-manager@fixture.test') returning id into v_manager;
  -- practitioner holds services.view but NOT services.manage (migration 0002
  -- seed) -- the genuine "lacks the permission" case for the insert-denial test.
  insert into auth.users (id, email) values (gen_random_uuid(), 'svc-practitioner@fixture.test') returning id into v_practitioner;
  insert into auth.users (id, email) values (gen_random_uuid(), 'svc-owner-b@fixture.test') returning id into v_owner_b;

  insert into public.organizations (name) values ('Services Fixture Org A') returning id into v_org_a;
  insert into public.organizations (name) values ('Services Fixture Org B') returning id into v_org_b;
  insert into public.clinics (organization_id, name) values (v_org_a, 'Fixture Clinic A') returning id into v_clinic_a;
  insert into public.clinics (organization_id, name) values (v_org_b, 'Fixture Clinic B') returning id into v_clinic_b;

  insert into public.organization_memberships (organization_id, user_id, status) values
    (v_org_a, v_manager, 'active'),
    (v_org_a, v_practitioner, 'active'),
    (v_org_b, v_owner_b, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values
    (v_manager, v_role_manager, v_org_a, null),
    (v_practitioner, v_role_practitioner, v_org_a, null),
    (v_owner_b, v_role_owner, v_org_b, null);

  perform set_config('fx.org_a', v_org_a::text, false);
  perform set_config('fx.org_b', v_org_b::text, false);
  perform set_config('fx.clinic_a', v_clinic_a::text, false);
  perform set_config('fx.clinic_b', v_clinic_b::text, false);
  perform set_config('fx.manager', v_manager::text, false);
  perform set_config('fx.practitioner', v_practitioner::text, false);
  perform set_config('fx.owner_b', v_owner_b::text, false);
end $$;

set local role authenticated;
select pg_temp.act_as('manager');

insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
values (current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid, 'Cleaning', 60, 1500)
returning id as service_a_id \gset
select set_config('fx.service_a', :'service_a_id', false);

select pg_temp.act_as('owner_b');

insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
values (current_setting('fx.org_b')::uuid, current_setting('fx.clinic_b')::uuid, 'Whitening', 45, 3000)
returning id as service_b_id \gset
select set_config('fx.service_b', :'service_b_id', false);

-- ----------------------------------------------------------------------------
-- Org isolation
-- ----------------------------------------------------------------------------

select pg_temp.act_as('manager');

select is(
  (select count(*)::int from public.services where id = current_setting('fx.service_b')::uuid),
  0,
  'a clinic manager in org A cannot see org B''s service'
);

select is(
  (select count(*)::int from public.services where id = current_setting('fx.service_a')::uuid),
  1,
  'the clinic manager sees the service they created in org A'
);

-- ----------------------------------------------------------------------------
-- Insert denial: practitioner holds services.view but not services.manage
-- ----------------------------------------------------------------------------

select pg_temp.act_as('practitioner');

select throws_ok(
  format($sql$insert into public.services (organization_id, clinic_id, name, duration_minutes, price) values (%L::uuid, %L::uuid, 'Sneaky', 30, 0)$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a')),
  '42501',
  null,
  'a practitioner (services.view only, no services.manage) cannot create a service'
);

-- ----------------------------------------------------------------------------
-- Column immutability
-- ----------------------------------------------------------------------------

select pg_temp.act_as('manager');

select throws_ok(
  format('update public.services set organization_id = %L::uuid where id = %L::uuid',
         current_setting('fx.org_b'), current_setting('fx.service_a')),
  '42501',
  null,
  'a clinic manager cannot move a service into another organization'
);

select throws_ok(
  format('update public.services set clinic_id = %L::uuid where id = %L::uuid',
         current_setting('fx.clinic_b'), current_setting('fx.service_a')),
  '42501',
  null,
  'a clinic manager cannot move a service to a clinic in another organization'
);

-- ----------------------------------------------------------------------------
-- Ordinary update still works
-- ----------------------------------------------------------------------------

update public.services set price = 1800 where id = current_setting('fx.service_a')::uuid;
select is(
  (select price from public.services where id = current_setting('fx.service_a')::uuid),
  1800.00,
  'a clinic manager CAN update an ordinary column (price)'
);

select * from finish();
rollback;
