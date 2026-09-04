-- ============================================================================
-- 0016 — Payments & Payment Processing (Phase 6)
--
-- docs/PRODUCT_SPEC.md section 9, docs/DATABASE_SCHEMA.md's payments field
-- list, CLAUDE.md's now-corrected deviation note ("manual payment recording
-- stays in Phase 6"). Builds directly on Phase 5's invoices -- no second
-- billing architecture.
--
-- Architecture (docs/PRODUCT_SPEC.md Phase 6 section 63, "the critical
-- financial principle"):
--   Customer -> Payment Provider -> Provider Confirmation/Webhook ->
--   CareFlow Server -> Payment Record -> Invoice Balance -> Invoice Status
--   -> Receipt/Event
-- NOT: Customer -> Frontend -> "Success" -> Invoice Paid.
--
-- Concretely: a MANUAL payment (cash/bank transfer) is trusted at the point
-- an authorized staff member records it -- their own permission-gated
-- Server Action call IS the trusted server-side event, no different from
-- Phase 5 trusting an authorized user's "issue this invoice" action. An
-- ONLINE payment is never marked succeeded by the request that started it;
-- only a verified webhook (or the reconciliation job) can do that -- see
-- lib/providers/payment/ and app/api/webhooks/payments/[provider]/route.ts.
--
-- Deliberate scope decision: no real payment provider is configured in this
-- environment (no Stripe/PayMongo/Xendit account exists to connect to).
-- The full provider abstraction, checkout-initiation path and webhook
-- pipeline are real and exercised end-to-end in this phase's tests, but the
-- only concrete PaymentProvider implementation is NotConfiguredProvider,
-- which honestly reports "not configured" rather than faking a checkout or
-- a webhook confirmation (docs/PRODUCT_SPEC.md Phase 6 section 51). This is
-- the same pattern already used for messaging in Phase 4
-- (lib/providers/messaging/not-configured.ts).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- New permissions
-- ----------------------------------------------------------------------------

insert into public.permissions (key, category, description) values
  ('payments.record_manual', 'Billing', 'Record a manual (cash/bank transfer) payment'),
  ('payments.process',       'Billing', 'Initiate and manage online payment processing'),
  ('payments.reconcile',     'Billing', 'Review and reconcile payment/provider discrepancies'),
  ('payments.manage',        'Billing', 'Configure payment provider settings');

alter table public.role_permissions disable trigger role_permissions_no_system_writes;

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
 cross join (values
    ('payments.record_manual'), ('payments.process'), ('payments.reconcile'), ('payments.manage')
  ) as p(key)
 where r.organization_id is null and r.key = 'owner';

insert into public.role_permissions (role_id, permission_key)
select r.id, x.permission_key
  from public.roles r
  join (values
    ('admin', 'payments.record_manual'), ('admin', 'payments.process'),
    ('admin', 'payments.reconcile'), ('admin', 'payments.manage'),

    -- Clinic Manager and Receptionist already record payments day-to-day
    -- (payments.create, migration 0002) -- record_manual is the same
    -- capability under its Phase 6 name. Neither gets process/reconcile/
    -- manage: online provider configuration and discrepancy review stay
    -- with finance/admin.
    ('clinic_manager', 'payments.record_manual'),
    ('receptionist', 'payments.record_manual'),

    ('finance', 'payments.record_manual'), ('finance', 'payments.process'),
    ('finance', 'payments.reconcile'), ('finance', 'payments.manage')
  ) as x(role_key, permission_key)
    on r.key = x.role_key
 where r.organization_id is null;

alter table public.role_permissions enable trigger role_permissions_no_system_writes;

-- ----------------------------------------------------------------------------
-- Phase 4's automation engine gets payment.* trigger types.
-- ----------------------------------------------------------------------------

alter table public.automation_rules drop constraint automation_rules_trigger_type_check;
alter table public.automation_rules add constraint automation_rules_trigger_type_check
  check (trigger_type in (
    'appointment.created', 'appointment.confirmed', 'appointment.rescheduled',
    'appointment.completed', 'appointment.no_show',
    'invoice.created', 'invoice.issued', 'invoice.overdue', 'invoice.voided',
    'payment.succeeded', 'payment.failed', 'payment.refunded'
  ));

-- notifications.type (migration 0014) gets three new values -- payment
-- succeeded/failed/refunded notify staff directly (lib/automation/
-- dispatch.ts's notifyUser()), not through the generic automation_rules
-- engine; there's nothing configurable about "tell the person who recorded
-- this payment whether it worked."
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'followup_due', 'followup_overdue', 'reminder_failed',
    'appointment_cancelled', 'appointment_rescheduled', 'no_show_followup_created',
    'payment_succeeded', 'payment_failed', 'payment_refunded'
  ));

