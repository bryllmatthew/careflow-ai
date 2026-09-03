-- ============================================================================
-- 0004 — Write RPCs: organization bootstrap and role-grant management
--
-- Everything a brand-new user or an org admin needs to do that migration 0003
-- deliberately left with no client-writable policy: create an organization,
-- and grant/revoke/suspend role assignments without ever being able to
-- self-escalate. See docs/AUTHORIZATION.md section 14 ("a user must never be
-- able to grant themselves additional permissions") and CLAUDE.md.
--
-- Deferred to a later migration: invite_user(). Inviting someone with no
-- existing auth.users row requires GoTrue's admin API (auth.admin.inviteUser),
-- which has no SQL equivalent -- that path is a Next.js Route Handler using
-- the service-role client, decided in Task 1.15 alongside the invite UI, not
-- a schema concern.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- audit_logs — append-only. SELECT gated by audit.view; INSERT only from
-- SECURITY DEFINER functions (never a direct client grant); no UPDATE or
-- DELETE policy or grant, ever.
-- ----------------------------------------------------------------------------

create table public.audit_logs (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  user_id         uuid        references public.profiles (id) on delete set null,
  action          text        not null,
  entity_type     text        not null,
  entity_id       uuid,
  metadata        jsonb       not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only. Written only by SECURITY DEFINER RPCs; never client-writable. Avoid storing patient-identifying detail in metadata (docs/AUTHORIZATION.md section 13).';

create index audit_logs_org_created_ix on public.audit_logs (organization_id, created_at desc);

alter table public.audit_logs enable row level security;

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using ( organization_id = any (select unnest(app.permitted_orgs('audit.view'))) );

-- No insert/update/delete policy: writes happen only inside SECURITY DEFINER
-- functions, which bypass RLS via table ownership (same mechanism as the
-- app.* helpers). Revoke the client-facing grants outright so a bug can never
-- turn into a silent no-op write path.
revoke insert, update, delete on public.audit_logs from authenticated;

-- ----------------------------------------------------------------------------
-- app.actor_can_manage_grant(org, clinic) — shared scope check for the three
-- role-grant RPCs below. NULL clinic means "does the caller hold roles.manage
-- organization-wide"; a clinic id means "at least in that one clinic".
-- ----------------------------------------------------------------------------

create or replace function app.actor_can_manage_grant(p_organization_id uuid, p_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select case
    when p_clinic_id is null
      then p_organization_id = any (select unnest(app.permitted_orgs_orgwide('roles.manage')))
    else
      p_clinic_id = any (select unnest(app.permitted_clinics('roles.manage')))
  end
$fn$;

grant execute on function app.actor_can_manage_grant(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- app.active_orgwide_owner_count(org, exclude_user) — used by both
-- revoke_user_role and set_membership_status to enforce "an organization
-- always keeps at least one active, org-wide owner". Function-level check
-- rather than a trigger: every write that can affect this count already goes
-- through one of these two RPCs (no direct table access exists), so the
-- invariant only needs enforcing at that one layer.
-- ----------------------------------------------------------------------------

create or replace function app.active_orgwide_owner_count(p_organization_id uuid, p_exclude_user uuid default null)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select count(*)::int
  from public.user_roles ur
  join public.roles r
    on r.id = ur.role_id and r.key = 'owner' and r.organization_id is null
  join public.organization_memberships m
    on m.organization_id = ur.organization_id
   and m.user_id = ur.user_id
   and m.status = 'active'
  where ur.organization_id = p_organization_id
    and ur.clinic_id is null
    and (p_exclude_user is null or ur.user_id <> p_exclude_user)
$fn$;

-- Not exposed to authenticated: only the RPCs below (which are already
-- SECURITY DEFINER) call it internally.

-- ----------------------------------------------------------------------------
-- create_organization — the only path that creates an organization. Bootstrap
-- is inherently privileged: a brand-new caller has zero existing grants, so
-- this must bypass RLS by design, not by accident.
-- ----------------------------------------------------------------------------

create or replace function public.create_organization(
  p_org_name      text,
  p_business_type text default 'other',
  p_clinic_name   text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor         uuid := (select auth.uid());
  v_org_id        uuid;
  v_clinic_id     uuid;
  v_owner_role_id uuid;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_org_name, ''))) = 0 then
    raise exception 'organization name is required' using errcode = '23514';
  end if;

  select id into v_owner_role_id from public.roles where key = 'owner' and organization_id is null;

  insert into public.organizations (name, business_type)
  values (btrim(p_org_name), coalesce(nullif(btrim(p_business_type), ''), 'other'))
  returning id into v_org_id;

  insert into public.clinics (organization_id, name)
  values (v_org_id, coalesce(nullif(btrim(p_clinic_name), ''), btrim(p_org_name)))
  returning id into v_clinic_id;

  insert into public.organization_memberships (organization_id, user_id, status)
  values (v_org_id, v_actor, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id)
  values (v_actor, v_owner_role_id, v_org_id, null);

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (v_org_id, v_actor, 'organization.created', 'organizations', v_org_id,
          jsonb_build_object('name', p_org_name, 'clinic_id', v_clinic_id));

  return v_org_id;
end;
$fn$;

revoke execute on function public.create_organization(text, text, text) from public, anon;
grant  execute on function public.create_organization(text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- grant_user_role — the only path that writes to user_roles. Enforces, in
-- order: actor holds roles.manage AT THE TARGET SCOPE; target is already a
-- member; the role belongs to this organization or is a system role; only an
-- existing org-wide owner may grant the owner role; and no amplification --
-- every permission the role carries must already be held by the actor at that
-- same scope. That last check is what makes self-escalation structurally
-- impossible: an actor can never grant more than they themselves hold.
-- ----------------------------------------------------------------------------

create or replace function public.grant_user_role(
  p_target_user     uuid,
  p_role_id         uuid,
  p_organization_id uuid,
  p_clinic_id       uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor    uuid := (select auth.uid());
  v_role_org uuid;
  v_role_key text;
  v_id       uuid;
  v_missing  text;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not app.actor_can_manage_grant(p_organization_id, p_clinic_id) then
    raise exception 'missing roles.manage at the requested scope' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organization_memberships m
     where m.organization_id = p_organization_id
       and m.user_id = p_target_user
       and m.status in ('invited', 'active')
  ) then
    raise exception 'target is not a member of this organization' using errcode = '23514';
  end if;

  select r.organization_id, r.key into v_role_org, v_role_key
    from public.roles r where r.id = p_role_id;
  if not found then
    raise exception 'unknown role' using errcode = '23503';
  end if;
  if v_role_org is not null and v_role_org <> p_organization_id then
    raise exception 'role belongs to a different organization' using errcode = '23514';
  end if;

  if v_role_key = 'owner' and not (
       p_organization_id = any (select unnest(app.permitted_orgs_orgwide('roles.manage')))
       and exists (
         select 1 from public.user_roles ur
         join public.roles r on r.id = ur.role_id and r.key = 'owner' and r.organization_id is null
         join public.organization_memberships m
              on m.organization_id = ur.organization_id and m.user_id = ur.user_id and m.status = 'active'
         where ur.user_id = v_actor and ur.organization_id = p_organization_id and ur.clinic_id is null
       )
     ) then
    raise exception 'only an existing organization owner may grant the owner role' using errcode = '42501';
  end if;

  -- No amplification: every permission this role carries must already be
  -- held by the actor at the SAME scope being granted.
  select rp.permission_key into v_missing
  from public.role_permissions rp
  where rp.role_id = p_role_id
    and not (
      case
        when p_clinic_id is null
          then p_organization_id = any (select unnest(app.permitted_orgs_orgwide(rp.permission_key)))
          -- NB: correlated call, one invocation per candidate permission (a
          -- role carries on the order of tens of permissions, not thousands
          -- -- see CLAUDE.md's InitPlan note, which applies to per-ROW policy
          -- predicates over large tables, not to this bounded, one-off check).
        else p_clinic_id = any (select unnest(app.permitted_clinics(rp.permission_key)))
      end
    )
  limit 1;

  if v_missing is not null then
    raise exception 'cannot grant a permission you do not hold: %', v_missing using errcode = '42501';
  end if;

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id)
  values (p_target_user, p_role_id, p_organization_id, p_clinic_id)
  on conflict do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
    values (p_organization_id, v_actor, 'role.granted', 'user_roles', v_id,
            jsonb_build_object('target_user', p_target_user, 'role_id', p_role_id, 'clinic_id', p_clinic_id));
  end if;

  return v_id;
end;
$fn$;

revoke execute on function public.grant_user_role(uuid, uuid, uuid, uuid) from public, anon;
grant  execute on function public.grant_user_role(uuid, uuid, uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- revoke_user_role — the only path that deletes from user_roles. Symmetric
-- scope check to grant_user_role, plus the last-owner floor: revoking the
-- organization's only active, org-wide owner grant is rejected outright,
-- including by the owner revoking their own.
-- ----------------------------------------------------------------------------

create or replace function public.revoke_user_role(p_user_role_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor  uuid := (select auth.uid());
  v_grant  record;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select ur.user_id, ur.role_id, ur.organization_id, ur.clinic_id, r.key as role_key
    into v_grant
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
   where ur.id = p_user_role_id;

  if not found then
    raise exception 'unknown role grant' using errcode = '23503';
  end if;

  if not app.actor_can_manage_grant(v_grant.organization_id, v_grant.clinic_id) then
    raise exception 'missing roles.manage at the grant''s scope' using errcode = '42501';
  end if;

  if v_grant.role_key = 'owner' and v_grant.clinic_id is null
     and app.active_orgwide_owner_count(v_grant.organization_id, v_grant.user_id) = 0 then
    raise exception 'cannot revoke the organization''s only active owner' using errcode = '23514';
  end if;

  delete from public.user_roles where id = p_user_role_id;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (v_grant.organization_id, v_actor, 'role.revoked', 'user_roles', p_user_role_id,
          jsonb_build_object('target_user', v_grant.user_id, 'role_id', v_grant.role_id, 'clinic_id', v_grant.clinic_id));
end;
$fn$;

revoke execute on function public.revoke_user_role(uuid) from public, anon;
grant  execute on function public.revoke_user_role(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- set_membership_status — the only path that changes
-- organization_memberships.status. An actor may never change their own
-- status (blocks self-un-suspend and self-removal games), and suspending or
-- removing an organization's only active owner is rejected -- membership
-- status gates every app.permitted_* helper, so this is exactly as powerful
-- as deleting that owner's grant would be.
-- ----------------------------------------------------------------------------

create or replace function public.set_membership_status(
  p_membership_id uuid,
  p_status        text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor  uuid := (select auth.uid());
  v_member record;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_status not in ('invited', 'active', 'suspended', 'removed') then
    raise exception 'invalid status' using errcode = '23514';
  end if;

  select m.organization_id, m.user_id, m.status
    into v_member
    from public.organization_memberships m
   where m.id = p_membership_id;

  if not found then
    raise exception 'unknown membership' using errcode = '23503';
  end if;

  if v_member.user_id = v_actor then
    raise exception 'cannot change your own membership status' using errcode = '42501';
  end if;

  if not (v_member.organization_id = any (select unnest(app.permitted_orgs_orgwide('users.update')))) then
    raise exception 'missing users.update organization-wide' using errcode = '42501';
  end if;

  if v_member.status = 'active' and p_status <> 'active'
     and app.active_orgwide_owner_count(v_member.organization_id, v_member.user_id) = 0 then
    raise exception 'cannot suspend or remove the organization''s only active owner' using errcode = '23514';
  end if;

  update public.organization_memberships
     set status = p_status
   where id = p_membership_id;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (v_member.organization_id, v_actor, 'membership.status_changed', 'organization_memberships', p_membership_id,
          jsonb_build_object('target_user', v_member.user_id, 'from', v_member.status, 'to', p_status));
end;
$fn$;

revoke execute on function public.set_membership_status(uuid, text) from public, anon;
grant  execute on function public.set_membership_status(uuid, text) to authenticated;
