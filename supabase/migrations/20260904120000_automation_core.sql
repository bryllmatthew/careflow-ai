-- ============================================================================
-- 0014 — Reminders & Follow-Up Automation (Phase 4)
--
-- docs/PRODUCT_SPEC.md sections 7-8, docs/ARCHITECTURE.md "Event-Driven
-- Automation" / "Automation Engine", docs/DATABASE_SCHEMA.md's reminders/
-- follow_ups/notifications field lists, CLAUDE.md's already-recorded
-- deviation naming reminder_templates/automation_rules/communications/
-- domain_events as tables the specs require but never define.
--
-- Architecture (deliberately NOT a generic drag-and-drop rule engine --
-- docs/PRODUCT_SPEC.md and the Phase 4 brief both explicitly say not to
-- build one yet):
--
--   appointment status change (app/(app)/appointments/actions.ts)
--     -> lib/automation/dispatch.ts: dispatchAppointmentEvent(trigger_type)
--     -> looks up ENABLED automation_rules for (org, trigger_type)
--     -> action_type='reminder' -> upserts a `reminders` row (idempotent via
--        the unique index below), scheduled_for computed from the rule's
--        config and the appointment's start_at
--     -> action_type='followup' -> upserts a `follow_ups` row, same
--        idempotency shape
--     -> a separate periodic processor (app/api/cron/process-reminders)
--        sends `reminders` whose scheduled_for has arrived
--
-- `reminders` and `follow_ups` are each other's own execution log (status,
-- timestamps, failure_reason, retry_count already live there) -- there is
-- deliberately no separate generic `automation_executions` table duplicating
-- that bookkeeping; the Phase 4 brief itself says "do not blindly create
-- duplicate tables... reuse existing entities where appropriate". The
-- Automation Activity view is a union read over both.
--
-- `domain_events`/`communications` from CLAUDE.md's aspirational table list
-- are still not built -- nothing in this phase needs a generic outbox (the
-- two real triggers here are direct appointment-mutation call sites, not an
-- async event bus), and there is still no messaging provider to log
-- communications against. Recorded as a deviation below.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- New permissions
-- ----------------------------------------------------------------------------

insert into public.permissions (key, category, description) values
  ('reminders.view',      'Follow-ups',   'View scheduled and sent appointment reminders'),
  ('automations.view',    'Follow-ups',   'View automation rules and activity'),
  ('automations.manage',  'Follow-ups',   'Enable, disable and configure automation rules and templates'),
  ('notifications.view',  'Organization', 'View your own notifications'),
  ('notifications.manage','Organization', 'Manage organization-wide notification behavior');

-- The blanket "owner gets every permission" insert in migration 0002 already
-- ran and only covered what existed then -- new permission rows added here
-- need their own explicit owner grant, or the owner role would silently end
-- up missing them. Migration 0002's system-role-immutability triggers (the
-- guard behind negative-security-matrix Test #10, "tenant edits a system
-- role's permissions -> 42501") apply here too since they're a table
-- property, not scoped to that one migration -- same disable/insert/enable
-- dance 0002 used for its own seed.
alter table public.role_permissions disable trigger role_permissions_no_system_writes;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
 cross join (values
    ('reminders.view'), ('automations.view'), ('automations.manage'),
    ('notifications.view'), ('notifications.manage')
  ) as p(key)
 where r.organization_id is null and r.key = 'owner';

