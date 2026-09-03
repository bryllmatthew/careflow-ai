-- ============================================================================
-- 0010 — Fix: app.shares_active_org() hid the profile of anyone not yet
-- 'active', breaking the Users page for exactly the case it exists to show
--
-- Found live in Task 1.15: after inviting someone (migration 0008's
-- invite_member -- a real membership row, status='invited'), the inviting
-- owner's own /settings/users page rendered their name as "—" (the
-- component's null-fallback). PostgREST embeds (organization_memberships ->
-- profiles) are gated by the EMBEDDED table's own RLS independently of the
-- outer query, and app.shares_active_org() required BOTH the caller and the
-- target to hold status = 'active' -- the very definition of an invited
-- member is that their status is 'invited', not 'active', so their profile
-- was invisible to the person who just invited them. Confirmed directly:
-- app.shares_active_org(invited_user_id) returned false for the inviting
-- owner.
--
-- The caller must still be an ACTIVE member to see anyone's profile (an
-- invited-but-not-yet-accepted user should not itself gain visibility into
-- the org), but the TARGET's status should permit invited and suspended too
-- -- an admin needs to see who they invited (to know whether to resend or
-- cancel) and who they suspended (to know who to reactivate), and neither
-- of those is a security concern: profile data is name/email, and the
-- caller already has an independent, legitimate relationship to that row
-- via their own organization membership. Only 'removed' -- someone with no
-- ongoing relationship to the org at all -- stays excluded.
-- ============================================================================

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
      and them.status <> 'removed'
  )
$fn$;

comment on function app.shares_active_org(uuid) is
  'True if the caller is an ACTIVE member of an organization the target belongs to in any non-removed status (invited/active/suspended). The caller''s own status must be active; the target''s need not be, so an admin can see who they invited or suspended. Backs the profiles RLS policy.';
