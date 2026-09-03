-- ============================================================================
-- Authorization negative-security suite (pgTAP)
--
-- The merge gate: per CLAUDE.md, any migration touching a policy must pass
-- this in full before merge. Run with `pnpm test:rls`.
--
-- Everything runs inside one transaction that is ROLLED BACK at the end, so
-- the fixture data below never needs manual cleanup -- see the end of the
-- file for the one exception (documented there).
--
-- Role-switching pattern: fixture setup runs as the connecting role (postgres
-- in local dev, which owns every table so RLS does not apply). Each test then
-- does `set local role authenticated` plus a `request.jwt.claims` GUC to
-- simulate one specific end user, exactly as PostgREST does for a real
-- request. Setting a custom GUC (request.jwt.claims, or the fx.* fixture
-- pointers below) requires no special privilege, so no round trip back to an
-- elevated role is needed between simulated users.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(31);

-- ----------------------------------------------------------------------------
-- Structural assertions (Task 1.6 / CLAUDE.md "Non-negotiable security rules")
-- ----------------------------------------------------------------------------

select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every table in public has row level security enabled'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and not p.prosecdef),
  0,
  'every app.* function is SECURITY DEFINER'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%'
      )),
  0,
  'every app.* SECURITY DEFINER function pins search_path'
);

