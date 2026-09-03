-- ============================================================================
-- 0003 — Authorization core: helper functions and RLS policies
--
-- Opens exactly what 0001/0002 left closed. Everything in `public` has had RLS
-- enabled with no policies since 0001, so this migration is additive: nothing
-- becomes MORE permissive than "deny all" until a policy here says otherwise.
--
-- Deliberately NOT in this migration: write RPCs (create_organization,
-- grant_user_role, etc.), audit_logs, notifications, domain_events,
-- document_counters. Those are 0004 — this migration is scoped to "can the
-- schema answer read/write authorization questions correctly", which is
-- independently testable before the write surface exists. Per CLAUDE.md
-- ("Working process"): smallest complete version, test it, then expand.
--
-- See docs/AUTHORIZATION.md and CLAUDE.md ("Non-negotiable security rules").
-- ============================================================================

-- ----------------------------------------------------------------------------
-- The `app` schema — private, not exposed via PostgREST.
--
-- Hardening, in order of importance:
--   1. Never in `public`: a definer function there is a live PostgREST RPC
--      endpoint. `app` is not, and must never be added to the exposed-schemas
--      config.
--   2. Postgres grants EXECUTE to PUBLIC on every new function by default.
--      The ALTER DEFAULT PRIVILEGES below is the most commonly missed step in
--      this hardening and is done BEFORE any function in this schema exists,
--      so nothing is ever transiently over-permissioned.
--   3. Every function is STABLE (or VOLATILE only where a write demands it),
--      SECURITY DEFINER, with search_path pinned so pg_temp cannot shadow an
--      unqualified reference, and NEVER accepts an actor parameter — the
--      subject is always auth.uid(), read from inside the function. An actor
--      parameter would be a backdoor: pass someone else's uuid, read their
--      answer.
-- ----------------------------------------------------------------------------

create schema if not exists app;

revoke all on schema app from public, anon, authenticated;
grant usage on schema app to authenticated;
alter default privileges in schema app revoke execute on functions from public;

-- ----------------------------------------------------------------------------
-- app.permitted_clinics(permission) — every clinic the caller may touch for a
-- given permission, org-wide grants already expanded.
--
-- Returns uuid[] rather than `setof uuid`. Every call site below uses
-- `col = any (select unnest(app.permitted_clinics('x')))`: the unnest() is
-- required so Postgres parses this as the ANY(subquery) form comparing scalar
-- to scalar per row, rather than ANY(array) misreading a single-row uuid[]
-- result as the comparand itself (uuid = uuid[] has no operator). Because the
-- subquery has no correlation to the outer row, Postgres still evaluates it
-- once per statement as an InitPlan, not once per row.
--
-- STABLE guarantees the same answer within one statement -- it does NOT
-- memoize across rows. A helper called with a column-valued argument (or used
-- as `col in (select f(col))`) is a per-row expression or an uncacheable
-- correlated SubPlan; on a large scan that is seconds of pure authz overhead.
-- With a LITERAL argument this is ~0.1-0.3ms, once. Verify with
-- EXPLAIN (ANALYZE, VERBOSE): `SubPlan ... loops=N` for N greater than 1
-- means this rule was violated at a call site.
--
-- Membership status is checked HERE, not as a second conjunct in every policy
-- -- a separate check is one more thing to forget on table #30. Folding it in
-- means suspending a member revokes access immediately and everywhere, with no
-- token refresh: the very next statement re-evaluates this function.
-- ----------------------------------------------------------------------------

