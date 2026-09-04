-- ============================================================================
-- 0015 — Sales & Invoicing (Phase 5)
--
-- docs/PRODUCT_SPEC.md section 10, docs/DATABASE_SCHEMA.md's invoices/
-- invoice_items field lists, docs/ARCHITECTURE.md's financial-integrity
-- rules, CLAUDE.md's "Derived financial values ... computed only in the
-- database by SECURITY DEFINER rollup triggers. The app never computes a
-- total it then writes."
--
-- Deliberate scope decisions for this pass (Phase 5 brief section 51 is
-- explicit that manual payment recording is Phase 6, correcting CLAUDE.md's
-- earlier-recorded deviation note -- that note is updated alongside this
-- migration):
--   - No `payments` table yet. `invoices.amount_paid` is a real column,
--     defaulting to 0 and writable by nothing in this phase -- Phase 6 is
--     the only thing that will ever move it. status therefore never reaches
--     'partially_paid'/'paid' yet; both are kept in the CHECK constraint
--     because they are real future states, not because anything produces
--     them today.
--   - No product line items. No products/inventory table exists yet
--     (Phase 7) -- invoice_items.service_id is the only source column, kept
--     nullable so a manually-typed line (no matching service) is still
--     possible, rather than adding a product_id nobody can populate.
--   - No per-clinic/org tax configuration table. invoices.tax_rate is a
--     plain per-invoice percentage, defaulting to 0 -- CLAUDE.md's "Known
--     open questions" already flags the compliance/tax regime as
--     unresolved; a config table would be encoding a policy nobody has
--     specified yet.
--   - "Overdue" is not a value anything sets directly -- see the
--     invoices_overdue view below and app/api/cron/check-overdue-invoices.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- New permissions
-- ----------------------------------------------------------------------------

insert into public.permissions (key, category, description) values
  ('invoices.issue',          'Billing', 'Issue a draft invoice, assigning its invoice number'),
  ('invoices.apply_discount', 'Billing', 'Apply or change a discount on an invoice');

