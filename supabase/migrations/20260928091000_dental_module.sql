-- ============================================================================
-- 0025 — Dental module: odontogram, conditions, treatments, history
--
-- The first specialty module built on the clinic-type foundation (0024). See
-- docs/modules/DENTAL.md for the product-level description; this header
-- records the decisions the schema encodes.
--
-- 1. TOOTH IDENTITY. Every record is keyed by the ISO 3950 two-digit code
--    ("16" = upper right first molar), held in a static reference table. ISO
--    3950 (the FDI notation) is an international standard, so the code is
--    stable forever and unambiguous for permanent and primary teeth alike.
--    What a clinic SEES is derived from it per clinics.tooth_numbering: FDI
--    shows "16", Universal shows "3". Switching the preference changes
--    rendering only; no stored record is rewritten.
--
-- 2. CONDITIONS ARE NOT TREATMENTS. "Tooth 26 has caries" is an observation;
--    "composite restoration on 26" is a procedure with a lifecycle. They are
--    separate tables. A treatment may declare a `resulting_condition` (an
--    extraction results in 'extracted', a crown in 'crown'); completing the
--    treatment records that condition on every treated tooth. The link is
--    declared by the dentist when planning, never inferred from a procedure
--    name, and completing a treatment never resolves an existing condition on
--    its own -- whether the caries is gone is a clinical judgment.
--
-- 3. ONE PROCEDURE, MANY TEETH. A bridge across 14-16 is one treatment with
--    three rows in dental_treatment_teeth, not three treatments.
--
-- 4. NOTHING IS DELETED, NOTHING IS OVERWRITTEN. There is no DELETE policy
--    and no DELETE grant on any dental table. Conditions are resolved or
--    marked entered_in_error; treatments are cancelled, completed, or marked
--    entered_in_error. A completed treatment is frozen except for that one
--    correction path. Triggers enforce this, not just the RPCs, so the rules
--    hold whatever path a write takes.
--
-- 5. EVERY CHANGE IS AUDITED BY TRIGGER. Audit rows are written by AFTER
--    triggers, not by the RPCs, for the same reason: an audit trail that a
--    direct API write could skip is not an audit trail.
--
-- 6. THREE LAYERS OF ACCESS, ALL IN RLS. A dental row is visible only when
--    (a) the caller holds dental.view for the clinic, (b) the clinic's type
--    has the 'dental' capability, and (c) the caller can see the PATIENT --
--    so a practitioner limited to assigned patients sees exactly those
--    patients' charts. (b) means a non-dental clinic cannot hold or expose
--    dental data even to its owner.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Permissions
--
-- Three keys, following the coarse-grain precedent (CLAUDE.md, Phases 7 and
-- 10) rather than the brief's eight. The distinctions kept are the ones a
-- clinic actually enforces:
--
--   dental.view      read the chart, conditions, treatments, history
--   dental.record    record conditions, plan / schedule / cancel treatments,
--                    correct entries
--   dental.complete  mark a treatment performed -- a clinical sign-off, so it
--                    is separable from recording (an assistant may chart
--                    findings without being the one who signs off a procedure)
--
-- Defaults, per the brief's section 14 and least privilege on clinical data:
--   owner          all three (owner holds every permission by convention)
--   practitioner   all three
--   admin          view -- operational management, not clinical
--   clinic_manager view
--   receptionist   none -- a clinical record, not front-desk data. A clinic
--                  that wants reception to see treatment plans grants
--                  dental.view through a custom role; the default does not
--                  assume it.
--   finance, inventory_manager: none
-- ----------------------------------------------------------------------------

alter table public.role_permissions disable trigger role_permissions_no_system_writes;

insert into public.permissions (key, category, description) values
  ('dental.view',     'Dental', 'View dental charts, conditions, treatments and history'),
  ('dental.record',   'Dental', 'Record dental conditions and plan, schedule or cancel dental treatments'),
  ('dental.complete', 'Dental', 'Mark a dental treatment as performed (clinical sign-off)');

insert into public.role_permissions (role_id, permission_key)
select r.id, x.permission_key
  from public.roles r
  join (values
    ('owner',          'dental.view'), ('owner',        'dental.record'), ('owner', 'dental.complete'),
    ('practitioner',   'dental.view'), ('practitioner', 'dental.record'), ('practitioner', 'dental.complete'),
    ('admin',          'dental.view'),
    ('clinic_manager', 'dental.view')
  ) as x (role_key, permission_key) on x.role_key = r.key
 where r.organization_id is null;

alter table public.role_permissions enable trigger role_permissions_no_system_writes;

