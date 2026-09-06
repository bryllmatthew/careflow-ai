-- ============================================================================
-- AI Assistant negative-security suite (Phase 9)
--
-- Covers: ai_conversations/ai_messages/ai_tool_calls/ai_usage privacy (each
-- conversation belongs to exactly the user who started it -- NOT shared
-- across an organization the way most business tables are), the
-- ai_stamp_tenancy_from_conversation trigger's role as the actual tenancy
-- boundary for messages/tool_calls (client-supplied organization_id/user_id
-- values are always overwritten, never trusted), append-only enforcement on
-- messages/tool_calls/usage, and the ai.use permission gate on conversation
-- creation. Structural RLS-enabled coverage for these tables already comes
-- from authorization_test.sql's generic "every public table has RLS" check.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

create or replace function pg_temp.act_as(p_fixture_key text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting('fx.' || p_fixture_key), 'role', 'authenticated')::text,
    true);
$$;

do $$
declare
  v_org_a uuid; v_org_b uuid;
  v_a1 uuid; v_a2 uuid; v_b uuid;
  v_role_receptionist uuid;
begin
  select id into v_role_receptionist from public.roles where key = 'receptionist' and organization_id is null;

  insert into auth.users (id, email) values (gen_random_uuid(), 'ai-a1@fixture.test') returning id into v_a1;
  insert into auth.users (id, email) values (gen_random_uuid(), 'ai-a2@fixture.test') returning id into v_a2;
  insert into auth.users (id, email) values (gen_random_uuid(), 'ai-b@fixture.test') returning id into v_b;

  insert into public.organizations (name) values ('AI Fixture Org A') returning id into v_org_a;
  insert into public.organizations (name) values ('AI Fixture Org B') returning id into v_org_b;

  insert into public.organization_memberships (organization_id, user_id, status) values
    (v_org_a, v_a1, 'active'),
    (v_org_a, v_a2, 'active'),
    (v_org_b, v_b, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values
    (v_a1, v_role_receptionist, v_org_a, null),
    (v_a2, v_role_receptionist, v_org_a, null),
    (v_b,  v_role_receptionist, v_org_b, null);

  perform set_config('fx.org_a', v_org_a::text, false);
  perform set_config('fx.org_b', v_org_b::text, false);
  perform set_config('fx.a1', v_a1::text, false);
  perform set_config('fx.a2', v_a2::text, false);
  perform set_config('fx.b', v_b::text, false);
end $$;

-- ----------------------------------------------------------------------------
-- Conversation creation: ai.use + real org membership required
-- ----------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('a1');

select lives_ok(
  format('insert into public.ai_conversations (organization_id, user_id) values (%L::uuid, %L::uuid)',
         current_setting('fx.org_a'), current_setting('fx.a1')),
  'a1 can start a conversation under their own organization'
);

select throws_ok(
  format('insert into public.ai_conversations (organization_id, user_id) values (%L::uuid, %L::uuid)',
         current_setting('fx.org_b'), current_setting('fx.a1')),
  '42501', null,
  'a1 cannot start a conversation claiming an organization they do not belong to'
);

-- Store the new conversation's id in a session var the same way the fixture ids are stored.
select set_config('fx.convo_a1', id::text, false) from public.ai_conversations where user_id = current_setting('fx.a1')::uuid limit 1;

select is(
  (select count(*)::int from public.ai_conversations where id = current_setting('fx.convo_a1')::uuid),
  1,
  'a1 can see their own conversation'
);

-- ----------------------------------------------------------------------------
-- Privacy: conversations are per-user, not shared across the organization
-- ----------------------------------------------------------------------------
select pg_temp.act_as('a2');

select is(
  (select count(*)::int from public.ai_conversations where id = current_setting('fx.convo_a1')::uuid),
  0,
  'a2 (same organization as a1) cannot see a1''s conversation'
);

select pg_temp.act_as('b');

select is(
  (select count(*)::int from public.ai_conversations where id = current_setting('fx.convo_a1')::uuid),
  0,
  'b (a different organization) cannot see a1''s conversation'
);

-- ----------------------------------------------------------------------------
-- Column immutability: organization_id/user_id are set once and frozen
-- ----------------------------------------------------------------------------
select pg_temp.act_as('a1');

select throws_ok(
  format('update public.ai_conversations set organization_id = %L::uuid where id = %L::uuid',
         current_setting('fx.org_b'), current_setting('fx.convo_a1')),
  '42501', null,
  'a1 cannot repoint their own conversation to another organization'
);

select lives_ok(
  format('update public.ai_conversations set title = %L where id = %L::uuid', 'Renamed', current_setting('fx.convo_a1')),
  'a1 can rename their own conversation'
);

select lives_ok(
  format('update public.ai_conversations set deleted_at = now() where id = %L::uuid', current_setting('fx.convo_a1')),
  'a1 can soft-delete their own conversation via deleted_at'
);

-- undo the soft delete so later assertions still see the conversation
update public.ai_conversations set deleted_at = null where id = current_setting('fx.convo_a1')::uuid;

-- ----------------------------------------------------------------------------
-- Messages: tenancy is STAMPED from the conversation, never trusted from
-- the client -- insert with deliberately wrong organization_id/user_id and
-- confirm the stored row carries the real ones.
-- ----------------------------------------------------------------------------
select lives_ok(
  format(
    'insert into public.ai_messages (conversation_id, organization_id, user_id, role, content) values (%L::uuid, %L::uuid, %L::uuid, %L, %L::jsonb)',
    current_setting('fx.convo_a1'), current_setting('fx.org_b'), current_setting('fx.b'), 'user', '[{"type":"text","text":"hi"}]'
  ),
  'a1 can insert a message into their own conversation even with a spoofed organization_id/user_id in the payload'
);

select is(
  (select organization_id::text from public.ai_messages where conversation_id = current_setting('fx.convo_a1')::uuid order by created_at desc limit 1),
  current_setting('fx.org_a'),
  'the stored message''s organization_id is the REAL one from the conversation, not the spoofed payload value'
);

select is(
  (select user_id::text from public.ai_messages where conversation_id = current_setting('fx.convo_a1')::uuid order by created_at desc limit 1),
  current_setting('fx.a1'),
  'the stored message''s user_id is the REAL conversation owner, not the spoofed payload value'
);

select pg_temp.act_as('a2');

select throws_ok(
  format(
    'insert into public.ai_messages (conversation_id, organization_id, user_id, role, content) values (%L::uuid, %L::uuid, %L::uuid, %L, %L::jsonb)',
    current_setting('fx.convo_a1'), current_setting('fx.org_a'), current_setting('fx.a2'), 'user', '[{"type":"text","text":"hijack"}]'
  ),
  '42501', null,
  'a2 cannot insert a message into a1''s conversation -- the trigger stamps a1 as owner, so WITH CHECK denies a2'
);

select is(
  (select count(*)::int from public.ai_messages where conversation_id = current_setting('fx.convo_a1')::uuid),
  0,
  'a2 cannot even see a1''s messages'
);

-- ----------------------------------------------------------------------------
-- Append-only: no update or delete policy on messages
-- ----------------------------------------------------------------------------
select pg_temp.act_as('a1');

select throws_ok(
  format('update public.ai_messages set role = %L where conversation_id = %L::uuid', 'assistant', current_setting('fx.convo_a1')),
  '42501', null,
  'a1 cannot edit a message after the fact -- the transcript is append-only'
);

select throws_ok(
  format('delete from public.ai_messages where conversation_id = %L::uuid', current_setting('fx.convo_a1')),
  '42501', null,
  'a1 cannot delete a message -- no delete policy exists'
);

-- ----------------------------------------------------------------------------
-- Tool calls: same tenancy-stamping and cross-user denial as messages
-- ----------------------------------------------------------------------------
select lives_ok(
  format(
    'insert into public.ai_tool_calls (conversation_id, organization_id, user_id, tool_use_id, tool_name, input, status) values (%L::uuid, %L::uuid, %L::uuid, %L, %L, %L::jsonb, %L)',
    current_setting('fx.convo_a1'), current_setting('fx.org_b'), current_setting('fx.b'), 'tu_1', 'get_revenue_summary', '{}', 'success'
  ),
  'a1 can record a tool call against their own conversation even with a spoofed organization_id/user_id'
);

select is(
  (select organization_id::text from public.ai_tool_calls where conversation_id = current_setting('fx.convo_a1')::uuid limit 1),
  current_setting('fx.org_a'),
  'the stored tool call''s organization_id is the REAL one, not the spoofed payload value'
);

select pg_temp.act_as('a2');

select is(
  (select count(*)::int from public.ai_tool_calls where conversation_id = current_setting('fx.convo_a1')::uuid),
  0,
  'a2 cannot see a1''s tool call audit rows'
);

-- ----------------------------------------------------------------------------
-- Usage: insert-only, own-usage-only visibility, real org membership required
-- ----------------------------------------------------------------------------
select pg_temp.act_as('a1');

select throws_ok(
  format('insert into public.ai_usage (organization_id, user_id, model, input_tokens, output_tokens) values (%L::uuid, %L::uuid, %L, 10, 10)',
         current_setting('fx.org_b'), current_setting('fx.a1'), 'claude-sonnet-5'),
  '42501', null,
  'a1 cannot record usage under an organization they do not belong to'
);

select lives_ok(
  format('insert into public.ai_usage (organization_id, user_id, model, input_tokens, output_tokens) values (%L::uuid, %L::uuid, %L, 10, 10)',
         current_setting('fx.org_a'), current_setting('fx.a1'), 'claude-sonnet-5'),
  'a1 can record their own usage under their own organization'
);

select * from finish();
rollback;
