-- ============================================================================
-- 0005 — has_permission(): the one RPC the server-side TypeScript
-- authorization layer (lib/auth/require-permission.ts, Task 1.9) calls.
--
-- The app.* helpers are deliberately not PostgREST-exposed (CLAUDE.md /
-- migration 0003), so a public-schema wrapper is the only way application
-- code can ask "does the current user hold this permission at this scope"
-- without duplicating the app.permitted_* logic in TypeScript -- which would
-- risk drifting from the SQL that RLS itself relies on.
--
-- SECURITY INVOKER, not DEFINER: this function holds no privilege of its own
-- and only calls through to the already-hardened app.* definer helpers, which
-- do the actual privilege bypass internally. No reason to add a second
-- elevated-privilege surface for something that is purely a read.
-- ----------------------------------------------------------------------------

create or replace function public.has_permission(
  p_permission      text,
  p_organization_id uuid,
  p_clinic_id       uuid default null
)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
  select case
    -- No clinic specified: "does the user hold this permission anywhere in
    -- the organization" -- matches how the RLS policies on org-scoped tables
    -- (organizations, roles, ...) use app.permitted_orgs, not the stricter
    -- _orgwide variant.
    when p_clinic_id is null
      then p_organization_id = any (select unnest(app.permitted_orgs(p_permission)))
    else p_clinic_id = any (select unnest(app.permitted_clinics(p_permission)))
  end
$fn$;

comment on function public.has_permission(text, uuid, uuid) is
  'Server-side permission check for the TypeScript authorization layer. Read-only; delegates to the app.* helpers so RLS and application-layer checks never diverge.';

revoke execute on function public.has_permission(text, uuid, uuid) from public, anon;
grant  execute on function public.has_permission(text, uuid, uuid) to authenticated;