-- ----------------------------------------------------------------------------
-- Value domains
--
-- Domains rather than repeating the same CHECK on two tables: conditions and
-- treatments' resulting_condition must draw from one list. Adding a value is
-- still a one-line migration (CLAUDE.md's reason for text + CHECK over ENUM),
-- and the UI renders unknown codes by their raw name rather than breaking.
--
-- 'healthy' is deliberately NOT a stored condition. A healthy tooth is one
-- with no present findings; storing "healthy" would create a row that has to
-- be kept consistent with every other row on that tooth.
-- ----------------------------------------------------------------------------

create domain public.dental_condition_code as text
  check (value in (
    'caries', 'restoration', 'crown', 'bridge', 'implant', 'root_canal_treated',
    'missing', 'extracted', 'impacted', 'for_extraction', 'under_observation', 'other'
  ));

-- buccal covers buccal/facial/labial; lingual covers lingual/palatal. Occlusal
-- applies to posterior teeth and incisal to anterior ones; the UI offers the
-- right one per tooth rather than the schema forbidding the other, because
-- clinicians do occasionally chart the "wrong" one on a canine.
create domain public.dental_surface_set as text[]
  check (value <@ array['mesial', 'distal', 'buccal', 'lingual', 'occlusal', 'incisal']::text[]);

-- ----------------------------------------------------------------------------
-- dental_teeth — static reference data, one row per tooth.
-- ----------------------------------------------------------------------------

create table public.dental_teeth (
  code         smallint primary key check (code between 11 and 85),
  dentition    text     not null check (dentition in ('permanent', 'primary')),
  arch         text     not null check (arch in ('upper', 'lower')),
  -- The PATIENT's right/left, which is the dental convention. A chart drawn
  -- facing the patient shows the patient's right on the viewer's left.
  side         text     not null check (side in ('right', 'left')),
  -- 1 = central incisor ... 8 = third molar, counted from the midline.
  position     smallint not null check (position between 1 and 8),
  tooth_class  text     not null check (tooth_class in ('incisor', 'canine', 'premolar', 'molar')),
  name         text     not null,
  -- Universal (ADA) designation, derived once here so the display layer never
  -- computes it. Text, not a number: primary teeth are lettered A-T.
  universal    text     not null
);

comment on table public.dental_teeth is
  'Reference data: every tooth keyed by its ISO 3950 (FDI) code. Records reference the code; display numbering is derived from these columns.';

-- The 32 permanent teeth. Quadrants: 1 upper right, 2 upper left, 3 lower
-- left, 4 lower right. Universal runs 1 (upper right third molar) across to
-- 16 (upper left third molar), then 17 (lower left third molar) back to 32.
insert into public.dental_teeth (code, dentition, arch, side, position, tooth_class, name, universal)
select q * 10 + p,
       'permanent',
       case when q in (1, 2) then 'upper' else 'lower' end,
       case when q in (1, 4) then 'right' else 'left' end,
       p,
       case when p <= 2 then 'incisor' when p = 3 then 'canine' when p <= 5 then 'premolar' else 'molar' end,
       case when q in (1, 2) then 'Upper' else 'Lower' end || ' '
         || case when q in (1, 4) then 'right' else 'left' end || ' '
         || (array['central incisor', 'lateral incisor', 'canine', 'first premolar',
                   'second premolar', 'first molar', 'second molar', 'third molar'])[p],
       (case q when 1 then 9 - p when 2 then 8 + p when 3 then 25 - p when 4 then 24 + p end)::text
  from generate_series(1, 4) as q, generate_series(1, 8) as p;

alter table public.dental_teeth enable row level security;

-- Static, non-tenant reference data: readable by any signed-in user, like a
-- lookup table. Nobody writes it; the tooth list changes by migration.
create policy dental_teeth_select on public.dental_teeth
  for select to authenticated using (true);

revoke insert, update, delete on public.dental_teeth from authenticated, anon;
revoke all on public.dental_teeth from anon;

-- ----------------------------------------------------------------------------
-- dental_treatments
-- ----------------------------------------------------------------------------

create table public.dental_treatments (
  id                   uuid        primary key default gen_random_uuid(),
  organization_id      uuid        not null references public.organizations (id) on delete cascade,
  clinic_id            uuid        not null,
  patient_id           uuid        not null,
  appointment_id       uuid,
  service_id           uuid,
  -- Who performed / will perform it. A profile, as everywhere else in this
  -- schema (there is no staff table -- migrations 0011/0013).
  practitioner_id      uuid        references public.profiles (id) on delete set null,
  procedure            text        not null check (length(btrim(procedure)) between 1 and 200),
  -- Applied to every treated tooth when the treatment is completed.
  resulting_condition  public.dental_condition_code,
  status               text        not null default 'planned'
                                   check (status in ('planned', 'scheduled', 'completed',
                                                     'cancelled', 'entered_in_error')),
  notes                text        check (notes is null or length(notes) <= 4000),
  -- Why it was cancelled or marked entered_in_error.
  status_reason        text        check (status_reason is null or length(status_reason) <= 1000),
  planned_at           timestamptz not null default now(),
  planned_by           uuid        references public.profiles (id) on delete set null,
  completed_at         timestamptz,
  completed_by         uuid        references public.profiles (id) on delete set null,
  closed_at            timestamptz,
  closed_by            uuid        references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint dental_treatments_id_org_uk unique (id, organization_id),
  constraint dental_treatments_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint dental_treatments_patient_fk foreign key (patient_id, organization_id)
    references public.patients (id, organization_id),
  constraint dental_treatments_appointment_fk foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id),
  constraint dental_treatments_service_fk foreign key (service_id, organization_id)
    references public.services (id, organization_id),
  constraint dental_treatments_completion_ck check (
    (status = 'completed') = (completed_at is not null)
    or status = 'entered_in_error'
  )
);

