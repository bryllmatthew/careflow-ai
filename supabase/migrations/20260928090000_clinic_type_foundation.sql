-- ============================================================================
-- 0024 — Clinic type foundation
--
-- CareFlow serves dental, medical, aesthetic, therapy and wellness clinics.
-- Some features only make sense for one kind (a dental chart in an aesthetic
-- clinic is noise at best and a data-quality problem at worst), so the
-- platform needs to know what kind of clinic each clinic is, and needs ONE
-- place that decides which specialty features that kind gets.
--
-- Why the type lives on CLINICS, not only on organizations:
--
--   organizations.business_type has existed since migration 0001 and
--   onboarding already asks for it. But a single organization can run a
--   dental branch and an aesthetic branch ("Smile Dental & Aesthetic
--   Center"), so the organization's type cannot decide whether a given
--   patient gets a dental chart. The clinic is the unit that does the
--   clinical work, so the clinic carries the type.
--
--   organizations.business_type is kept, and now means "what the business
--   described itself as at sign-up" -- it becomes the DEFAULT type for the
--   organization's clinics, not a second source of truth for capabilities.
--   Nothing gates on it.
--
-- Values are lowercase text + CHECK, matching organizations.business_type
-- and every other enum in this schema (CLAUDE.md: "Enums are text + CHECK").
-- ============================================================================

alter table public.clinics
  add column clinic_type text not null default 'other'
    check (clinic_type in ('dental', 'medical', 'aesthetic', 'therapy', 'wellness', 'other')),
  -- Only meaningful for dental clinics. Lives here rather than in a
  -- dental-settings side table for the same reason branding does (migration
  -- 0019): one column does not earn a 1:1 table. It changes how tooth
  -- numbers are DISPLAYED only -- records are keyed by the ISO 3950 code
  -- (migration 0025), so switching FDI <-> Universal rewrites no history.
  add column tooth_numbering text not null default 'fdi'
    check (tooth_numbering in ('fdi', 'universal'));

comment on column public.clinics.clinic_type is
  'What kind of clinical work this clinic does. Drives specialty-module availability via app.clinic_type_has_capability(). Defaults from organizations.business_type at creation.';

comment on column public.clinics.tooth_numbering is
  'Display preference for tooth numbers in dental clinics: fdi (ISO 3950, "16") or universal ("3"). Storage is always the ISO 3950 code.';

-- Existing clinics inherit their organization's self-described type. Before
-- this migration that was the only type information anywhere, so it is the
-- best available answer rather than a guess.
update public.clinics c
   set clinic_type = o.business_type
  from public.organizations o
 where o.id = c.organization_id;

-- Writable through the existing clinics_update RLS policy (clinic.update).
grant update (clinic_type, tooth_numbering) on public.clinics to authenticated;

-- ----------------------------------------------------------------------------
-- The capability registry.
--
-- The ONE database-side answer to "does this kind of clinic get this
-- feature?". RLS policies on specialty tables call it, so a dental table is
-- unreadable and unwritable for a non-dental clinic even to the organization
-- owner, whatever the UI does. lib/clinic-types.ts is the application-side
-- mirror used for rendering; if the two ever disagree the failure is closed
-- -- the UI would offer a tab whose data the database then refuses -- never
-- open.
--
-- A capability is a whole specialty module ("dental"), not a list of
-- sub-features. Nothing in the product enables a dental chart without dental
-- history or vice versa, and a flag per sub-feature would be configuration
-- nobody sets. Future modules ('aesthetic', 'therapy', 'medical') are added
-- as new capability names here.
-- ----------------------------------------------------------------------------

create or replace function app.clinic_type_has_capability(p_clinic_type text, p_capability text)
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select exists (
    select 1
      from (values
        ('dental', 'dental')
        -- ('aesthetic', 'aesthetic'), ('therapy', 'therapy'), ... when built
      ) as registry (clinic_type, capability)
     where registry.clinic_type = p_clinic_type
       and registry.capability  = p_capability
  )
$fn$;

revoke execute on function app.clinic_type_has_capability(text, text) from public, anon;
grant  execute on function app.clinic_type_has_capability(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- app.capable_clinics — every clinic the caller belongs to that has a
-- capability, as an array.
--
-- Shaped like app.permitted_clinics() on purpose, so RLS can use the same
-- `clinic_id = any (select unnest(...))` form and Postgres evaluates it once
-- per statement as an InitPlan, not once per row. Scoped to the caller's own
-- organizations so it never scans the platform.
-- ----------------------------------------------------------------------------

create or replace function app.capable_clinics(p_capability text)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(array_agg(c.id), '{}'::uuid[])
    from public.clinics c
    join public.organization_memberships m
      on m.organization_id = c.organization_id
     and m.user_id = (select auth.uid())
     and m.status = 'active'
   where c.deleted_at is null
     and app.clinic_type_has_capability(c.clinic_type, p_capability)
$fn$;

revoke execute on function app.capable_clinics(text) from public, anon;
grant  execute on function app.capable_clinics(text) to authenticated;

-- ----------------------------------------------------------------------------
-- create_organization(): the first clinic takes the organization's type.
--
-- Body restated from 20260905090000_invoicing_core.sql (CREATE OR REPLACE has
-- no partial form);
-- the only change is clinic_type on the clinic insert.
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
  v_type          text := coalesce(nullif(btrim(p_business_type), ''), 'other');
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_org_name, ''))) = 0 then
    raise exception 'organization name is required' using errcode = '23514';
  end if;

  select id into v_owner_role_id from public.roles where key = 'owner' and organization_id is null;

  insert into public.organizations (name, business_type)
  values (btrim(p_org_name), v_type)
  returning id into v_org_id;

  insert into public.clinics (organization_id, name, clinic_type)
  values (v_org_id, coalesce(nullif(btrim(p_clinic_name), ''), btrim(p_org_name)), v_type)
  returning id into v_clinic_id;

  insert into public.organization_memberships (organization_id, user_id, status)
  values (v_org_id, v_actor, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id)
  values (v_actor, v_owner_role_id, v_org_id, null);

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
      '{"followup_type": "no_show", "due_in_hours": 4, "priority": "high"}'::jsonb),
    (v_org_id, 'invoice.overdue',         'followup', 'followup_invoice_overdue',
      'Overdue invoice follow-up',
      '{"followup_type": "payment", "due_in_hours": 0, "priority": "high"}'::jsonb);

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
          jsonb_build_object('name', p_org_name, 'clinic_id', v_clinic_id, 'clinic_type', v_type));

  return v_org_id;
end;
$fn$;
