-- ============================================================================
-- 0008 — invite_member(): the second half of the invite flow
--
-- Creating the auth.users row for someone with no existing account requires
-- GoTrue's admin API (auth.admin.inviteUserByEmail), which has no SQL
-- equivalent -- that half necessarily runs in application code with the
-- service-role client (Task 1.15's invite Server Action, one narrowly
-- scoped exception to CLAUDE.md's "service-role key never on a request
-- path" rule, granted only after the caller's own permission is verified
-- through the normal RLS-respecting client).
--
-- Everything else -- creating the membership row, granting an initial role,
-- writing the audit log entry -- belongs in SQL, consistent with every other
-- privileged write in this project (create_organization, grant_user_role,
-- revoke_user_role, set_membership_status). organization_memberships has no
-- INSERT policy at all (migration 0003), so this is the only way a client
-- can create one.
-- ============================================================================

create or replace function public.invite_member(
  p_organization_id uuid,
  p_user_id          uuid,
  p_role_id          uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor         uuid := (select auth.uid());
  v_membership_id uuid;
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if not (p_organization_id = any (select unnest(app.permitted_orgs_orgwide('users.invite')))) then
    raise exception 'missing users.invite organization-wide' using errcode = '42501';
  end if;

  insert into public.organization_memberships (organization_id, user_id, status)
  values (p_organization_id, p_user_id, 'invited')
  on conflict (organization_id, user_id) do nothing
  returning id into v_membership_id;

  if v_membership_id is null then
    raise exception 'this person is already a member of the organization' using errcode = '23505';
  end if;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, v_actor, 'user.invited', 'organization_memberships', v_membership_id,
          jsonb_build_object('target_user', p_user_id));

  -- Reuses grant_user_role()'s own scope + no-amplification checks rather
  -- than re-implementing them. auth.uid() inside that call still resolves
  -- to THIS request's actor (it reads request.jwt.claims directly, not
  -- anything about which function is currently executing), so the checks
  -- run against the actual inviter, not against invite_member itself.
  if p_role_id is not null then
    perform public.grant_user_role(p_user_id, p_role_id, p_organization_id, null);
  end if;

  return v_membership_id;
end;
$fn$;

comment on function public.invite_member(uuid, uuid, uuid) is
  'Creates an invited membership (status=''invited'') and optionally grants an organization-wide role. The auth.users row itself must already exist -- created by the caller via the GoTrue admin API before this is called.';

revoke execute on function public.invite_member(uuid, uuid, uuid) from public, anon;
grant  execute on function public.invite_member(uuid, uuid, uuid) to authenticated;