insert into public.role_permissions (role_id, permission_key)
select r.id, x.permission_key
  from public.roles r
  join (values
    -- Anyone who can already see appointments should see reminder status for
    -- them. Automation configuration stays with the roles that already
    -- manage clinic/organization settings.
    ('admin', 'reminders.view'), ('admin', 'automations.view'), ('admin', 'automations.manage'),
    ('admin', 'notifications.view'), ('admin', 'notifications.manage'),

    ('clinic_manager', 'reminders.view'), ('clinic_manager', 'automations.view'),
    ('clinic_manager', 'automations.manage'), ('clinic_manager', 'notifications.view'),

    ('practitioner', 'reminders.view'), ('practitioner', 'notifications.view'),

    ('receptionist', 'reminders.view'), ('receptionist', 'notifications.view'),

    -- Finance and Inventory Manager get their own notification inbox but NOT
    -- reminders/automations -- neither role manages patient communication
    -- (docs/AUTHORIZATION.md section 26 of the Phase 4 brief: "Finance
    -- should not automatically gain patient communication permissions").
    ('finance', 'notifications.view'),
    ('inventory_manager', 'notifications.view')
  ) as x(role_key, permission_key)
    on r.key = x.role_key
 where r.organization_id is null;

alter table public.role_permissions enable trigger role_permissions_no_system_writes;

-- ----------------------------------------------------------------------------
-- appointments needs the same (id, organization_id) composite-FK target
-- clinics/patients/services already have (migrations 0001/0013), so
-- reminders/follow_ups can reference a specific appointment the same
-- structurally-safe way.
-- ----------------------------------------------------------------------------

alter table public.appointments add constraint appointments_id_org_uk unique (id, organization_id);

-- ----------------------------------------------------------------------------
-- automation_rules — one row per (organization, action). Deliberately
-- org-wide only, no per-clinic override, in this pass: real per-clinic
-- reminder timing is a genuine future feature, not faked as a hidden column
-- nobody can set from the UI yet. Seeded per organization by
-- create_organization() below, so every org starts with an explicit,
-- visible, toggleable set rather than "nothing happens until someone
-- discovers a settings page."
-- ----------------------------------------------------------------------------

create table public.automation_rules (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  trigger_type      text        not null check (trigger_type in (
                                  'appointment.created', 'appointment.confirmed',
                                  'appointment.rescheduled', 'appointment.completed',
                                  'appointment.no_show'
                                )),
  action_type       text        not null check (action_type in ('reminder', 'followup')),
  -- Stable key this rule's reminders/follow-ups and templates join against --
  -- see reminder_templates and the reminders/follow_ups tables below.
  action_key        text        not null check (action_key ~ '^[a-z0-9_]+$'),
  name              text        not null,
  enabled           boolean     not null default true,
  -- Reminder rules: {"hours_before": 24}. Follow-up rules:
  -- {"followup_type": "no_show", "due_in_hours": 4, "priority": "high"}.
  -- Validated in the application (lib/validation), not a CHECK -- shape
  -- differs by action_type and may grow without a migration.
  config            jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (organization_id, action_key)
);

comment on table public.automation_rules is
  'Per-organization on/off + timing config for the fixed set of Phase 4 automations. Not a generic rule builder -- see this migration''s header comment.';

create trigger automation_rules_set_updated_at
  before update on public.automation_rules
  for each row execute function public.set_updated_at();

alter table public.automation_rules enable row level security;

create policy automation_rules_select on public.automation_rules
  for select to authenticated
  using ( organization_id = any (select unnest(app.permitted_orgs('automations.view'))) );

create policy automation_rules_update on public.automation_rules
  for update to authenticated
  using      ( organization_id = any (select unnest(app.permitted_orgs('automations.manage'))) )
  with check ( organization_id = any (select unnest(app.permitted_orgs('automations.manage'))) );

-- No insert/delete policy: the fixed set is seeded once by create_organization()
-- and only ever toggled/reconfigured, never added to or removed from a client.
revoke insert, delete, update on public.automation_rules from authenticated;
grant update (enabled, config, name) on public.automation_rules to authenticated;

-- ----------------------------------------------------------------------------
-- reminder_templates — one row per (organization, action_key, channel).
-- action_key here means "reminder_type" ('confirmation' | 'reminder_24h' |
-- 'reminder_2h', matching reminders.reminder_type) -- NOT
-- automation_rules.action_key. Two rules can share one template: the
-- confirm-triggered and reschedule-triggered 24-hour reminders are separate
-- toggleable rules but render the same 'reminder_24h' template.
-- ----------------------------------------------------------------------------

create table public.reminder_templates (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  action_key        text        not null check (action_key ~ '^[a-z0-9_]+$'),
  channel           text        not null default 'internal' check (channel in ('internal', 'email', 'sms')),
  name              text        not null,
  subject           text,
  body              text        not null check (length(btrim(body)) between 1 and 2000),
  enabled           boolean     not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (organization_id, action_key, channel)
);

comment on table public.reminder_templates is
  'Message templates rendered by lib/automation/render-template.ts -- plain {{variable}} substitution against a fixed whitelist, never eval''d.';

create trigger reminder_templates_set_updated_at
  before update on public.reminder_templates
  for each row execute function public.set_updated_at();

alter table public.reminder_templates enable row level security;

create policy reminder_templates_select on public.reminder_templates
  for select to authenticated
  using ( organization_id = any (select unnest(app.permitted_orgs('automations.view'))) );

create policy reminder_templates_insert on public.reminder_templates
  for insert to authenticated
  with check ( organization_id = any (select unnest(app.permitted_orgs('automations.manage'))) );

create policy reminder_templates_update on public.reminder_templates
  for update to authenticated
  using      ( organization_id = any (select unnest(app.permitted_orgs('automations.manage'))) )
  with check ( organization_id = any (select unnest(app.permitted_orgs('automations.manage'))) );

revoke update on public.reminder_templates from authenticated;
grant update (name, subject, body, enabled) on public.reminder_templates to authenticated;

-- ----------------------------------------------------------------------------
-- reminders — one row per scheduled/sent reminder for one appointment. Also
-- this feature's own execution log (status/sent_at/failure_reason/
-- retry_count) -- see this migration's header comment.
-- ----------------------------------------------------------------------------