-- Same disable/insert/enable dance migration 0014 used: the system-role-
-- immutability trigger (negative-security-matrix Test #10) is a table
-- property, not scoped to migration 0002.
alter table public.role_permissions disable trigger role_permissions_no_system_writes;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
 cross join (values ('invoices.issue'), ('invoices.apply_discount')) as p(key)
 where r.organization_id is null and r.key = 'owner';

insert into public.role_permissions (role_id, permission_key)
select r.id, x.permission_key
  from public.roles r
  join (values
    ('admin', 'invoices.issue'), ('admin', 'invoices.apply_discount'),
    ('clinic_manager', 'invoices.issue'), ('clinic_manager', 'invoices.apply_discount'),
    -- Receptionist can issue (docs/AUTHORIZATION.md Phase 5 brief section 28:
    -- "issue invoices if permitted") but not discount -- that stays with
    -- roles that already carry pricing/financial authority.
    ('receptionist', 'invoices.issue'),
    ('finance', 'invoices.issue'), ('finance', 'invoices.apply_discount')
  ) as x(role_key, permission_key)
    on r.key = x.role_key
 where r.organization_id is null;

alter table public.role_permissions enable trigger role_permissions_no_system_writes;

-- ----------------------------------------------------------------------------
-- Phase 4's automation engine gets four new trigger types. No new action_type
-- is needed -- invoice.overdue reuses action_type='followup' with the
-- existing 'payment' follow-up type (migration 0014), matching "Appointment
-- -> Invoice -> Automation, not a separate invoice notification system."
-- ----------------------------------------------------------------------------

alter table public.automation_rules drop constraint automation_rules_trigger_type_check;
alter table public.automation_rules add constraint automation_rules_trigger_type_check
  check (trigger_type in (
    'appointment.created', 'appointment.confirmed', 'appointment.rescheduled',
    'appointment.completed', 'appointment.no_show',
    'invoice.created', 'invoice.issued', 'invoice.overdue', 'invoice.voided'
  ));

-- ----------------------------------------------------------------------------
-- document_counters — race-free, gap-free, per-org/per-year invoice
-- numbering. A single atomic upsert-increment (app.next_invoice_number
-- below) rather than a Postgres sequence: a sequence is global and
-- non-transactional (a rolled-back invoice still burns a number, which tax
-- authorities reject), and per-tenant sequences mean DDL on every signup.
-- ----------------------------------------------------------------------------

create table public.document_counters (
  organization_id uuid    not null references public.organizations (id) on delete cascade,
  document_type   text    not null check (document_type in ('invoice')),
  year            integer not null,
  last_number     integer not null default 0 check (last_number >= 0),

  primary key (organization_id, document_type, year)
);

comment on table public.document_counters is
  'Backs app.next_invoice_number(). Not client-readable or writable -- purely internal counter state.';

alter table public.document_counters enable row level security;
-- No policies at all: this table has nothing a client ever needs to read
-- directly, and is written only from inside the SECURITY DEFINER trigger
-- below (which bypasses RLS via table ownership, same as every other
-- app.* helper). RLS enabled + zero policies denies all direct client access.

-- ----------------------------------------------------------------------------
-- invoices
-- ----------------------------------------------------------------------------

create table public.invoices (
  id                uuid        primary key default gen_random_uuid(),
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  clinic_id         uuid        not null,
  patient_id        uuid        not null,
  -- Nullable: an invoice need not originate from an appointment. MATCH
  -- SIMPLE means the composite FK below is skipped when null (same pattern
  -- as follow_ups.appointment_id, migration 0014).
  appointment_id    uuid,
  -- Null while draft; assigned by app.assign_invoice_number() the moment
  -- status transitions to 'issued', and never writable by a client
  -- directly (see the column-grant revoke below).
  invoice_number    text,
  status            text        not null default 'draft'
                                check (status in (
                                  'draft', 'issued', 'partially_paid', 'paid',
                                  'overdue', 'void', 'cancelled'
                                )),
  issue_date        date,
  due_date          date,
  -- All money columns: subtotal/discount_amount/tax_amount/total are
  -- DERIVED -- maintained only by app.recompute_invoice_totals() below,
  -- never written directly by a client (see the column-grant revoke).
  subtotal          numeric(14, 2) not null default 0 check (subtotal >= 0),
  discount_type     text        check (discount_type in ('fixed', 'percentage')),
  -- The raw input (10 for 10%, or 500 for a flat 500) -- discount_amount
  -- below is what that resolves to in currency, recomputed whenever this
  -- changes.
  discount_value    numeric(14, 2) check (discount_value is null or discount_value >= 0),
  discount_amount   numeric(14, 2) not null default 0 check (discount_amount >= 0),
  tax_rate          numeric(5, 2)  not null default 0 check (tax_rate >= 0 and tax_rate <= 100),
  tax_amount        numeric(14, 2) not null default 0 check (tax_amount >= 0),
  total             numeric(14, 2) not null default 0 check (total >= 0),
  -- Written only by Phase 6 -- see this migration's header comment. Kept as
  -- a real column now so Phase 6 extends, not restructures, this table.
  amount_paid       numeric(14, 2) not null default 0 check (amount_paid >= 0),
  balance           numeric(14, 2) generated always as (total - amount_paid) stored,
  -- Snapshotted from the organization at creation, not read live from
  -- organizations.currency -- CLAUDE.md "never silently change historical
  -- invoice currency."
  currency          text        not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  notes             text,
  void_reason       text,
  voided_by         uuid        references public.profiles (id) on delete set null,
  voided_at         timestamptz,
  created_by        uuid        references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint invoices_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint invoices_patient_fk foreign key (patient_id, organization_id)
    references public.patients (id, organization_id),
  constraint invoices_appointment_fk foreign key (appointment_id, organization_id)
    references public.appointments (id, organization_id),

  -- Hard backstop matching the derivation rule above: whatever the trigger
  -- computes must actually add up. round() guards against float-adjacent
  -- drift from the numeric arithmetic itself.
  constraint invoices_total_consistent check (total = round(subtotal - discount_amount + tax_amount, 2)),
  constraint invoices_void_requires_reason check (status <> 'void' or void_reason is not null),

  -- Composite-FK target for invoice_items below -- guarantees an item's
  -- (organization_id, clinic_id) always matches its parent invoice's,
  -- structurally, not just by policy.
  constraint invoices_id_org_clinic_uk unique (id, organization_id, clinic_id),
  -- Second, narrower target (same pattern as clinics/patients/services/
  -- appointments' own _id_org_uk keys) for follow_ups.invoice_id below,
  -- which doesn't carry clinic_id.
  constraint invoices_id_org_uk unique (id, organization_id)
);

comment on table public.invoices is
  'docs/PRODUCT_SPEC.md section 10. subtotal/discount_amount/tax_amount/total are DB-derived (app.recompute_invoice_totals) -- never trust a client-supplied total.';

create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create index invoices_org_ix on public.invoices (organization_id);
create index invoices_clinic_status_ix on public.invoices (clinic_id, status);
create index invoices_patient_ix on public.invoices (patient_id, created_at desc);
create index invoices_appointment_ix on public.invoices (appointment_id) where appointment_id is not null;
create index invoices_due_date_ix on public.invoices (due_date) where status = 'issued';

-- Invoice numbers are unique per organization -- a plain unique index
-- tolerates multiple NULLs (drafts), which is exactly what's wanted: many
-- drafts, never two invoices with the same assigned number.
create unique index invoices_org_number_uk on public.invoices (organization_id, invoice_number)
  where invoice_number is not null;

-- ----------------------------------------------------------------------------
-- follow_ups gets a second, equally-optional reference (alongside
-- appointment_id, migration 0014): which invoice prompted this follow-up,
-- for invoice.overdue -> followup(type='payment'). A payment follow-up with
-- no link back to the invoice it's about would be far less useful to staff.
-- Added here via ALTER, not by editing migration 0014, matching how every
-- earlier phase extends prior tables from its own migration.
-- ----------------------------------------------------------------------------

alter table public.follow_ups add column invoice_id uuid;
alter table public.follow_ups add constraint follow_ups_invoice_fk
  foreign key (invoice_id, organization_id) references public.invoices (id, organization_id);
create index follow_ups_invoice_ix on public.follow_ups (invoice_id) where invoice_id is not null;

-- ----------------------------------------------------------------------------
-- invoice_items
-- ----------------------------------------------------------------------------

create table public.invoice_items (
  id                uuid        primary key default gen_random_uuid(),
  invoice_id        uuid        not null,
  organization_id   uuid        not null references public.organizations (id) on delete cascade,
  clinic_id         uuid        not null,
  -- Nullable, traceability only -- see this migration's header comment. A
  -- later rename/price change on the service must never alter this line;
  -- description/unit_price below are snapshots taken when the line was
  -- added, not live references.
  service_id        uuid,
  description       text        not null check (length(btrim(description)) between 1 and 300),
  quantity          numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price        numeric(14, 2) not null check (unit_price >= 0),
  line_total        numeric(14, 2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at        timestamptz not null default now(),

  -- Composite FK into invoices' own (id, organization_id, clinic_id) key:
  -- an item's tenancy is structurally forced to match its invoice's, not
  -- just independently policed.
  constraint invoice_items_invoice_fk foreign key (invoice_id, organization_id, clinic_id)
    references public.invoices (id, organization_id, clinic_id) on delete cascade,
  constraint invoice_items_service_fk foreign key (service_id, organization_id)
    references public.services (id, organization_id)
);

comment on table public.invoice_items is
  'Line items. description/unit_price are snapshots at add-time (CLAUDE.md "historical invoice values must remain stable") -- never recomputed from services.price/name later.';

create index invoice_items_invoice_ix on public.invoice_items (invoice_id);
create index invoice_items_org_ix on public.invoice_items (organization_id);

-- ----------------------------------------------------------------------------
-- app.recompute_invoice_totals() — the ONE authoritative calculation
-- (docs/PRODUCT_SPEC.md Phase 5 section 33). Called from two triggers below:
-- whenever invoice_items change, and whenever an invoice's own
-- discount/tax inputs change. Never called from, or duplicated into,
-- application code -- the server always reads these columns back rather
-- than trusting a client-computed total.
-- ----------------------------------------------------------------------------

create or replace function app.recompute_invoice_totals(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_subtotal        numeric(14,2);
  v_discount_type    text;
  v_discount_value   numeric(14,2);
  v_tax_rate         numeric(5,2);
  v_discount_amount  numeric(14,2);
  v_tax_amount       numeric(14,2);
begin
  select coalesce(sum(line_total), 0) into v_subtotal
    from public.invoice_items where invoice_id = p_invoice_id;

  select discount_type, discount_value, tax_rate
    into v_discount_type, v_discount_value, v_tax_rate
    from public.invoices where id = p_invoice_id;

  v_discount_amount := case
    when v_discount_type = 'percentage' then round(v_subtotal * coalesce(v_discount_value, 0) / 100, 2)
    when v_discount_type = 'fixed'      then least(coalesce(v_discount_value, 0), v_subtotal)
    else 0
  end;

  v_tax_amount := round((v_subtotal - v_discount_amount) * coalesce(v_tax_rate, 0) / 100, 2);

  update public.invoices
     set subtotal        = v_subtotal,
         discount_amount = v_discount_amount,
         tax_amount      = v_tax_amount,
         total            = v_subtotal - v_discount_amount + v_tax_amount
   where id = p_invoice_id;
end;
$fn$;

create or replace function app.invoice_items_recompute_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  perform app.recompute_invoice_totals(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$fn$;

create trigger invoice_items_recompute
  after insert or update or delete on public.invoice_items
  for each row execute function app.invoice_items_recompute_trigger();

create or replace function app.invoice_discount_tax_recompute_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  perform app.recompute_invoice_totals(new.id);
  return null;
end;
$fn$;

-- WHEN guards against infinite recursion: this trigger's own recomputation
-- UPDATE only ever touches subtotal/discount_amount/tax_amount/total, never
-- discount_type/discount_value/tax_rate, so the recursive UPDATE it causes
-- fails this WHEN clause and does not re-fire itself.
create trigger invoices_discount_tax_recompute
  after update of discount_type, discount_value, tax_rate on public.invoices
  for each row
  when (
    new.discount_type is distinct from old.discount_type
    or new.discount_value is distinct from old.discount_value
    or new.tax_rate is distinct from old.tax_rate
  )
  execute function app.invoice_discount_tax_recompute_trigger();

-- ----------------------------------------------------------------------------
-- app.next_invoice_number() / assign_invoice_number — atomic, race-free
-- numbering, assigned at issue time (not draft creation), matching
-- document_counters' header comment. INSERT ... ON CONFLICT DO UPDATE ...
-- RETURNING is what makes concurrent issues from two staff members never
-- collide: Postgres row-locks the counter row for the duration.
-- ----------------------------------------------------------------------------

create or replace function app.next_invoice_number(p_organization_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_year int := extract(year from now())::int;
  v_next int;
begin
  insert into public.document_counters (organization_id, document_type, year, last_number)
  values (p_organization_id, 'invoice', v_year, 1)
  on conflict (organization_id, document_type, year)
  do update set last_number = public.document_counters.last_number + 1
  returning last_number into v_next;

  return 'INV-' || v_year || '-' || lpad(v_next::text, 6, '0');
end;
$fn$;

create or replace function app.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  if new.invoice_number is null then
    new.invoice_number := app.next_invoice_number(new.organization_id);
  end if;
  if new.issue_date is null then
    new.issue_date := current_date;
  end if;
  return new;
end;
$fn$;

create trigger invoices_assign_number
  before update on public.invoices
  for each row
  when (new.status = 'issued' and old.status is distinct from 'issued')
  execute function app.assign_invoice_number();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.invoices enable row level security;

create policy invoices_select on public.invoices
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('invoices.view'))) );

create policy invoices_insert on public.invoices
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('invoices.create'))) );

