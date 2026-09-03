-- ============================================================================
-- 0009 — accept_invite(): a narrow, deliberate exception to "an actor can
-- never change their own membership status"
--
-- set_membership_status() (migration 0004) blocks an actor from changing
-- their own status outright -- that rule exists to stop self-un-suspension
-- and self-un-removal. But it also blocks the legitimate case this migration
-- adds: someone accepting their own invite. That's not a security bypass --
-- an admin already authorized the invite (invite_member, migration 0008),
-- and clicking the emailed link already proves email ownership via GoTrue's
-- token verification before this RPC is ever reached. Rather than carve an
-- exception into set_membership_status's shared logic, this is a separate,
-- intentionally narrow function: it can only ever move invited -> active,
-- only for the caller's own row, and does nothing else.
-- ============================================================================

create or replace function public.accept_invite(p_organization_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor uuid := (select auth.uid());
  v_id    uuid;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  update public.organization_memberships
     set status = 'active'
   where organization_id = p_organization_id
     and user_id = v_actor
     and status = 'invited'
  returning id into v_id;

  if v_id is null then
    raise exception 'no pending invite found for this organization' using errcode = '23514';
  end if;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, v_actor, 'user.accepted_invite', 'organization_memberships', v_id, '{}'::jsonb);
end;
$fn$;

comment on function public.accept_invite(uuid) is
  'Self-service invited -> active transition for the caller''s own membership only. Deliberately cannot move any other status (suspended, removed) -- that would reopen the self-un-suspension hole set_membership_status() closes.';

revoke execute on function public.accept_invite(uuid) from public, anon;
grant  execute on function public.accept_invite(uuid) to authenticated;