comment on table public.dental_treatments is
  'A dental procedure through its lifecycle: planned -> scheduled -> completed, or cancelled / entered_in_error. Never deleted; completed rows are frozen except for the entered_in_error correction.';

create trigger dental_treatments_set_updated_at
  before update on public.dental_treatments
  for each row execute function public.set_updated_at();

create index dental_treatments_patient_ix on public.dental_treatments (patient_id, planned_at desc);
create index dental_treatments_clinic_status_ix on public.dental_treatments (clinic_id, status);
create index dental_treatments_appointment_ix on public.dental_treatments (appointment_id)
  where appointment_id is not null;

-- ----------------------------------------------------------------------------
-- dental_treatment_teeth — which teeth (and surfaces) a treatment covers.
-- ----------------------------------------------------------------------------

create table public.dental_treatment_teeth (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations (id) on delete cascade,
  clinic_id        uuid        not null,
  treatment_id     uuid        not null,
  tooth_code       smallint    not null references public.dental_teeth (code),
  surfaces         public.dental_surface_set not null default '{}',
  created_at       timestamptz not null default now(),

  constraint dental_treatment_teeth_uk unique (treatment_id, tooth_code),
  constraint dental_treatment_teeth_treatment_fk foreign key (treatment_id, organization_id)
    references public.dental_treatments (id, organization_id),
  constraint dental_treatment_teeth_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id)
);

create index dental_treatment_teeth_tooth_ix on public.dental_treatment_teeth (tooth_code);

-- ----------------------------------------------------------------------------
-- dental_conditions — observations about one tooth.
-- ----------------------------------------------------------------------------