create table public.reminders (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations (id) on delete cascade,
  clinic_id           uuid        not null,
  patient_id          uuid        not null,
  appointment_id      uuid        not null,
  automation_rule_id  uuid        references public.automation_rules (id) on delete set null,
  reminder_type       text        not null check (reminder_type in ('confirmation', 'reminder_24h', 'reminder_2h')),
  channel             text        not null default 'internal' check (channel in ('internal', 'email', 'sms')),
  scheduled_for       timestamptz not null,
  sent_at             timestamptz,
  status              text        not null default 'scheduled'
                                  check (status in ('scheduled', 'processing', 'sent', 'failed', 'cancelled', 'skipped')),
  failure_reason      text,
  retry_count         integer     not null default 0 check (retry_count >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint reminders_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint reminders_patient_fk foreign key (patient_id, organization_id)
    references public.patients (id, organization_id),
  constraint reminders_appointment_fk foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id)
);

comment on table public.reminders is
  'Scheduled and sent appointment reminders. A reminder past its scheduled_for is picked up by app/api/cron/process-reminders.';

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

create index reminders_org_ix on public.reminders (organization_id);
create index reminders_appointment_ix on public.reminders (appointment_id);
-- The processor's hot-path query: due, unsent reminders, oldest first.
create index reminders_due_ix on public.reminders (scheduled_for) where status = 'scheduled';

-- Idempotency: at most one non-cancelled reminder of a given type per
-- appointment. dispatch.ts relies on this via ON CONFLICT DO NOTHING --
-- processing the same trigger twice can never create a duplicate reminder.
create unique index reminders_appointment_type_uk
  on public.reminders (appointment_id, reminder_type)
  where status <> 'cancelled';

alter table public.reminders enable row level security;

create policy reminders_select on public.reminders
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('reminders.view'))) );

create policy reminders_insert on public.reminders
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('reminders.view'))) );

create policy reminders_update on public.reminders
  for update to authenticated
  using      ( clinic_id = any (select unnest(app.permitted_clinics('reminders.view'))) )
  with check ( clinic_id = any (select unnest(app.permitted_clinics('reminders.view'))) );

-- Reminders are created by the same clinic staff who can see appointments
-- (dispatch.ts runs as the acting user, per CLAUDE.md rule 1 -- no
-- service-role key on the request path), so reminders.view -- not a
-- separate write permission -- is what gates insert/update here. There is
-- no client-facing "create a reminder by hand" UI; this just lets the
-- automation dispatch call succeed for anyone who could see the appointment
-- it's attached to. No DELETE policy -- reminders are cancelled (status),
-- never removed, so the historical record of what was sent survives.
revoke update on public.reminders from authenticated;
grant update (status, sent_at, failure_reason, retry_count, scheduled_for)
  on public.reminders to authenticated;

-- ----------------------------------------------------------------------------
-- follow_ups
-- ----------------------------------------------------------------------------

create table public.follow_ups (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations (id) on delete cascade,
  clinic_id           uuid        not null,
  patient_id          uuid        not null,
  -- Nullable: a manually-created general follow-up need not reference an
  -- appointment. MATCH SIMPLE means the composite FK below is skipped
  -- entirely when appointment_id is null (same pattern as user_roles.clinic_id,
  -- migration 0001).
  appointment_id      uuid,
  automation_rule_id  uuid        references public.automation_rules (id) on delete set null,
  type                text        not null check (type in (
                                    'post_appointment', 'no_show', 'consultation',
                                    'treatment', 'payment', 'general'
                                  )),
  status              text        not null default 'pending'
                                  check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  priority            text        not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at              timestamptz not null,
  assigned_to         uuid        references public.profiles (id) on delete set null,
  notes               text,
  completed_at        timestamptz,
  created_by          uuid        references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint follow_ups_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint follow_ups_patient_fk foreign key (patient_id, organization_id)
    references public.patients (id, organization_id),
  constraint follow_ups_appointment_fk foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id)
);

