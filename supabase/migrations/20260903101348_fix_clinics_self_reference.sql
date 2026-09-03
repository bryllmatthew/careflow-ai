-- ============================================================================
-- 0007 — Fix a self-reference bug in the clinics table's own RLS policies
--
-- app.permitted_clinics() answers "which clinics may this user act on" by
-- JOINing to the clinics table itself. That is exactly right for every OTHER
-- clinic-scoped table (appointments, patients, ...) once they exist -- their
-- policies check `clinic_id = any(permitted_clinics(...))` against a fully
-- populated, unrelated table. But using permitted_clinics() for the clinics
-- table's OWN select/update/delete policies is circular: a single SQL
-- statement runs against one MVCC snapshot taken at its start, so an
-- `INSERT INTO clinics ... RETURNING ...` can never see the row it is
-- simultaneously inserting when permitted_clinics() re-scans clinics to
-- answer "is this id visible" -- Postgres applies the table's SELECT policy
-- to a RETURNING result set, so this is a real, reachable path, not a
-- theoretical one.
--
-- Found live: `insert into clinics (...) returning id` failed with "new row
-- violates row-level security policy for table clinics" for an org-wide
-- owner who unambiguously held clinic.create -- app.permitted_orgs_orgwide()
-- (used by the INSERT's WITH CHECK) correctly returned the organization, but
-- the RETURNING clause's implicit SELECT-policy re-check, running
-- permitted_clinics() against the not-yet-externally-visible new row, could
-- not find it. Confirmed the fix's target precisely: an UPDATE ... RETURNING
-- against an ALREADY-EXISTING clinic works fine (no chicken-and-egg -- that
-- row was visible before this statement began), so only clinics' own INSERT
-- path was actually broken. app.permitted_clinics() itself needed no change;
-- it's correct for every table that isn't clinics.
--
-- Not currently hit by application code (createClinicAction doesn't chain
-- .select()), but a landmine for the next person who does -- e.g. to get the
-- new clinic's id back for a redirect. Fixed now rather than left latent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- app.granted_clinic_ids(permission) — clinic-scoped grants ONLY (clinic_id
-- IS NOT NULL), read directly from user_roles without ever joining to
-- clinics. Paired with app.permitted_orgs_orgwide() (already clinics-free),
-- these two together answer "may this user see/act on this clinic row" with
-- no dependency on the clinics table's own contents -- eliminating the
-- self-reference entirely rather than working around it.
-- ----------------------------------------------------------------------------

create or replace function app.granted_clinic_ids(p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(array_agg(distinct ur.clinic_id), '{}'::uuid[])
  from public.user_roles ur
  join public.organization_memberships m
    on m.organization_id = ur.organization_id
   and m.user_id = ur.user_id
   and m.status = 'active'
  join public.role_permissions rp
    on rp.role_id = ur.role_id
   and rp.permission_key = p_permission
  where ur.user_id = (select auth.uid())
    and ur.clinic_id is not null
$fn$;

comment on function app.granted_clinic_ids(text) is
  'Clinic-scoped (non-org-wide) grants only, read from user_roles without joining clinics. Exists specifically so the clinics table''s own RLS policies never depend on clinics itself -- see this migration''s header comment.';

grant execute on function app.granted_clinic_ids(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Replace the three clinics policies that used permitted_clinics() with the
-- clinics-independent equivalent: org-wide coverage via
-- permitted_orgs_orgwide(), plus specific clinic-scoped grants via
-- granted_clinic_ids(). Semantically identical to before for every already-
-- committed row; the only behavior change is that INSERT ... RETURNING now
-- works.
-- ----------------------------------------------------------------------------

drop policy clinics_select on public.clinics;
create policy clinics_select on public.clinics
  for select to authenticated
  using (
    organization_id = any (select unnest(app.permitted_orgs_orgwide('clinic.view')))
    or id = any (select unnest(app.granted_clinic_ids('clinic.view')))
  );

drop policy clinics_update on public.clinics;
create policy clinics_update on public.clinics
  for update to authenticated
  using (
    organization_id = any (select unnest(app.permitted_orgs_orgwide('clinic.update')))
    or id = any (select unnest(app.granted_clinic_ids('clinic.update')))
  )
  with check (
    organization_id = any (select unnest(app.permitted_orgs_orgwide('clinic.update')))
    or id = any (select unnest(app.granted_clinic_ids('clinic.update')))
  );

drop policy clinics_delete on public.clinics;
create policy clinics_delete on public.clinics
  for delete to authenticated
  using (
    organization_id = any (select unnest(app.permitted_orgs_orgwide('clinic.delete')))
    or id = any (select unnest(app.granted_clinic_ids('clinic.delete')))
  );