create table public.dental_conditions (
  id                   uuid        primary key default gen_random_uuid(),
  organization_id      uuid        not null references public.organizations (id) on delete cascade,
  clinic_id            uuid        not null,
  patient_id           uuid        not null,
  tooth_code           smallint    not null references public.dental_teeth (code),
  surfaces             public.dental_surface_set not null default '{}',
  condition            public.dental_condition_code not null,
  status               text        not null default 'present'
                                   check (status in ('present', 'resolved', 'entered_in_error')),
  notes                text        check (notes is null or length(notes) <= 2000),
  -- Set when the condition was produced by completing a treatment
  -- (resulting_condition), so history can say "crown -- from treatment X".
  source_treatment_id  uuid,
  noted_at             timestamptz not null default now(),
  noted_by             uuid        references public.profiles (id) on delete set null,
  closed_at            timestamptz,
  closed_by            uuid        references public.profiles (id) on delete set null,
  status_reason        text        check (status_reason is null or length(status_reason) <= 1000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  constraint dental_conditions_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint dental_conditions_patient_fk foreign key (patient_id, organization_id)
    references public.patients (id, organization_id),
  constraint dental_conditions_source_fk foreign key (source_treatment_id, organization_id)
    references public.dental_treatments (id, organization_id)
);

comment on table public.dental_conditions is
  'Findings on one tooth (caries, crown, missing...). present -> resolved | entered_in_error; never edited in place, never deleted. A tooth with no present findings is healthy.';

create trigger dental_conditions_set_updated_at
  before update on public.dental_conditions
  for each row execute function public.set_updated_at();

create index dental_conditions_patient_tooth_ix on public.dental_conditions (patient_id, tooth_code, noted_at desc);

-- ----------------------------------------------------------------------------
-- Integrity triggers: stamping, the state machines, and immutability.
--
-- BEFORE triggers run with the caller's rights, so their reads of patients /
-- appointments / services are RLS-filtered -- a caller cannot link a record
-- they could not otherwise see.
-- ----------------------------------------------------------------------------

create or replace function public.dental_treatments_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    new.planned_by   := v_actor;
    new.planned_at   := now();
    new.completed_at := null;
    new.completed_by := null;
    new.closed_at    := null;
    new.closed_by    := null;
    new.status_reason := null;
    -- Creation is always a plan. Completion happens as a separate UPDATE so
    -- the sign-off rules below exist in exactly one place, whatever path
    -- recorded the treatment.
    new.status := case when new.appointment_id is null then 'planned' else 'scheduled' end;
  else
    -- Identity never changes.
    if new.organization_id is distinct from old.organization_id
       or new.clinic_id is distinct from old.clinic_id
       or new.patient_id is distinct from old.patient_id
       or new.planned_at is distinct from old.planned_at
       or new.planned_by is distinct from old.planned_by then
      raise exception 'a dental treatment''s patient, clinic and planning record cannot change'
        using errcode = '42501';
    end if;

    if old.status in ('cancelled', 'entered_in_error') then
      raise exception 'this treatment is closed and cannot be changed' using errcode = '42501';
    end if;

    if old.status = 'completed' then
      -- The ONE change a performed procedure admits: flagging it as recorded
      -- in error, with a reason. Everything else about it is history.
      if new.status <> 'entered_in_error'
         or new.procedure is distinct from old.procedure
         or new.resulting_condition is distinct from old.resulting_condition
         or new.appointment_id is distinct from old.appointment_id
         or new.service_id is distinct from old.service_id
         or new.practitioner_id is distinct from old.practitioner_id
         or new.notes is distinct from old.notes
         or new.completed_at is distinct from old.completed_at
         or new.completed_by is distinct from old.completed_by then
        raise exception 'a completed treatment can only be marked as entered in error'
          using errcode = '42501';
      end if;
    end if;

    if new.status = 'completed' and old.status <> 'completed' then
      if not (new.clinic_id = any (app.permitted_clinics('dental.complete'))) then
        raise exception 'marking a treatment as performed requires dental.complete'
          using errcode = '42501';
      end if;
      new.completed_at := now();
      new.completed_by := v_actor;
    elsif new.status <> 'completed' then
      new.completed_at := null;
      new.completed_by := null;
    end if;

    if new.status in ('cancelled', 'entered_in_error') and old.status <> new.status then
      if new.status = 'entered_in_error' and coalesce(btrim(new.status_reason), '') = '' then
        raise exception 'say why this record was entered in error' using errcode = '23514';
      end if;
      new.closed_at := now();
      new.closed_by := v_actor;
      -- entered_in_error on a completed treatment keeps its completion stamps
      -- as evidence of what was originally recorded.
      if old.status = 'completed' then
        new.completed_at := old.completed_at;
        new.completed_by := old.completed_by;
      end if;
    end if;

    -- Linking or unlinking an appointment moves a plan between planned and
    -- scheduled; it never completes anything (brief section 10).
    if new.status in ('planned', 'scheduled') then
      new.status := case when new.appointment_id is null then 'planned' else 'scheduled' end;
    end if;
  end if;

  -- Links must stay within the same patient and clinic.
  if new.appointment_id is not null
     and (tg_op = 'INSERT' or new.appointment_id is distinct from old.appointment_id) then
    if not exists (
      select 1 from public.appointments a
       where a.id = new.appointment_id and a.patient_id = new.patient_id
    ) then
      raise exception 'that appointment does not belong to this patient' using errcode = '23514';
    end if;
  end if;

  if new.service_id is not null
     and (tg_op = 'INSERT' or new.service_id is distinct from old.service_id) then
    if not exists (
      select 1 from public.services s
       where s.id = new.service_id and s.clinic_id = new.clinic_id
    ) then
      raise exception 'that service is not offered at this patient''s clinic' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$fn$;

create trigger dental_treatments_guard
  before insert or update on public.dental_treatments
  for each row execute function public.dental_treatments_guard();

create or replace function public.dental_treatment_teeth_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_parent public.dental_treatments;
begin
  select * into v_parent from public.dental_treatments where id = new.treatment_id;
  if not found then
    raise exception 'treatment not found' using errcode = '23503';
  end if;
  if v_parent.status not in ('planned', 'scheduled') then
    raise exception 'teeth can only be added to a treatment that has not been performed'
      using errcode = '42501';
  end if;
  -- Taken from the parent, never from the caller.
  new.organization_id := v_parent.organization_id;
  new.clinic_id := v_parent.clinic_id;
  return new;
end;
$fn$;

create trigger dental_treatment_teeth_guard
  before insert on public.dental_treatment_teeth
  for each row execute function public.dental_treatment_teeth_guard();

create or replace function public.dental_conditions_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    new.status        := 'present';
    new.noted_at      := now();
    new.noted_by      := v_actor;
    new.closed_at     := null;
    new.closed_by     := null;
    new.status_reason := null;
    -- source_treatment_id is deliberately absent from the authenticated
    -- INSERT grant below, so a client cannot claim a condition came from a
    -- treatment; only the completion trigger (running as the table owner)
    -- writes that link.
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.clinic_id is distinct from old.clinic_id
     or new.patient_id is distinct from old.patient_id
     or new.tooth_code is distinct from old.tooth_code
     or new.surfaces is distinct from old.surfaces
     or new.condition is distinct from old.condition
     or new.notes is distinct from old.notes
     or new.source_treatment_id is distinct from old.source_treatment_id
     or new.noted_at is distinct from old.noted_at
     or new.noted_by is distinct from old.noted_by then
    raise exception 'a recorded condition cannot be edited -- resolve it or mark it entered in error, then record a new one'
      using errcode = '42501';
  end if;

  if old.status = 'entered_in_error' then
    raise exception 'this record was marked entered in error and is closed' using errcode = '42501';
  end if;

  if not (
       (old.status = 'present'  and new.status in ('present', 'resolved', 'entered_in_error'))
    or (old.status = 'resolved' and new.status in ('resolved', 'entered_in_error'))
  ) then
    raise exception 'a condition cannot move from % to %', old.status, new.status
      using errcode = '42501';
  end if;

  if new.status <> old.status then
    if new.status = 'entered_in_error' and coalesce(btrim(new.status_reason), '') = '' then
      raise exception 'say why this record was entered in error' using errcode = '23514';
    end if;
    new.closed_at := now();
    new.closed_by := v_actor;
  end if;

  return new;
end;
$fn$;

create trigger dental_conditions_guard
  before insert or update on public.dental_conditions
  for each row execute function public.dental_conditions_guard();

-- ----------------------------------------------------------------------------
-- Completion writes the resulting condition onto every treated tooth.
--
-- SECURITY DEFINER: the condition is a consequence of an authorized
-- completion, so the completer needs dental.complete (checked in the guard)
-- but not also dental.record. noted_by is still the real completer, because
-- auth.uid() reads the request's JWT claims, not the executing role.
-- ----------------------------------------------------------------------------

create or replace function public.dental_treatments_apply_result()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if new.status = 'completed' and old.status <> 'completed' and new.resulting_condition is not null then
    insert into public.dental_conditions (
      organization_id, clinic_id, patient_id, tooth_code, surfaces, condition, source_treatment_id
    )
    select new.organization_id, new.clinic_id, new.patient_id, tt.tooth_code, tt.surfaces,
           new.resulting_condition, new.id
      from public.dental_treatment_teeth tt
     where tt.treatment_id = new.id;
  end if;
  return null;
end;
$fn$;

create trigger dental_treatments_apply_result
  after update on public.dental_treatments
  for each row execute function public.dental_treatments_apply_result();

revoke execute on function public.dental_treatments_apply_result() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Audit (brief section 16). SECURITY DEFINER because audit_logs has no client
-- insert path (migration 0004). Metadata carries ids and clinical codes, not
-- patient names (audit_logs' own rule: avoid patient-identifying detail).
-- ----------------------------------------------------------------------------

create or replace function public.dental_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_action text;
  v_meta   jsonb;
begin
  if tg_table_name = 'dental_conditions' then
    v_action := case
      when tg_op = 'INSERT' and new.source_treatment_id is not null then 'dental.condition.recorded_from_treatment'
      when tg_op = 'INSERT' then 'dental.condition.added'
      when new.status = 'resolved' then 'dental.condition.resolved'
      when new.status = 'entered_in_error' then 'dental.condition.corrected'
      else 'dental.condition.updated'
    end;
    v_meta := jsonb_build_object(
      'patient_id', new.patient_id, 'clinic_id', new.clinic_id,
      'tooth_code', new.tooth_code, 'surfaces', to_jsonb(new.surfaces),
      'condition', new.condition, 'status', new.status,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'reason', new.status_reason, 'source_treatment_id', new.source_treatment_id
    );
    insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
    values (new.organization_id, (select auth.uid()), v_action, 'dental_condition', new.id, v_meta);

  elsif tg_table_name = 'dental_treatments' then
    if tg_op = 'UPDATE' and new.status = old.status
       and new.appointment_id is not distinct from old.appointment_id
       and new.notes is not distinct from old.notes
       and new.practitioner_id is not distinct from old.practitioner_id then
      return null;   -- nothing clinically meaningful changed
    end if;
    v_action := case
      when tg_op = 'INSERT' then 'dental.treatment.planned'
      when new.status <> old.status and new.status = 'completed' then 'dental.treatment.completed'
      when new.status <> old.status and new.status = 'cancelled' then 'dental.treatment.cancelled'
      when new.status <> old.status and new.status = 'entered_in_error' then 'dental.treatment.corrected'
      when new.status <> old.status and new.status = 'scheduled' then 'dental.treatment.scheduled'
      when new.status <> old.status and new.status = 'planned' then 'dental.treatment.unscheduled'
      else 'dental.treatment.updated'
    end;
    v_meta := jsonb_build_object(
      'patient_id', new.patient_id, 'clinic_id', new.clinic_id,
      'procedure', new.procedure, 'status', new.status,
      'previous_status', case when tg_op = 'UPDATE' then old.status end,
      'appointment_id', new.appointment_id,
      'previous_appointment_id', case when tg_op = 'UPDATE' then old.appointment_id end,
      'service_id', new.service_id, 'practitioner_id', new.practitioner_id,
      'resulting_condition', new.resulting_condition, 'reason', new.status_reason
    );
    insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
    values (new.organization_id, (select auth.uid()), v_action, 'dental_treatment', new.id, v_meta);

  elsif tg_table_name = 'dental_treatment_teeth' then
    insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
    values (new.organization_id, (select auth.uid()), 'dental.treatment.tooth_added',
            'dental_treatment', new.treatment_id,
            jsonb_build_object('clinic_id', new.clinic_id, 'tooth_code', new.tooth_code,
                               'surfaces', to_jsonb(new.surfaces)));
  end if;

  return null;
end;
$fn$;

create trigger dental_conditions_audit
  after insert or update on public.dental_conditions
  for each row execute function public.dental_audit();

create trigger dental_treatments_audit
  after insert or update on public.dental_treatments
  for each row execute function public.dental_audit();

create trigger dental_treatment_teeth_audit
  after insert on public.dental_treatment_teeth
  for each row execute function public.dental_audit();

revoke execute on function public.dental_audit() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- A clinic holding dental records cannot quietly stop being a dental clinic.
--
-- Every dental policy requires the clinic's type to have the 'dental'
-- capability, so re-typing a clinic would make its patients' dental history
-- vanish from every screen -- not deleted, but unreachable. That is the kind
-- of silent loss clinical records must not suffer, so the change is refused
-- until someone deliberately deals with the records. SECURITY DEFINER so the
-- check sees rows the person editing the clinic may not have dental.view for.
-- ----------------------------------------------------------------------------

create or replace function public.clinics_guard_dental_type_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if app.clinic_type_has_capability(old.clinic_type, 'dental')
     and not app.clinic_type_has_capability(new.clinic_type, 'dental')
     and (exists (select 1 from public.dental_conditions where clinic_id = old.id)
          or exists (select 1 from public.dental_treatments where clinic_id = old.id)) then
    raise exception 'this clinic has dental records, so it cannot be changed to a non-dental clinic type'
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;

create trigger clinics_guard_dental_type_change
  before update of clinic_type on public.clinics
  for each row execute function public.clinics_guard_dental_type_change();

revoke execute on function public.clinics_guard_dental_type_change() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- Each policy is three conditions, all evaluated the fast way (InitPlan
-- arrays, CLAUDE.md), plus a correlated EXISTS against patients that runs
-- under the patients table's own RLS -- which is precisely what makes a
-- practitioner's view of dental charts follow their view of patients.
-- ----------------------------------------------------------------------------

alter table public.dental_treatments      enable row level security;
alter table public.dental_treatment_teeth enable row level security;
alter table public.dental_conditions      enable row level security;

create policy dental_treatments_select on public.dental_treatments
  for select to authenticated
  using (
    clinic_id = any (select unnest(app.permitted_clinics('dental.view')))
    and clinic_id = any (select unnest(app.capable_clinics('dental')))
    and exists (select 1 from public.patients p where p.id = patient_id)
  );

create policy dental_treatments_insert on public.dental_treatments
  for insert to authenticated
  with check (
    clinic_id = any (select unnest(app.permitted_clinics('dental.record')))
    and clinic_id = any (select unnest(app.capable_clinics('dental')))
    and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = clinic_id)
  );

-- dental.record for ordinary changes; dental.complete alone is enough to
-- reach the row for sign-off (the guard then requires dental.complete for the
-- completion itself, and nothing else changes on that path).
create policy dental_treatments_update on public.dental_treatments
  for update to authenticated
  using (
    (clinic_id = any (select unnest(app.permitted_clinics('dental.record')))
     or clinic_id = any (select unnest(app.permitted_clinics('dental.complete'))))
    and clinic_id = any (select unnest(app.capable_clinics('dental')))
    and exists (select 1 from public.patients p where p.id = patient_id)
  )
  with check (
    (clinic_id = any (select unnest(app.permitted_clinics('dental.record')))
     or clinic_id = any (select unnest(app.permitted_clinics('dental.complete'))))
    and clinic_id = any (select unnest(app.capable_clinics('dental')))
  );

create policy dental_treatment_teeth_select on public.dental_treatment_teeth
  for select to authenticated
  using ( exists (select 1 from public.dental_treatments t where t.id = treatment_id) );

create policy dental_treatment_teeth_insert on public.dental_treatment_teeth
  for insert to authenticated
  with check (
    clinic_id = any (select unnest(app.permitted_clinics('dental.record')))
    and clinic_id = any (select unnest(app.capable_clinics('dental')))
    and exists (select 1 from public.dental_treatments t where t.id = treatment_id)
  );

create policy dental_conditions_select on public.dental_conditions
  for select to authenticated
  using (
    clinic_id = any (select unnest(app.permitted_clinics('dental.view')))
    and clinic_id = any (select unnest(app.capable_clinics('dental')))
    and exists (select 1 from public.patients p where p.id = patient_id)
  );

create policy dental_conditions_insert on public.dental_conditions
  for insert to authenticated
  with check (
    clinic_id = any (select unnest(app.permitted_clinics('dental.record')))
    and clinic_id = any (select unnest(app.capable_clinics('dental')))
    and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = clinic_id)
  );