comment on table public.follow_ups is
  'Operational follow-up tasks (docs/PRODUCT_SPEC.md section 8), created manually or by automation (automation_rule_id).';

create trigger follow_ups_set_updated_at
  before update on public.follow_ups
  for each row execute function public.set_updated_at();

create index follow_ups_org_ix on public.follow_ups (organization_id);
create index follow_ups_clinic_status_due_ix on public.follow_ups (clinic_id, status, due_at);
create index follow_ups_patient_ix on public.follow_ups (patient_id, due_at desc);
create index follow_ups_assigned_ix on public.follow_ups (assigned_to) where assigned_to is not null;

-- Idempotency: at most one non-cancelled follow-up of a given type per
-- appointment -- appointment.completed / appointment.no_show firing twice
-- for the same appointment must not create two follow-ups. Manually-created
-- follow-ups (appointment_id null) are exempt -- a receptionist may
-- legitimately want several general follow-ups for the same patient.
create unique index follow_ups_appointment_type_uk
  on public.follow_ups (appointment_id, type)
  where appointment_id is not null and status <> 'cancelled';

alter table public.follow_ups enable row level security;

-- Two permissive policies, same broad-vs-assigned shape as patients
-- (migration 0011): followups.manage covers every follow-up in an
-- accessible clinic; a holder of only followups.view who is the assigned
-- staff can still see and act on their own follow-up. Postgres ORs them.
create policy follow_ups_select_broad on public.follow_ups
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('followups.view'))) );

create policy follow_ups_insert on public.follow_ups
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('followups.create'))) );

create policy follow_ups_update on public.follow_ups
  for update to authenticated
  using (
    clinic_id = any (select unnest(app.permitted_clinics('followups.manage')))
    or (
      assigned_to = (select auth.uid())
      and clinic_id = any (select unnest(app.permitted_clinics('followups.view')))
    )
  )
  with check (
    clinic_id = any (select unnest(app.permitted_clinics('followups.manage')))
    or (
      assigned_to = (select auth.uid())
      and clinic_id = any (select unnest(app.permitted_clinics('followups.view')))
    )
  );

-- No DELETE policy: cancel via status, never remove (same rationale as
-- appointments/patients -- the operational record should survive).
revoke update on public.follow_ups from authenticated;
grant update (type, status, priority, due_at, assigned_to, notes, completed_at)
  on public.follow_ups to authenticated;

-- ----------------------------------------------------------------------------
-- notifications — a user's own inbox. Read is trivially self-scoped
-- (user_id = auth.uid()); write is a SECURITY DEFINER RPC below, the same
-- shape as invite_member (migration 0009) -- the writer (e.g. a receptionist
-- booking an appointment) is very often not the recipient (the assigned
-- practitioner), so a client-facing INSERT policy keyed on the writer's own
-- permissions can't express "write into someone else's inbox" safely.
-- ----------------------------------------------------------------------------

create table public.notifications (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  type            text        not null check (type in (
                                'followup_due', 'followup_overdue', 'reminder_failed',
                                'appointment_cancelled', 'appointment_rescheduled',
                                'no_show_followup_created'
                              )),
  title           text        not null,
  message         text        not null,
  entity_type     text,
  entity_id       uuid,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.notifications is
  'Per-user operational inbox. Written only by public.create_notification() (SECURITY DEFINER) -- see this migration.';

create index notifications_user_unread_ix on public.notifications (user_id, created_at desc) where read_at is null;

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using ( user_id = (select auth.uid()) );

create policy notifications_update on public.notifications
  for update to authenticated
  using      ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid()) );