-- invoices.update covers ordinary draft editing; invoices.issue and
-- invoices.void gate the specific status TRANSITIONS in application code
-- (app/(app)/invoices/actions.ts), the same split Phase 2/3 used for
-- patients.delete vs patients.update and appointments.cancel/reschedule vs
-- .update. All three need to be able to perform the underlying UPDATE at
-- the RLS layer; which one a given change actually requires is an
-- application-layer decision.
create policy invoices_update on public.invoices
  for update to authenticated
  using (
    clinic_id = any (select unnest(app.permitted_clinics('invoices.update')))
    or clinic_id = any (select unnest(app.permitted_clinics('invoices.issue')))
    or clinic_id = any (select unnest(app.permitted_clinics('invoices.void')))
  )
  with check (
    clinic_id = any (select unnest(app.permitted_clinics('invoices.update')))
    or clinic_id = any (select unnest(app.permitted_clinics('invoices.issue')))
    or clinic_id = any (select unnest(app.permitted_clinics('invoices.void')))
  );

-- No DELETE policy, ever: "do not delete issued financial records" applies
-- to drafts too here -- a draft is cancelled (status), never removed.

revoke update on public.invoices from authenticated;
-- Notably absent: invoice_number, subtotal, discount_amount, tax_amount,
-- total, amount_paid, organization_id, clinic_id, patient_id. Each is
-- either DB-derived, Phase-6-only, or a tenancy column -- none are ever
-- client-writable.
grant update (
  status, appointment_id, due_date, discount_type, discount_value, tax_rate,
  notes, void_reason, voided_by, voided_at
) on public.invoices to authenticated;