create policy dental_conditions_update on public.dental_conditions
  for update to authenticated
  using (
    clinic_id = any (select unnest(app.permitted_clinics('dental.record')))
    and clinic_id = any (select unnest(app.capable_clinics('dental')))
    and exists (select 1 from public.patients p where p.id = patient_id)
  )
  with check (
    clinic_id = any (select unnest(app.permitted_clinics('dental.record')))
    and clinic_id = any (select unnest(app.capable_clinics('dental')))
  );

-- No DELETE policy on any dental table, and the privilege itself is revoked
-- so the failure is an explicit 42501 rather than a silent no-op.
revoke delete on public.dental_treatments, public.dental_treatment_teeth, public.dental_conditions
  from authenticated;

-- Column-level grants. INSERT is limited to the columns a caller may
-- legitimately supply -- stamps (planned_by, noted_at, completed_*, closed_*),
-- status and provenance (source_treatment_id) are the system's to write, and
-- a client naming one of them gets a permission error rather than a silently
-- overwritten value. UPDATE is limited so tenancy and identity columns are
-- immutable (CLAUDE.md); the guards enforce the rest.
revoke insert on public.dental_treatments from authenticated;
grant insert (organization_id, clinic_id, patient_id, appointment_id, service_id,
              practitioner_id, procedure, resulting_condition, notes)
  on public.dental_treatments to authenticated;