-- ----------------------------------------------------------------------------
-- payments — append-only ledger (CLAUDE.md "Database conventions": payments
-- is append-only; refunds are new rows, never mutations of the original).
-- ----------------------------------------------------------------------------

create table public.payments (
  id                          uuid        primary key default gen_random_uuid(),
  organization_id             uuid        not null references public.organizations (id) on delete cascade,
  clinic_id                   uuid        not null,
  patient_id                  uuid        not null,
  invoice_id                  uuid        not null,
  amount                      numeric(14, 2) not null check (amount > 0),
  -- Must match the invoice's currency -- checked in the RPC/action, not
  -- assumed; kept as its own column so a payment record is self-describing
  -- without a join (docs/PRODUCT_SPEC.md Phase 6 section 33).
  currency                    text        not null check (currency ~ '^[A-Z]{3}$'),
  payment_method              text        not null
                                          check (payment_method in ('cash', 'bank_transfer', 'card', 'ewallet', 'online', 'other')),
  status                      text        not null default 'pending'
                                          check (status in (
                                            'pending', 'processing', 'succeeded', 'failed',
                                            'cancelled', 'partially_refunded', 'refunded'
                                          )),
  -- 'manual' for cash/bank-transfer/other recorded by staff; a provider key
  -- (e.g. 'generic') for online payments. Never a specific vendor hardcoded
  -- into a CHECK -- see lib/providers/payment/types.ts.
  provider                    text        not null default 'manual',
  provider_transaction_id     text,
  provider_payment_intent_id  text,
  reference_number            text,
  paid_at                     timestamptz,
  failure_reason              text,
  refunded_amount             numeric(14, 2) not null default 0 check (refunded_amount >= 0),
  -- Non-sensitive provider metadata ONLY (e.g. masked card brand/last4 if a
  -- provider safely supplies it) -- never card numbers/CVV/secrets
  -- (docs/PRODUCT_SPEC.md Phase 6 section 32).
  metadata                    jsonb       not null default '{}'::jsonb,
  created_by                  uuid        references public.profiles (id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint payments_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint payments_patient_fk foreign key (patient_id, organization_id)
    references public.patients (id, organization_id),
  constraint payments_invoice_fk foreign key (invoice_id, organization_id, clinic_id)
    references public.invoices (id, organization_id, clinic_id),
  constraint payments_refunded_not_exceed_amount check (refunded_amount <= amount),

  -- Composite-FK target for refunds below.
  constraint payments_id_org_clinic_uk unique (id, organization_id, clinic_id)
);

comment on table public.payments is
  'Append-only financial ledger (docs/PRODUCT_SPEC.md Phase 6). Never UPDATE amount/provider/paid_at on an existing succeeded row -- corrections are refunds, new rows, per CLAUDE.md "financial records are voided or cancelled, never soft-deleted".';

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create index payments_org_ix on public.payments (organization_id);
create index payments_clinic_status_ix on public.payments (clinic_id, status);
create index payments_invoice_ix on public.payments (invoice_id);
create index payments_patient_ix on public.payments (patient_id, created_at desc);
create index payments_provider_txn_ix on public.payments (provider, provider_transaction_id)
  where provider_transaction_id is not null;

-- A given provider transaction can back at most one payment -- the payment-
-- level idempotency guard, distinct from webhook_events' event-level guard
-- below (a provider may retry the SAME transaction under a new webhook
-- event id; this is what stops that from ever creating a second payment).
create unique index payments_provider_txn_uk on public.payments (provider, provider_transaction_id)
  where provider_transaction_id is not null;

-- ----------------------------------------------------------------------------
-- refunds — a separate financial event, never a mutation of the original
-- payment (docs/PRODUCT_SPEC.md Phase 6 section 27: "do not simply delete
-- the original payment").
-- ----------------------------------------------------------------------------

create table public.refunds (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations (id) on delete cascade,
  clinic_id           uuid        not null,
  payment_id          uuid        not null,
  invoice_id          uuid        not null,
  amount              numeric(14, 2) not null check (amount > 0),
  reason              text        not null check (length(btrim(reason)) between 1 and 500),
  status              text        not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  provider_refund_id  text,
  failure_reason      text,
  created_by          uuid        references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz,

  constraint refunds_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint refunds_payment_fk foreign key (payment_id, organization_id, clinic_id)
    references public.payments (id, organization_id, clinic_id),
  constraint refunds_invoice_fk foreign key (invoice_id, organization_id, clinic_id)
    references public.invoices (id, organization_id, clinic_id)
);

comment on table public.refunds is
  'A refund is its own financial event, linked to the payment it reverses -- never a mutation of that payment row.';

create index refunds_org_ix on public.refunds (organization_id);
create index refunds_payment_ix on public.refunds (payment_id);
create index refunds_invoice_ix on public.refunds (invoice_id);

-- ----------------------------------------------------------------------------
-- webhook_events — provider event idempotency ledger. No RLS policies at
-- all (same "enabled, zero policies, client access denied entirely"
-- pattern as document_counters, migration 0015) -- only the webhook route,
-- using the service-role client, ever touches this table.
-- ----------------------------------------------------------------------------

create table public.webhook_events (
  id              uuid        primary key default gen_random_uuid(),
  provider        text        not null,
  event_id        text        not null,
  event_type      text        not null,
  payload         jsonb       not null,
  organization_id uuid        references public.organizations (id) on delete set null,
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),

  unique (provider, event_id)
);

comment on table public.webhook_events is
  'Idempotency ledger for provider webhooks (docs/PRODUCT_SPEC.md Phase 6 section 19) -- (provider, event_id) uniqueness is what makes processing the same webhook twice safe.';

alter table public.webhook_events enable row level security;
-- No policies: this is internal bookkeeping for the webhook route only, not
-- something any client role should ever query directly.

-- ----------------------------------------------------------------------------
-- app.recompute_invoice_payment_state() — the ONE authoritative source for
-- invoices.amount_paid and the paid-related status transitions, mirroring
-- migration 0015's app.recompute_invoice_totals() for subtotal/discount/
-- tax/total. The app never computes amount_paid or flips an invoice to
-- 'paid' itself -- it always reads back what this function derived.
-- ----------------------------------------------------------------------------

create or replace function app.recompute_invoice_payment_state(p_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_total            numeric(14,2);
  v_status           text;
  v_succeeded_paid   numeric(14,2);
  v_succeeded_refund numeric(14,2);
  v_amount_paid      numeric(14,2);
  v_new_status       text;
begin
  select total, status into v_total, v_status from public.invoices where id = p_invoice_id;
  if v_status is null then
    return; -- invoice row doesn't exist (shouldn't happen under FK integrity)
  end if;

  -- 'partially_refunded'/'refunded' are included here, not just 'succeeded'
  -- -- a payment that was later (partially) refunded still contributed its
  -- FULL original amount to what the patient paid; the refund's own row in
  -- `refunds` is what subtracts the returned portion. Filtering this sum to
  -- 'succeeded' only would drop a partially-refunded payment's amount
  -- entirely, double-counting the refund (confirmed live: produced 600
  -- instead of 900 on a 1000-total invoice with a 300 payment 100-refunded).
  select coalesce(sum(amount), 0) into v_succeeded_paid
    from public.payments
   where invoice_id = p_invoice_id and status in ('succeeded', 'partially_refunded', 'refunded');
  select coalesce(sum(amount), 0) into v_succeeded_refund
    from public.refunds where invoice_id = p_invoice_id and status = 'succeeded';

  v_amount_paid := greatest(v_succeeded_paid - v_succeeded_refund, 0);
  v_new_status := v_status;

  -- Never resurrect a draft/void/cancelled invoice via a payment row --
  -- those are terminal/pre-billing states this function does not touch.
  if v_status not in ('draft', 'void', 'cancelled') then
    if v_amount_paid <= 0 then
      -- A refund brought a paid invoice back to zero: return it to 'issued'
      -- rather than guessing at 'overdue' here -- the overdue cron
      -- (app/api/cron/check-overdue-invoices) re-evaluates the due date on
      -- its own next run and will re-flag it if it's genuinely still overdue.
      v_new_status := 'issued';
    elsif v_amount_paid >= v_total then
      v_new_status := 'paid';
    else
      v_new_status := 'partially_paid';
    end if;
  end if;

  update public.invoices set amount_paid = v_amount_paid, status = v_new_status where id = p_invoice_id;
end;
$fn$;

create or replace function app.payments_recompute_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  perform app.recompute_invoice_payment_state(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$fn$;

create trigger payments_recompute
  after insert or update or delete on public.payments
  for each row execute function app.payments_recompute_trigger();

create or replace function app.refunds_recompute_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  perform app.recompute_invoice_payment_state(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$fn$;

create trigger refunds_recompute
  after insert or update or delete on public.refunds
  for each row execute function app.refunds_recompute_trigger();

-- ----------------------------------------------------------------------------
-- public.record_manual_payment() — the ONLY path for manual payment
-- creation. SECURITY INVOKER (not DEFINER): it needs no elevated privilege,
-- only the transactional atomicity a single RPC call gives that two
-- separate supabase-js calls cannot (CLAUDE.md "PostgREST gives one
-- transaction per HTTP request... every multi-row or financial operation
-- must be a Postgres RPC"). RLS still applies to both the SELECT ... FOR
-- UPDATE lock and the final INSERT, exactly as if the caller had run them
-- directly -- this function's only job is atomicity, not bypassing
-- authorization.
--
-- The FOR UPDATE lock is what makes two concurrent payment attempts against
-- the same invoice safe (docs/PRODUCT_SPEC.md Phase 6 sections 42/56): the
-- second call blocks until the first's transaction commits, then re-reads
-- the now-current balance rather than the stale one it would have seen
-- under a naive check-then-insert with no lock.
-- ----------------------------------------------------------------------------

create or replace function public.record_manual_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference_number text default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_invoice           record;
  v_payment_id        uuid;
  v_succeeded_paid    numeric(14,2);
  v_succeeded_refund  numeric(14,2);
  v_current_balance   numeric(14,2);
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Payment amount must be greater than zero' using errcode = '23514';
  end if;

  if p_payment_method not in ('cash', 'bank_transfer', 'other') then
    raise exception 'Invalid manual payment method: %', p_payment_method using errcode = '23514';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'Invoice not found, or you do not have access to it.' using errcode = '42501';
  end if;

  if v_invoice.status not in ('issued', 'overdue', 'partially_paid') then
    raise exception 'This invoice cannot accept a payment in its current status (%).', v_invoice.status
      using errcode = '23514';
  end if;

  -- Same 'partially_refunded'/'refunded' inclusion as
  -- app.recompute_invoice_payment_state() above, and for the same reason --
  -- this must compute the identical balance that function derives, or a
  -- payment could be accepted here against a balance the trigger would
  -- immediately recompute differently.
  select coalesce(sum(amount), 0) into v_succeeded_paid
    from public.payments
   where invoice_id = p_invoice_id and status in ('succeeded', 'partially_refunded', 'refunded');
  select coalesce(sum(amount), 0) into v_succeeded_refund
    from public.refunds where invoice_id = p_invoice_id and status = 'succeeded';
  v_current_balance := v_invoice.total - greatest(v_succeeded_paid - v_succeeded_refund, 0);

  -- Reject overpayment outright for MVP (docs/PRODUCT_SPEC.md Phase 6
  -- section 10) -- no credit-balance architecture exists to hold the
  -- difference, so silently accepting more than the balance would just be
  -- a wrong number sitting on the invoice.
  if p_amount > v_current_balance then
    raise exception 'Payment amount (%) exceeds the outstanding balance (%).', p_amount, v_current_balance
      using errcode = '23514';
  end if;

  insert into public.payments (
    organization_id, clinic_id, patient_id, invoice_id, amount, currency,
    payment_method, status, provider, reference_number, paid_at, created_by
  ) values (
    v_invoice.organization_id, v_invoice.clinic_id, v_invoice.patient_id, p_invoice_id, p_amount, v_invoice.currency,
    p_payment_method, 'succeeded', 'manual', p_reference_number, now(), (select auth.uid())
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$fn$;

revoke execute on function public.record_manual_payment(uuid, numeric, text, text) from public, anon;
grant  execute on function public.record_manual_payment(uuid, numeric, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- public.record_refund() — the ONLY path for creating a refund against a
-- manual payment, and the only path that ever moves
-- payments.refunded_amount. SECURITY DEFINER, unlike record_manual_payment()
-- above: refunded_amount is deliberately kept out of payments' client
-- column grant (below) so no direct PATCH can move it without this
-- function's validation, which means this function must bypass RLS/grants
-- via table ownership -- and therefore must do its OWN authorization check
-- explicitly, exactly like the app.* helpers and create_notification()
-- (auth.uid() still resolves to the real caller inside a SECURITY DEFINER
-- function, per CLAUDE.md's authorization design).
--
-- Online-payment refunds do NOT go through this function -- they go through
-- lib/providers/payment's refundPayment() first (provider confirmation
-- required, docs/PRODUCT_SPEC.md Phase 6 section 28), and only then record
-- the result via a normal application-layer insert with the provider's
-- confirmed status.
-- ----------------------------------------------------------------------------

create or replace function public.record_refund(
  p_payment_id uuid,
  p_amount numeric,
  p_reason text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_actor        uuid := (select auth.uid());
  v_payment      record;
  v_refund_id    uuid;
  v_refundable   numeric(14,2);
begin
  if v_actor is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Refund amount must be greater than zero' using errcode = '23514';
  end if;
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'A refund reason is required' using errcode = '23514';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment not found.' using errcode = '42501';
  end if;

  -- The explicit authorization check this function needs precisely because
  -- SECURITY DEFINER bypassed RLS to reach the row above.
  if not (v_payment.clinic_id = any (app.permitted_clinics('payments.refund'))) then
    raise exception 'You do not have permission to refund this payment.' using errcode = '42501';
  end if;

  if v_payment.status not in ('succeeded', 'partially_refunded') then
    raise exception 'This payment is not eligible for a refund (status: %).', v_payment.status
      using errcode = '23514';
  end if;
  if v_payment.provider <> 'manual' then
    raise exception 'Online payment refunds must go through the payment provider, not this function.'
      using errcode = '23514';
  end if;

  v_refundable := v_payment.amount - v_payment.refunded_amount;
  if p_amount > v_refundable then
    raise exception 'Refund amount (%) exceeds the refundable amount (%).', p_amount, v_refundable
      using errcode = '23514';
  end if;

  insert into public.refunds (organization_id, clinic_id, payment_id, invoice_id, amount, reason, status, created_by, completed_at)
  values (v_payment.organization_id, v_payment.clinic_id, p_payment_id, v_payment.invoice_id, p_amount, p_reason,
          'succeeded', v_actor, now())
  returning id into v_refund_id;

  update public.payments
    set refunded_amount = refunded_amount + p_amount,
        status = case when refunded_amount + p_amount >= amount then 'refunded' else 'partially_refunded' end
  where id = p_payment_id;

  return v_refund_id;
end;
$fn$;

revoke execute on function public.record_refund(uuid, numeric, text) from public, anon;
grant  execute on function public.record_refund(uuid, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------

alter table public.payments enable row level security;

create policy payments_select on public.payments
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('payments.view'))) );

-- INSERT is reachable two ways: record_manual_payment() (SECURITY INVOKER,
-- so this policy applies to it same as a direct client insert) and the
-- webhook route (service role, bypasses RLS entirely -- see that route).
create policy payments_insert on public.payments
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('payments.create'))) );

-- Narrow: only status/failure_reason/provider fields tied to processing an
-- online payment through to a terminal state -- see the column grant below.
-- Financial fields (amount, refunded_amount, provider_transaction_id,
-- paid_at, ...) are never client-updatable at all, matching "payments is
-- append-only." refunded_amount moves ONLY inside record_refund()
-- (SECURITY DEFINER, bypasses this policy via table ownership, with its own
-- explicit permission check) -- this policy governs direct client updates,
-- which record_refund() deliberately is not one of.
create policy payments_update on public.payments
  for update to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('payments.process'))) )
  with check ( clinic_id = any (select unnest(app.permitted_clinics('payments.process'))) );

revoke update on public.payments from authenticated;
grant update (status, failure_reason, provider_payment_intent_id, provider_transaction_id, paid_at, metadata)
  on public.payments to authenticated;

alter table public.refunds enable row level security;

create policy refunds_select on public.refunds
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('payments.view'))) );

create policy refunds_insert on public.refunds
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('payments.refund'))) );

create policy refunds_update on public.refunds
  for update to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('payments.refund'))) )
  with check ( clinic_id = any (select unnest(app.permitted_clinics('payments.refund'))) );

revoke update on public.refunds from authenticated;
grant update (status, provider_refund_id, failure_reason, completed_at) on public.refunds to authenticated;