select is(
  (select count(distinct p.proowner)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'),
  (select count(distinct c.relowner)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'user_roles'),
  'app.* functions are owned by the same role that owns the authorization tables (the owner-bypass that avoids policy recursion depends on this)'
);

-- Every permission-key string literal referenced in a policy expression must
-- exist in the permissions catalogue -- a typo'd 'patients.veiw' would deny
-- everyone silently, and the FK on role_permissions.permission_key does not
-- protect a literal embedded inside a policy body.
select is(
  (
    select count(*)::int
    from (
      select (regexp_matches(
                coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')
                || ' ' || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
                '''([a-z_]+\.[a-z_.]+)''', 'g'
              ))[1] as literal
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
    ) found_literals
    where literal not in (select key from public.permissions)
  ),
  0,
  'every permission-key literal referenced in a policy exists in public.permissions'
);

-- ----------------------------------------------------------------------------
-- Fixture: two organizations, three clinics, five users covering every role
-- this suite exercises. Runs as the connecting (table-owning) role, so RLS
-- does not gate it.
-- ----------------------------------------------------------------------------

do $$
declare
  v_org_a uuid; v_org_b uuid;
  v_clinic_a1 uuid; v_clinic_a2 uuid; v_clinic_b1 uuid;
  v_admin_a uuid; v_manager_a1 uuid; v_suspended_a uuid; v_receptionist_a uuid; v_stranger uuid;
  v_role_admin uuid; v_role_manager uuid; v_role_receptionist uuid; v_role_owner uuid;
begin
  select id into v_role_admin       from public.roles where key = 'admin'          and organization_id is null;
  select id into v_role_manager     from public.roles where key = 'clinic_manager' and organization_id is null;
  select id into v_role_receptionist from public.roles where key = 'receptionist'  and organization_id is null;
  select id into v_role_owner       from public.roles where key = 'owner'          and organization_id is null;

  insert into auth.users (id, email) values (gen_random_uuid(), 'admin_a@pgtap.test')        returning id into v_admin_a;
  insert into auth.users (id, email) values (gen_random_uuid(), 'manager_a1@pgtap.test')      returning id into v_manager_a1;
  insert into auth.users (id, email) values (gen_random_uuid(), 'suspended_a@pgtap.test')     returning id into v_suspended_a;
  insert into auth.users (id, email) values (gen_random_uuid(), 'receptionist_a@pgtap.test')  returning id into v_receptionist_a;
  insert into auth.users (id, email) values (gen_random_uuid(), 'stranger@pgtap.test')        returning id into v_stranger;

  insert into public.organizations (name) values ('pgTAP Org A') returning id into v_org_a;
  insert into public.organizations (name) values ('pgTAP Org B') returning id into v_org_b;
  insert into public.clinics (organization_id, name) values (v_org_a, 'A Clinic 1') returning id into v_clinic_a1;
  insert into public.clinics (organization_id, name) values (v_org_a, 'A Clinic 2') returning id into v_clinic_a2;
  insert into public.clinics (organization_id, name) values (v_org_b, 'B Clinic 1') returning id into v_clinic_b1;

  insert into public.organization_memberships (organization_id, user_id, status) values
    (v_org_a, v_admin_a, 'active'),
    (v_org_a, v_manager_a1, 'active'),
    (v_org_a, v_suspended_a, 'suspended'),
    (v_org_a, v_receptionist_a, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values
    (v_admin_a, v_role_admin, v_org_a, null),
    (v_manager_a1, v_role_manager, v_org_a, v_clinic_a1),
    (v_suspended_a, v_role_admin, v_org_a, null),
    (v_receptionist_a, v_role_receptionist, v_org_a, null);

  perform set_config('fx.org_a', v_org_a::text, false);
  perform set_config('fx.org_b', v_org_b::text, false);
  perform set_config('fx.clinic_a1', v_clinic_a1::text, false);
  perform set_config('fx.clinic_a2', v_clinic_a2::text, false);
  perform set_config('fx.clinic_b1', v_clinic_b1::text, false);
  perform set_config('fx.admin_a', v_admin_a::text, false);
  perform set_config('fx.manager_a1', v_manager_a1::text, false);
  perform set_config('fx.suspended_a', v_suspended_a::text, false);
  perform set_config('fx.receptionist_a', v_receptionist_a::text, false);
  perform set_config('fx.stranger', v_stranger::text, false);
  perform set_config('fx.role_owner', v_role_owner::text, false);
end $$;

-- ----------------------------------------------------------------------------
-- Helper: switch the simulated end user for subsequent statements.
-- ----------------------------------------------------------------------------

create or replace function pg_temp.act_as(p_fixture_key text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting('fx.' || p_fixture_key), 'role', 'authenticated')::text,
    true);
$$;

set local role authenticated;

-- ----------------------------------------------------------------------------
-- Clinic visibility and organization scoping
-- ----------------------------------------------------------------------------

select pg_temp.act_as('admin_a');

select is(
  (select count(*)::int from public.clinics where organization_id::text = current_setting('fx.org_a')),
  2,
  'org-wide admin sees both clinics in their own organization'
);

select is(
  (select count(*)::int from public.clinics where organization_id::text = current_setting('fx.org_b')),
  0,
  'org-wide admin sees zero clinics belonging to a different organization'
);

select is(
  (select count(*)::int from public.organizations where id::text = current_setting('fx.org_b')),
  0,
  'admin cannot see an organization they are not a member of'
);

select pg_temp.act_as('manager_a1');

select is(
  (select count(*)::int from public.clinics),
  1,
  'a clinic-scoped manager (Clinic A1 only) sees exactly one clinic, not all of the organization''s'
);

select throws_ok(
  format($sql$insert into public.clinics (organization_id, name) values (%L::uuid, 'Sneaky Clinic')$sql$,
         current_setting('fx.org_a')),
  '42501',
  null,
  'a manager without clinic.create cannot insert a clinic'
);

-- The bug found and fixed during development of migration 0003: a
-- column-level REVOKE has no effect when the privilege came from Supabase's
-- default table-level grant to `authenticated`. Without the fix (revoke the
-- table-level grant, then re-grant only the safe columns), this statement
-- succeeds and a clinic manager can move a clinic into an organization they
-- do not control.
select throws_ok(
  format('update public.clinics set organization_id = %L::uuid where id = %L::uuid',
         current_setting('fx.org_b'), current_setting('fx.clinic_a1')),
  '42501',
  null,
  'a manager cannot re-parent their clinic into another organization by updating organization_id'
);

-- Proves the fix above is not over-broad: the manager must still be able to
-- update columns that were never meant to be protected.
update public.clinics set name = 'A Clinic 1 (renamed)' where id = current_setting('fx.clinic_a1')::uuid;
select is(
  (select name from public.clinics where id = current_setting('fx.clinic_a1')::uuid),
  'A Clinic 1 (renamed)',
  'a manager CAN still update an ordinary column (name) on a clinic they manage'
);

-- ----------------------------------------------------------------------------
-- Membership status: the fix that makes suspension take effect immediately
-- ----------------------------------------------------------------------------

select pg_temp.act_as('suspended_a');

select is(
  (select count(*)::int from public.clinics),
  0,
  'a SUSPENDED member sees zero clinics even though their user_roles grant is still org-wide admin'
);

select is(
  (select count(*)::int from public.organizations where id::text = current_setting('fx.org_a')),
  0,
  'a SUSPENDED member cannot see their own organization'
);

-- ----------------------------------------------------------------------------
-- Privilege escalation: no write policy exists on the authorization tables
-- ----------------------------------------------------------------------------

select pg_temp.act_as('receptionist_a');

select throws_ok(
  format('insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values (%L::uuid, %L::uuid, %L::uuid, null)',
         current_setting('fx.receptionist_a'), current_setting('fx.role_owner'), current_setting('fx.org_a')),
  '42501',
  null,
  'a receptionist cannot self-grant the owner role via a direct user_roles insert'
);

-- `authenticated` holds Supabase's default table-level UPDATE grant on this
-- table (same as every table), so with no UPDATE policy at all the safe
-- outcome is not a thrown exception -- it is an UPDATE that matches zero rows,
-- exactly as if the row did not exist. Confirmed live: this statement returns
-- "UPDATE 0", never an error. Assert on the row count, not on an exception.
update public.organization_memberships set status = 'active'
  where user_id = current_setting('fx.suspended_a')::uuid;

-- Read back as an elevated role, not as receptionist_a: receptionist_a also
-- lacks users.view, so a SELECT of another member's row correctly returns
-- nothing regardless of whether the UPDATE above did anything -- that read
-- restriction is proven by test 12-13 already. This assertion is purely
-- about database state after the write attempt.
reset role;
select is(
  (select status from public.organization_memberships where user_id = current_setting('fx.suspended_a')::uuid),
  'suspended',
  'a receptionist''s update to another member''s status silently affects zero rows (no write policy on organization_memberships)'
);
set local role authenticated;
select pg_temp.act_as('receptionist_a');

-- ----------------------------------------------------------------------------
-- profiles: org-agnostic table must not be globally readable
-- ----------------------------------------------------------------------------

select is(
  (select count(*)::int from public.profiles where email = 'stranger@pgtap.test'),
  0,
  'a user cannot see the profile of someone they share no organization with'
);

select is(
  (select count(*)::int from public.profiles where email = 'receptionist_a@pgtap.test'),
  1,
  'a user can always see their own profile'
);

-- ----------------------------------------------------------------------------
-- anon: zero privilege at the grant level (stricter than RLS alone)
-- ----------------------------------------------------------------------------

set local role anon;

select throws_ok(
  'select * from public.organizations',
  '42501',
  null,
  'the anon role has no table-level grant on organizations at all'
);

set local role authenticated;

-- ----------------------------------------------------------------------------
-- Data-integrity guards from migrations 0001/0002, re-verified here as an
-- end-to-end regression rather than only at the point they were introduced.
-- Runs with elevated privilege (reset role) since these are schema-level
-- invariants, not authorization-as-a-specific-user checks.
-- ----------------------------------------------------------------------------

reset role;

select throws_ok(
  format('insert into public.user_roles (user_id, role_id, organization_id, clinic_id) select %L::uuid, id, %L::uuid, null from public.roles where key = %L and organization_id is null',
         current_setting('fx.admin_a'), current_setting('fx.org_a'), 'admin'),
  '23505',
  null,
  'a duplicate organization-wide role grant is rejected (NULL is not distinct from NULL, so the partial unique index catches it)'
);

select throws_ok(
  format($sql$insert into public.user_roles (user_id, role_id, organization_id, clinic_id)
          select %L::uuid, id, %L::uuid, %L::uuid from public.roles where key = 'receptionist' and organization_id is null$sql$,
         current_setting('fx.admin_a'), current_setting('fx.org_a'), current_setting('fx.clinic_b1')),
  '23503',
  null,
  'a role grant referencing a clinic from a different organization is rejected by the composite foreign key'
);

-- Testing the partial unique index on a SYSTEM role (organization_id IS NULL)
-- requires disabling roles_no_client_system_roles first -- that trigger
-- already blocks any organization_id-null insert outright (see the next
-- test), so from ordinary client context this uniqueness check is
-- unreachable and would otherwise go untested. Runs with elevated privilege
-- (reset role above), matching the exact pattern migration 0002 uses to seed
-- the system roles.
alter table public.roles disable trigger roles_no_client_system_roles;

select throws_ok(
  $sql$insert into public.roles (organization_id, key, name) values (null, 'owner', 'Duplicate Owner')$sql$,
  '23505',
  null,
  'a duplicate system role key is rejected by the partial unique index'
);

alter table public.roles enable trigger roles_no_client_system_roles;

select throws_ok(
  $sql$insert into public.roles (organization_id, key, name) values (null, 'sneaky_system_role', 'Sneaky')$sql$,
  '42501',
  null,
  'a client cannot create a new system role (organization_id IS NULL is migration-only)'
);

select throws_ok(
  format($sql$delete from public.role_permissions where role_id = %L::uuid and permission_key = 'ai.use'$sql$, current_setting('fx.role_owner')),
  '42501',
  null,
  'system role permissions are immutable to every client role, including via a direct DELETE'
);

-- ----------------------------------------------------------------------------
-- Write RPCs (migration 0004): the only paths that create organizations or
-- write to user_roles / organization_memberships.status. Needs a fresh owner,
-- which none of the fixture above holds -- create_organization() itself
-- establishes one, so it doubles as the RPC's own test.
-- ----------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('receptionist_a');

select throws_ok(
  format($sql$select public.grant_user_role(%L::uuid, %L::uuid, %L::uuid, null)$sql$,
         current_setting('fx.receptionist_a'), current_setting('fx.role_owner'), current_setting('fx.org_a')),
  '42501',
  null,
  'grant_user_role rejects an actor who holds no roles.manage grant at all'
);

-- Deliberately `set local role authenticated` rather than `reset role` here:
-- these RPCs must be proven to work for the actual restricted `authenticated`
-- role, not for the table-owning role this file's fixture setup runs as.
-- Superuser/owner roles bypass grant checks entirely, so testing as postgres
-- would not catch a missing `grant execute ... to authenticated`.
set local role authenticated;
select pg_temp.act_as('admin_a');

select isnt(
  public.create_organization('pgTAP RPC Org', 'dental', 'RPC Clinic'),
  null,
  'create_organization returns a new organization id'
);

select public.create_organization('pgTAP RPC Org 2', 'dental', 'RPC Clinic 2') as new_org \gset
select set_config('fx.rpc_org', :'new_org', false);

select is(
  (select count(*)::int from public.clinics where organization_id = current_setting('fx.rpc_org')::uuid),
  1,
  'create_organization also creates exactly one clinic for the new organization'
);

select is(
  (select r.key
     from public.user_roles ur
     join public.roles r on r.id = ur.role_id
    where ur.organization_id = current_setting('fx.rpc_org')::uuid
      and ur.user_id = current_setting('fx.admin_a')::uuid),
  'owner',
  'the creator of an organization is granted its owner role, organization-wide'
);

select throws_ok(
  format('select public.revoke_user_role(%L::uuid)',
    (select ur.id from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.organization_id = current_setting('fx.rpc_org')::uuid
       and ur.user_id = current_setting('fx.admin_a')::uuid and r.key = 'owner')::text),
  '23514',
  null,
  'revoke_user_role refuses to remove an organization''s only active owner, including by that owner themselves'
);

select throws_ok(
  format('select public.set_membership_status(%L::uuid, %L)',
    (select id from public.organization_memberships
      where organization_id = current_setting('fx.rpc_org')::uuid
        and user_id = current_setting('fx.admin_a')::uuid)::text,
    'suspended'),
  '42501',
  null,
  'set_membership_status refuses to let an actor change their own membership status'
);

select is(
  (select count(*)::int from public.audit_logs
    where organization_id = current_setting('fx.rpc_org')::uuid and action = 'organization.created'),
  1,
  'create_organization writes an audit_logs entry'
);

-- ----------------------------------------------------------------------------
select * from finish();
rollback;

-- Note: the ROLLBACK above discards every fixture row created in this file,
-- including the auth.users rows. `auth.users` inserts and deletes are
-- themselves transactional in Postgres like any other table, so no separate
-- cleanup step is needed here (unlike the ad-hoc verification this suite
-- replaces, which ran outside a single transaction and needed explicit
-- DELETEs afterward).