revoke insert on public.dental_treatment_teeth from authenticated;
grant insert (organization_id, clinic_id, treatment_id, tooth_code, surfaces)
  on public.dental_treatment_teeth to authenticated;

revoke insert on public.dental_conditions from authenticated;
grant insert (organization_id, clinic_id, patient_id, tooth_code, surfaces, condition, notes)
  on public.dental_conditions to authenticated;

revoke update on public.dental_treatments from authenticated;
grant update (status, status_reason, appointment_id, notes, practitioner_id)
  on public.dental_treatments to authenticated;

revoke update on public.dental_treatment_teeth from authenticated;

revoke update on public.dental_conditions from authenticated;
grant update (status, status_reason) on public.dental_conditions to authenticated;

revoke all on public.dental_treatments, public.dental_treatment_teeth, public.dental_conditions
  from anon;

-- ----------------------------------------------------------------------------
-- Write RPCs (SECURITY INVOKER -- RLS and the guards stay the enforcement
-- point; these exist because each write spans several rows, and PostgREST
-- gives one transaction per request).
--
-- None accepts a clinic or organization id: both are read off the patient,
-- under the caller's RLS (CLAUDE.md rule 4).
-- ----------------------------------------------------------------------------

create or replace function public.dental_record_conditions(
  p_patient_id  uuid,
  p_tooth_codes smallint[],
  p_condition   text,
  p_surfaces    text[] default '{}',
  p_notes       text   default null
)
returns uuid[]
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_patient record;
  v_ids     uuid[];
