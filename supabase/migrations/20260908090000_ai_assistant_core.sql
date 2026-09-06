-- ============================================================================
-- AI Assistant core (Phase 9)
--
-- Persists chat history for the AI operational assistant: conversations,
-- their messages (raw Anthropic content blocks, so history can be replayed
-- to the provider unchanged), individual tool invocations (audit trail --
-- docs/AI_TOOLS.md section 22), and per-request token usage (cost
-- tracking). No new authorization primitive is introduced -- tool execution
-- itself calls the SAME public.has_permission()/app.permitted_* helpers
-- every other module uses (see lib/ai/tools/registry.ts); these tables only
-- store the resulting transcript and audit record.
--
-- Conversations are PRIVATE to the user who started them (an operational
-- assistant, not a shared team inbox) -- ai.use, already seeded in
-- migration 20260903072300, gates who may use the assistant at all; RLS
-- here additionally scopes every row to auth.uid().
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- ai_conversations
-- ----------------------------------------------------------------------------
create table public.ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  user_id         uuid not null references auth.users (id),
  title           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint ai_conversations_id_org_uk unique (id, organization_id)
);

create index ai_conversations_user_ix on public.ai_conversations (user_id, updated_at desc) where deleted_at is null;
create index ai_conversations_org_ix  on public.ai_conversations (organization_id);

create trigger ai_conversations_set_updated_at
  before update on public.ai_conversations
  for each row execute function public.set_updated_at();

alter table public.ai_conversations enable row level security;

-- A column-specific `revoke update (col)` does NOT work when a table-level
-- UPDATE grant already exists (Supabase's platform default for every new
-- table) -- the table-level grant still permits updating that column
-- (confirmed live in migration 20260903083134's own comment on this exact
-- mistake). The working pattern, used by every other table in this app: revoke
-- the table-level privilege entirely, then grant back only the columns that
-- should be client-editable -- never id/organization_id/user_id/created_at.
revoke update on public.ai_conversations from authenticated;
grant update (title, deleted_at) on public.ai_conversations to authenticated;

create policy ai_conversations_select on public.ai_conversations for select to authenticated
using (user_id = (select auth.uid()));

create policy ai_conversations_insert on public.ai_conversations for insert to authenticated
with check (
  user_id = (select auth.uid())
  and organization_id = any (select unnest(app.permitted_orgs('ai.use')))
);

-- Title rename / soft delete (deleted_at) only -- never a way to reassign
-- ownership or tenancy (blocked above by the column revoke).
create policy ai_conversations_update on public.ai_conversations for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- Tenancy-stamping trigger, reused by ai_messages and ai_tool_calls below.
--
-- Mirrors this codebase's established pattern for derived/trusted columns
-- (e.g. invoice rollups): SECURITY DEFINER so it may read the parent
-- ai_conversations row regardless of the caller's own RLS visibility, and
-- it OVERWRITES whatever organization_id/user_id the client sent -- these
-- are never trusted client input (CLAUDE.md rule 4). Because this runs as
-- a BEFORE ROW trigger, the corrected values are what the table's WITH
-- CHECK policy evaluates, not the client-supplied ones.
-- ----------------------------------------------------------------------------
create or replace function public.ai_stamp_tenancy_from_conversation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_org  uuid;
  v_user uuid;
begin
  select organization_id, user_id into v_org, v_user
  from public.ai_conversations
  where id = new.conversation_id;

  if v_org is null then
    raise exception 'conversation not found' using errcode = '23503';
  end if;

  new.organization_id := v_org;
  new.user_id := v_user;
  return new;
end;
$fn$;

-- ----------------------------------------------------------------------------
-- ai_messages -- one row per turn. `content` is the raw Anthropic content
-- block array (text / tool_use / tool_result blocks) so a conversation can
-- be replayed to the provider byte-for-byte; nothing here re-derives or
-- summarizes it.
-- ----------------------------------------------------------------------------
create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  organization_id uuid not null,
  user_id         uuid not null,
  role            text not null check (role in ('user', 'assistant')),
  content         jsonb not null,
  created_at      timestamptz not null default now(),
  constraint ai_messages_conversation_org_fk
    foreign key (conversation_id, organization_id) references public.ai_conversations (id, organization_id)
);