create or replace function app.permitted_clinics(p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
  from public.user_roles ur
  join public.organization_memberships m
    on m.organization_id = ur.organization_id
   and m.user_id = ur.user_id
   and m.status = 'active'
  join public.role_permissions rp
    on rp.role_id = ur.role_id
   and rp.permission_key = p_permission
  join public.clinics c
    on c.organization_id = ur.organization_id
   and (ur.clinic_id is null or c.id = ur.clinic_id)
  where ur.user_id = (select auth.uid())
$fn$;

comment on function app.permitted_clinics(text) is
  'Clinic ids the current user may access for a permission, with organization-wide grants expanded. Call as (select unnest(app.permitted_clinics(''x''))) with = any so Postgres evaluates it once per statement as an InitPlan.';

-- ----------------------------------------------------------------------------
-- app.permitted_orgs(permission) — organizations where the caller holds a
-- permission AT ANY SCOPE (org-wide or in at least one clinic). For
-- organization-scoped tables such as `organizations`, `suppliers`, `roles`.
-- ----------------------------------------------------------------------------

create or replace function app.permitted_orgs(p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(array_agg(distinct ur.organization_id), '{}'::uuid[])
  from public.user_roles ur
  join public.organization_memberships m
    on m.organization_id = ur.organization_id
   and m.user_id = ur.user_id
   and m.status = 'active'
  join public.role_permissions rp
    on rp.role_id = ur.role_id
   and rp.permission_key = p_permission
  where ur.user_id = (select auth.uid())
$fn$;

comment on function app.permitted_orgs(text) is
  'Organization ids where the current user holds a permission at any scope (org-wide or in at least one clinic).';

-- ----------------------------------------------------------------------------
-- app.permitted_orgs_orgwide(permission) — organizations where the caller
-- holds a permission ORG-WIDE specifically (clinic_id IS NULL). Strictly
-- stronger than permitted_orgs. For operations that are inherently org-level
-- even though the permission itself can also be granted per-clinic -- e.g. you
-- cannot create.a clinic clinic-scoped to a clinic that does not exist yet.
-- ----------------------------------------------------------------------------

create or replace function app.permitted_orgs_orgwide(p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(array_agg(distinct ur.organization_id), '{}'::uuid[])
  from public.user_roles ur
  join public.organization_memberships m
    on m.organization_id = ur.organization_id
   and m.user_id = ur.user_id
   and m.status = 'active'
  join public.role_permissions rp
    on rp.role_id = ur.role_id
   and rp.permission_key = p_permission
  where ur.user_id = (select auth.uid())
    and ur.clinic_id is null
$fn$;

comment on function app.permitted_orgs_orgwide(text) is
  'Organization ids where the current user holds a permission organization-wide (not merely in some clinic). Used for RPC guards and clinic creation.';

-- ----------------------------------------------------------------------------
-- app.shares_active_org(user_id) — does the caller share an active
-- organization membership with the given user? Backs the `profiles` policy:
-- profiles are org-agnostic, so without this a naive `using (true)` would
-- expose every user's name, email and avatar platform-wide.
-- ----------------------------------------------------------------------------

create or replace function app.shares_active_org(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select exists (
    select 1
    from public.organization_memberships me
    join public.organization_memberships them
      on them.organization_id = me.organization_id
    where me.user_id = (select auth.uid())
      and me.status = 'active'
      and them.user_id = p_user_id
      and them.status = 'active'
  )
$fn$;

comment on function app.shares_active_org(uuid) is
  'True if the current user shares an active organization membership with the given user. Prevents profiles from being globally readable.';

-- ----------------------------------------------------------------------------
-- app.can_read_role(role_id) — is this role visible to the caller? A system
-- role is visible to anyone signed in; a custom role only within its own org.
-- Backs the `role_permissions` select policy: rather than inline the roles
-- join in every policy, one helper keeps the "no RLS-enabled table referenced
-- inline from another authz table's policy" rule (see the recursion note
-- below) in exactly one place.
-- ----------------------------------------------------------------------------

create or replace function app.can_read_role(p_role_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select exists (
    select 1
    from public.roles r
    where r.id = p_role_id
      and (
        r.organization_id is null
        or r.organization_id = any (select unnest(app.permitted_orgs('roles.view')))
      )
  )
$fn$;

comment on function app.can_read_role(uuid) is
  'True if the current user may see this role -- always true for system roles, org-scoped for custom roles.';

grant execute on function app.permitted_clinics(text)       to authenticated;
grant execute on function app.permitted_orgs(text)          to authenticated;
grant execute on function app.permitted_orgs_orgwide(text)  to authenticated;
grant execute on function app.shares_active_org(uuid)        to authenticated;
grant execute on function app.can_read_role(uuid)             to authenticated;

-- ============================================================================
-- Row Level Security policies
--
-- Recursion note: SECURITY DEFINER avoids infinite policy recursion because
-- Postgres skips RLS for a table's OWNER (not because of SECURITY DEFINER
-- itself), and every function above is owned by the same role that owns these
-- tables (the migration role). That is why FORCE ROW LEVEL SECURITY must never
-- be set on an authorization table -- it would re-enable RLS for the owner and
-- reintroduce the recursion these functions exist to avoid. The corollary rule:
-- a policy on an authorization table may reference only auth.uid(), its own
-- columns, and app.* definer helpers -- never another RLS-enabled table inline.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- organizations
--
-- No INSERT policy: organization creation is a privileged bootstrap operation
-- (create org + first clinic + active membership + owner grant, atomically)
-- that belongs in a SECURITY DEFINER RPC, not a client-issued INSERT. That RPC
-- lands in 0004. No DELETE policy: organizations are deactivated
-- (status = 'suspended'), never deleted (docs/AUTHORIZATION.md section 12).
-- ----------------------------------------------------------------------------

create policy organizations_select on public.organizations
  for select to authenticated
  using ( id = any (select unnest(app.permitted_orgs('organization.view'))) );

create policy organizations_update on public.organizations
  for update to authenticated
  using      ( id = any (select unnest(app.permitted_orgs('organization.update'))) )
  with check ( id = any (select unnest(app.permitted_orgs('organization.update'))) );

-- ----------------------------------------------------------------------------
-- clinics
--
-- clinic.create is checked org-wide only (permitted_orgs_orgwide): a
-- clinic-scoped grant cannot exist for a clinic that does not exist yet, so
-- "can this user create a clinic in this org" is inherently an org-level
-- question. select/update/delete use permitted_clinics, which already expands
-- org-wide grants to include every clinic in the org.
-- ----------------------------------------------------------------------------

create policy clinics_select on public.clinics
  for select to authenticated
  using ( id = any (select unnest(app.permitted_clinics('clinic.view'))) );

create policy clinics_insert on public.clinics
  for insert to authenticated
  with check ( organization_id = any (select unnest(app.permitted_orgs_orgwide('clinic.create'))) );

create policy clinics_update on public.clinics
  for update to authenticated
  using      ( id = any (select unnest(app.permitted_clinics('clinic.update'))) )
  with check ( id = any (select unnest(app.permitted_clinics('clinic.update'))) );

create policy clinics_delete on public.clinics
  for delete to authenticated
  using ( id = any (select unnest(app.permitted_clinics('clinic.delete'))) );

-- RLS cannot express column immutability. A user with clinic.update could
-- otherwise re-parent a clinic into an organization they do not control by
-- updating organization_id within a row they can already reach.
--
-- A column-level REVOKE is a no-op when the privilege came from a TABLE-level
-- grant (which is exactly Supabase's default: `authenticated` is granted ALL
-- on every table in `public` at project bootstrap) -- Postgres only removes a
-- column-level ACL entry if one exists; it does not carve an exception out of
-- a table-level grant. Confirmed live: `revoke update (organization_id) ...`
-- ran without error and left the privilege fully intact. The correct pattern
-- is to revoke the table-level grant entirely, then re-grant UPDATE on
-- exactly the columns that should be client-editable -- never id (primary
-- key), organization_id, created_at, or updated_at (maintained by the
-- set_updated_at trigger; a client write here would be silently clobbered by
-- it anyway, so granting it would only be misleading, not unsafe).
revoke update on public.clinics from authenticated;
grant update (name, address, phone, email, timezone, operating_hours, status, deleted_at)
  on public.clinics to authenticated;

-- ----------------------------------------------------------------------------
-- profiles
--
-- Org-agnostic by design (see 0001), so visibility is "yourself, or anyone you
-- share an active organization with" -- never a blanket `using (true)`.
-- ----------------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or app.shares_active_org(id)
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using      ( id = (select auth.uid()) )
  with check ( id = (select auth.uid()) );

-- ----------------------------------------------------------------------------
-- organization_memberships
--
-- No write policy: membership rows are created by create_organization() and
-- invite_user() (0004, both SECURITY DEFINER) and status is changed by
-- set_membership_status() (0004) so that a suspension cannot be self-reversed.
-- Direct client writes are denied outright, which is what makes 42501 rather
-- than a silently-ignored write the failure mode.
-- ----------------------------------------------------------------------------

create policy organization_memberships_select on public.organization_memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())                                  -- bootstrap: "which orgs am I in?"
    or organization_id = any (select unnest(app.permitted_orgs('users.view')))
  );

-- ----------------------------------------------------------------------------
-- permissions — not tenant data; the catalogue is the same for every
-- organization and is only ever seeded by migration.
-- ----------------------------------------------------------------------------

create policy permissions_select on public.permissions
  for select to authenticated
  using ( true );

-- ----------------------------------------------------------------------------
-- roles — system roles are visible to anyone signed in; custom roles only
-- within their own organization. No write policy: role creation/editing goes
-- through create_custom_role() / set_role_permissions() (0004), which also
-- enforce the no-amplification rule (a user cannot grant a permission set
-- broader than their own).
-- ----------------------------------------------------------------------------

create policy roles_select on public.roles
  for select to authenticated
  using (
    organization_id is null
    or organization_id = any (select unnest(app.permitted_orgs('roles.view')))
  );

-- ----------------------------------------------------------------------------
-- role_permissions — readable if the parent role is readable. Uses the
-- app.can_read_role() helper rather than an inline join to `roles`, per the
-- recursion rule above.
-- ----------------------------------------------------------------------------

create policy role_permissions_select on public.role_permissions
  for select to authenticated
  using ( app.can_read_role(role_id) );

-- ----------------------------------------------------------------------------
-- user_roles — the actual privilege-escalation surface. No write policy at
-- all: grant_user_role() / revoke_user_role() (0004) are the only path, and
-- they enforce "only an owner may grant owner" and "a user can never grant a
-- permission set broader than their own" (docs/AUTHORIZATION.md section 14 --
-- "a user must never be able to grant themselves additional permissions").
-- ----------------------------------------------------------------------------

create policy user_roles_select on public.user_roles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or organization_id = any (select unnest(app.permitted_orgs('users.view')))
  );

-- ============================================================================
-- Structural guarantees, checked here so a future migration cannot silently
-- regress them. Mirrors the CI assertions in CLAUDE.md / the Task 1.6 pgTAP
-- suite, run inline so `supabase db reset` fails fast during development too.
-- ============================================================================

do $$
declare
  v_bad_table text;
  v_bad_fn    text;
begin
  select relname into v_bad_table
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
   limit 1;
  if v_bad_table is not null then
    raise exception 'table % in public has RLS disabled', v_bad_table;
  end if;

  select p.proname into v_bad_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and not p.prosecdef
   limit 1;
  if v_bad_fn is not null then
    raise exception 'app.% is not SECURITY DEFINER', v_bad_fn;
  end if;

  select p.proname into v_bad_fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'app'
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search_path=%'
     )
   limit 1;
  if v_bad_fn is not null then
    raise exception 'app.% has no pinned search_path', v_bad_fn;
  end if;
end $$;