alter table public.invoice_items enable row level security;

create policy invoice_items_select on public.invoice_items
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('invoices.view'))) );

-- Items are only mutable while their invoice is still a draft -- financial
-- integrity, not just tenant isolation, so this checks the parent invoice's
-- status directly rather than only the writer's permission. Once issued,
-- "add a line" would silently change a total someone has already been
-- shown/sent (docs/PRODUCT_SPEC.md Phase 5 section 16: "do NOT freely
-- mutate historical financial values").
create policy invoice_items_insert on public.invoice_items
  for insert to authenticated
  with check (
    clinic_id = any (select unnest(app.permitted_clinics('invoices.create')))
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and i.status = 'draft'
    )
  );

create policy invoice_items_update on public.invoice_items
  for update to authenticated
  using (
    clinic_id = any (select unnest(app.permitted_clinics('invoices.update')))
    and exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.status = 'draft')
  )
  with check (
    clinic_id = any (select unnest(app.permitted_clinics('invoices.update')))
    and exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.status = 'draft')
  );

create policy invoice_items_delete on public.invoice_items
  for delete to authenticated
  using (
    clinic_id = any (select unnest(app.permitted_clinics('invoices.update')))
    and exists (select 1 from public.invoices i where i.id = invoice_items.invoice_id and i.status = 'draft')
  );