create index ai_messages_conversation_ix on public.ai_messages (conversation_id, created_at);

create trigger ai_messages_stamp_tenancy
  before insert on public.ai_messages
  for each row execute function public.ai_stamp_tenancy_from_conversation();

alter table public.ai_messages enable row level security;
revoke update, delete on public.ai_messages from authenticated;

create policy ai_messages_select on public.ai_messages for select to authenticated
using (user_id = (select auth.uid()));

-- No client-supplied organization_id/user_id to check against here (the
-- BEFORE trigger above sets both from the real conversation owner before
-- this WITH CHECK evaluates) -- this denies an insert only if that
-- derivation somehow didn't run for a caller other than the owner.
create policy ai_messages_insert on public.ai_messages for insert to authenticated
with check (user_id = (select auth.uid()));

-- Append-only: no update or delete policy. A transcript is not edited.

-- ----------------------------------------------------------------------------
-- ai_tool_calls -- one row per tool invocation, queryable independently of
-- the JSONB message content (docs/AI_TOOLS.md section 22: "record tool
-- invoked, timestamp, success/failure"). `input`/`output_summary` are the
-- same small structured objects the tool registry already returns to the
-- model -- never raw table rows, per section 21's data-minimization rule.
-- ----------------------------------------------------------------------------
create table public.ai_tool_calls (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  organization_id uuid not null,
  user_id         uuid not null,
  message_id      uuid references public.ai_messages (id) on delete set null,
  tool_use_id     text not null,
  tool_name       text not null,
  input           jsonb not null default '{}'::jsonb,
  status          text not null check (status in ('success', 'error', 'denied')),
  is_action       boolean not null default false,
  output_summary  jsonb,
  error_message   text,
  created_at      timestamptz not null default now(),
  constraint ai_tool_calls_conversation_org_fk
    foreign key (conversation_id, organization_id) references public.ai_conversations (id, organization_id)
);

create index ai_tool_calls_conversation_ix on public.ai_tool_calls (conversation_id, created_at);
create index ai_tool_calls_org_tool_ix on public.ai_tool_calls (organization_id, tool_name, created_at);

create trigger ai_tool_calls_stamp_tenancy
  before insert on public.ai_tool_calls
  for each row execute function public.ai_stamp_tenancy_from_conversation();

alter table public.ai_tool_calls enable row level security;
revoke update, delete on public.ai_tool_calls from authenticated;

create policy ai_tool_calls_select on public.ai_tool_calls for select to authenticated
using (user_id = (select auth.uid()));

create policy ai_tool_calls_insert on public.ai_tool_calls for insert to authenticated
with check (user_id = (select auth.uid()));

-- Append-only audit trail: no update or delete policy, matching audit_logs.

-- ----------------------------------------------------------------------------
-- ai_usage -- one row per provider request, for cost tracking (section 22 /
-- MVP_ROADMAP AI cost-visibility note). Append-only.
-- ----------------------------------------------------------------------------
create table public.ai_usage (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.ai_conversations (id) on delete set null,
  organization_id uuid not null references public.organizations (id),
  user_id         uuid not null references auth.users (id),
  model           text not null,
  input_tokens    integer not null default 0 check (input_tokens >= 0),
  output_tokens   integer not null default 0 check (output_tokens >= 0),
  created_at      timestamptz not null default now()
);

create index ai_usage_org_ix on public.ai_usage (organization_id, created_at);

alter table public.ai_usage enable row level security;
revoke update, delete on public.ai_usage from authenticated;

create policy ai_usage_select on public.ai_usage for select to authenticated
using (user_id = (select auth.uid()));

create policy ai_usage_insert on public.ai_usage for insert to authenticated
with check (
  user_id = (select auth.uid())
  and organization_id = any (select unnest(app.permitted_orgs('ai.use')))
);

commit;