revoke insert, delete on public.notifications from authenticated;
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.create_notification(
  p_organization_id uuid,
  p_user_id         uuid,
  p_type            text,
  p_title           text,
  p_message         text,
  p_entity_type     text default null,
  p_entity_id       uuid default null
)
returns uuid
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

  -- The actor must themselves be an active member of the target
  -- organization -- this is what stops org A from writing into org B's
  -- notification inbox, since p_organization_id is otherwise just a
  -- client-supplied argument (CLAUDE.md rule 4: never trust it directly).
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = v_actor and status = 'active'
  ) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  -- The recipient must also be a member of the SAME organization -- a
  -- caller who is a legitimate member of org A cannot use their own
  -- membership to plant a notification in some unrelated org B user's inbox.
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = p_user_id and status = 'active'
  ) then
    raise exception 'recipient is not a member of this organization' using errcode = '42501';
  end if;

  insert into public.notifications (organization_id, user_id, type, title, message, entity_type, entity_id)
  values (p_organization_id, p_user_id, p_type, p_title, p_message, p_entity_type, p_entity_id)
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke execute on function public.create_notification(uuid, uuid, text, text, text, text, uuid) from public, anon;
grant  execute on function public.create_notification(uuid, uuid, text, text, text, text, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Seed the fixed automation-rule and template set on every new organization,
-- so every org starts with an explicit, visible, already-on set of rules --
-- not silently inert until someone finds a settings page. Same
-- create-or-replace pattern already used for self-reference/visibility
-- fixes (migrations 0007/0009).
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

  -- action_key uniquely identifies the RULE (trigger + intent); config's
  -- reminder_type/followup_type is what the reminder/follow-up row and its
  -- template actually key off. Two different rules (e.g. the confirm- and
  -- reschedule-triggered 24-hour reminders) can share the same
  -- reminder_type and therefore the same template without being the same
  -- rule -- each is independently toggleable in settings.
  insert into public.automation_rules (organization_id, trigger_type, action_type, action_key, name, config)
  values
    (v_org_id, 'appointment.created',     'reminder', 'confirmation',
      'Booking confirmation', '{"reminder_type": "confirmation"}'::jsonb),
    (v_org_id, 'appointment.confirmed',   'reminder', 'reminder_24h',
      '24-hour reminder', '{"reminder_type": "reminder_24h", "hours_before": 24}'::jsonb),
    (v_org_id, 'appointment.confirmed',   'reminder', 'reminder_2h',
      '2-hour reminder', '{"reminder_type": "reminder_2h", "hours_before": 2}'::jsonb),
    (v_org_id, 'appointment.rescheduled', 'reminder', 'reminder_24h_on_reschedule',
      '24-hour reminder (after reschedule)', '{"reminder_type": "reminder_24h", "hours_before": 24}'::jsonb),
    (v_org_id, 'appointment.rescheduled', 'reminder', 'reminder_2h_on_reschedule',
      '2-hour reminder (after reschedule)', '{"reminder_type": "reminder_2h", "hours_before": 2}'::jsonb),
    (v_org_id, 'appointment.completed',   'followup', 'followup_post_appointment',
      'Post-appointment follow-up',
      '{"followup_type": "post_appointment", "due_in_hours": 24, "priority": "normal"}'::jsonb),
    (v_org_id, 'appointment.no_show',     'followup', 'followup_no_show',
      'No-show follow-up',
      '{"followup_type": "no_show", "due_in_hours": 4, "priority": "high"}'::jsonb);

  -- channel 'email' -- reminders are patient-facing, and a patient has no
  -- login to receive an 'internal' notification (that channel is for
  -- staff, via public.create_notification()). No email provider is
  -- configured yet, so these will render correctly and then honestly report
  -- "not configured" when the processor tries to send them -- see
  -- lib/providers/messaging/not-configured.ts.
  insert into public.reminder_templates (organization_id, action_key, channel, name, subject, body)
  values
    (v_org_id, 'confirmation', 'email', 'Booking confirmation', 'Your appointment is confirmed',
      'Hi {{patient_name}}, your appointment with {{practitioner_name}} at {{clinic_name}} is confirmed for {{appointment_date}} at {{appointment_time}}.'),
    (v_org_id, 'reminder_24h', 'email', '24-hour reminder', 'Appointment reminder: tomorrow',
      'Hi {{patient_name}}, this is a reminder that you have an appointment with {{practitioner_name}} at {{clinic_name}} tomorrow, {{appointment_date}} at {{appointment_time}}.'),
    (v_org_id, 'reminder_2h', 'email', '2-hour reminder', 'Appointment reminder: today',
      'Hi {{patient_name}}, your appointment with {{practitioner_name}} at {{clinic_name}} is coming up today at {{appointment_time}}.');

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (v_org_id, v_actor, 'organization.created', 'organizations', v_org_id,
          jsonb_build_object('name', p_org_name, 'clinic_id', v_clinic_id));

  return v_org_id;
end;
$fn$;
