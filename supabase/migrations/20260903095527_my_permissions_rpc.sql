-- ============================================================================
-- 0006 — my_permissions(): the full permission set for one round trip
--
-- The application shell (Task 1.10) filters ~26 navigation items by
-- permission. Calling has_permission() once per item would be 26 round
-- trips; this returns the whole set in one.
-- ============================================================================

create or replace function app.permitted_permissions_in_org(p_organization_id uuid)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(array_agg(distinct rp.permission_key), '{}'::text[])
  from public.user_roles ur
  join public.organization_memberships m
    on m.organization_id = ur.organization_id
   and m.user_id = ur.user_id
   and m.status = 'active'
  join public.role_permissions rp
    on rp.role_id = ur.role_id
  where ur.user_id = (select auth.uid())
    and ur.organization_id = p_organization_id
$fn$;

comment on function app.permitted_permissions_in_org(uuid) is
  'Every permission key the current user holds in this organization, org-wide or clinic-scoped grants combined. For nav/UI filtering, not for authorization decisions -- those still call app.permitted_clinics/permitted_orgs per action.';

grant execute on function app.permitted_permissions_in_org(uuid) to authenticated;

create or replace function public.my_permissions(p_organization_id uuid)
returns text[]
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
  select app.permitted_permissions_in_org(p_organization_id)
$fn$;

comment on function public.my_permissions(uuid) is
  'Server-side wrapper for lib/auth -- the current user''s full permission set in one organization, for filtering navigation and other UI. Never use this for an individual authorization decision; call has_permission() for that.';

revoke execute on function public.my_permissions(uuid) from public, anon;
grant  execute on function public.my_permissions(uuid) to authenticated;