begin
  select id, organization_id, clinic_id into v_patient
    from public.patients where id = p_patient_id;
  if not found then
    raise exception 'patient not found' using errcode = '42501';
  end if;
  if coalesce(array_length(p_tooth_codes, 1), 0) = 0 then
    raise exception 'select at least one tooth' using errcode = '23514';
  end if;

  with inserted as (
    insert into public.dental_conditions (
      organization_id, clinic_id, patient_id, tooth_code, surfaces, condition, notes
    )
    select v_patient.organization_id, v_patient.clinic_id, v_patient.id, t.code,
           coalesce(p_surfaces, '{}')::public.dental_surface_set,
           p_condition::public.dental_condition_code,
           nullif(btrim(coalesce(p_notes, '')), '')
      from (select distinct unnest(p_tooth_codes) as code) t
    returning id
  )
  select array_agg(id) into v_ids from inserted;

  return v_ids;
end;
$fn$;

create or replace function public.dental_set_condition_status(
  p_condition_id uuid,
  p_status       text,
  p_reason       text default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
begin
  update public.dental_conditions
     set status = p_status,
         status_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_condition_id;
  if not found then
    raise exception 'condition not found' using errcode = '42501';
  end if;
end;
$fn$;

-- p_teeth: [{"tooth_code": 16, "surfaces": ["mesial", "occlusal"]}, ...]
-- p_complete_now records a procedure performed today in one step: it is
-- still created as a plan and then completed, so the completion rules run
-- exactly as they do for a treatment planned weeks ago.
create or replace function public.dental_plan_treatment(
  p_patient_id          uuid,
  p_procedure           text,
  p_teeth               jsonb,
  p_service_id          uuid    default null,
  p_appointment_id      uuid    default null,
  p_practitioner_id     uuid    default null,
  p_resulting_condition text    default null,
  p_notes               text    default null,
  p_complete_now        boolean default false
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_patient      record;
  v_procedure    text := nullif(btrim(coalesce(p_procedure, '')), '');
  v_practitioner uuid := p_practitioner_id;
  v_id           uuid;
begin
  select id, organization_id, clinic_id into v_patient
    from public.patients where id = p_patient_id;
  if not found then
    raise exception 'patient not found' using errcode = '42501';
  end if;
  if jsonb_typeof(p_teeth) <> 'array' or jsonb_array_length(p_teeth) = 0 then
    raise exception 'select at least one tooth' using errcode = '23514';
  end if;

  if v_procedure is null and p_service_id is not null then
    select name into v_procedure from public.services where id = p_service_id;
  end if;
  if v_procedure is null then
    raise exception 'name the procedure or choose a service' using errcode = '23514';
  end if;

  if v_practitioner is null and p_appointment_id is not null then
    select staff_id into v_practitioner from public.appointments where id = p_appointment_id;
  end if;
  v_practitioner := coalesce(v_practitioner, (select auth.uid()));

  insert into public.dental_treatments (
    organization_id, clinic_id, patient_id, appointment_id, service_id, practitioner_id,
    procedure, resulting_condition, notes
  ) values (
    v_patient.organization_id, v_patient.clinic_id, v_patient.id, p_appointment_id, p_service_id,
    v_practitioner, v_procedure,
    nullif(btrim(coalesce(p_resulting_condition, '')), '')::public.dental_condition_code,
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_id;

  insert into public.dental_treatment_teeth (organization_id, clinic_id, treatment_id, tooth_code, surfaces)
  select v_patient.organization_id, v_patient.clinic_id, v_id,
         (t ->> 'tooth_code')::smallint,
         coalesce(
           (select array_agg(s) from jsonb_array_elements_text(coalesce(t -> 'surfaces', '[]'::jsonb)) as s),
           '{}'
         )::public.dental_surface_set
    from jsonb_array_elements(p_teeth) as t;

  if p_complete_now then
    update public.dental_treatments set status = 'completed' where id = v_id;
  end if;

  return v_id;
end;
$fn$;

-- Link a plan to an appointment (planned -> scheduled), or unlink it (null).
create or replace function public.dental_schedule_treatment(
  p_treatment_id   uuid,
  p_appointment_id uuid
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
begin
  update public.dental_treatments
     set appointment_id = p_appointment_id
   where id = p_treatment_id;
  if not found then
    raise exception 'treatment not found' using errcode = '42501';
  end if;
end;
$fn$;

create or replace function public.dental_complete_treatment(
  p_treatment_id uuid,
  p_notes        text default null
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
begin
  update public.dental_treatments
     set status = 'completed',
         notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), notes)
   where id = p_treatment_id;
  if not found then
    raise exception 'treatment not found' using errcode = '42501';
  end if;
end;
$fn$;

-- Cancel a plan, or mark any treatment (including a completed one) as
-- entered in error. Neither deletes anything.
create or replace function public.dental_close_treatment(
  p_treatment_id     uuid,
  p_reason           text,
  p_entered_in_error boolean default false
)
returns void
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
begin
  update public.dental_treatments
     set status = case when p_entered_in_error then 'entered_in_error' else 'cancelled' end,
         status_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_treatment_id;
  if not found then
    raise exception 'treatment not found' using errcode = '42501';
  end if;
end;
$fn$;

revoke execute on function public.dental_record_conditions(uuid, smallint[], text, text[], text) from public, anon;
revoke execute on function public.dental_set_condition_status(uuid, text, text) from public, anon;
revoke execute on function public.dental_plan_treatment(uuid, text, jsonb, uuid, uuid, uuid, text, text, boolean) from public, anon;
revoke execute on function public.dental_schedule_treatment(uuid, uuid) from public, anon;
revoke execute on function public.dental_complete_treatment(uuid, text) from public, anon;
revoke execute on function public.dental_close_treatment(uuid, text, boolean) from public, anon;

grant execute on function public.dental_record_conditions(uuid, smallint[], text, text[], text) to authenticated;
grant execute on function public.dental_set_condition_status(uuid, text, text) to authenticated;
grant execute on function public.dental_plan_treatment(uuid, text, jsonb, uuid, uuid, uuid, text, text, boolean) to authenticated;
grant execute on function public.dental_schedule_treatment(uuid, uuid) to authenticated;
grant execute on function public.dental_complete_treatment(uuid, text) to authenticated;
grant execute on function public.dental_close_treatment(uuid, text, boolean) to authenticated;