revoke update on public.invoice_items from authenticated;
grant update (description, quantity, unit_price) on public.invoice_items to authenticated;

-- ----------------------------------------------------------------------------
-- create_organization() gets an eighth default automation rule:
-- invoice.overdue -> followup (type 'payment', the same "Payment Follow-Up"
-- type migration 0014 already defined, so no new follow-up type or action_type
-- is needed). Same create-or-replace pattern used in migration 0014.
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
          jsonb_build_object('name', p_org_name, 'clinic_id', v_clinic_id));

  return v_org_id;
end;
$fn$;

-- ----------------------------------------------------------------------------
-- log_audit_event() — a general-purpose SECURITY DEFINER audit write,
-- same shape as create_notification() above. Until now every audit_logs
-- insert was bespoke, written inline inside invite_member/accept_invite's
-- own function bodies (migrations 0009/0010) -- financial actions
-- (docs/PRODUCT_SPEC.md Phase 5 section 30: invoice created/issued/voided,
-- discount applied) are the first caller that isn't itself already a
-- SECURITY DEFINER RPC, so this is the first genuinely reusable one. audit_logs
-- has no client INSERT policy at all (migration 0004) -- this is the only path.
-- ----------------------------------------------------------------------------

create or replace function public.log_audit_event(
  p_organization_id uuid,
  p_action          text,
  p_entity_type     text,
  p_entity_id       uuid,
  p_metadata        jsonb default '{}'::jsonb
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

  -- The actor must be an active member of the organization the log entry
  -- claims -- p_organization_id is otherwise just a client-supplied
  -- argument (CLAUDE.md rule 4: never trust it directly).
  if not exists (
    select 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = v_actor and status = 'active'
  ) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (p_organization_id, v_actor, p_action, p_entity_type, p_entity_id, p_metadata)
  returning id into v_id;

  return v_id;
end;
$fn$;

revoke execute on function public.log_audit_event(uuid, text, text, uuid, jsonb) from public, anon;
grant  execute on function public.log_audit_event(uuid, text, text, uuid, jsonb) to authenticated;
