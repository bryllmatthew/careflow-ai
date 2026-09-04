-- ============================================================================
-- Payments negative-security + financial-integrity suite (Phase 6)
--
-- Covers what's new here: record_manual_payment()/record_refund()'s
-- validation (overpayment rejection, status-gated payability, refund
-- eligibility), the payment-state rollup trigger driving invoice status
-- through partially_paid -> paid and back down on refund, idempotency via
-- the provider-transaction unique index, and record_refund()'s own
-- authorization check (it's SECURITY DEFINER, so RLS doesn't gate it).
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

create or replace function pg_temp.act_as(p_fixture_key text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting('fx.' || p_fixture_key), 'role', 'authenticated')::text,
    true);
$$;

do $$
declare
  v_org_a uuid; v_org_b uuid;
  v_clinic_a uuid; v_clinic_b uuid;
  v_finance uuid; v_practitioner uuid; v_owner_b uuid;
  v_role_finance uuid; v_role_practitioner uuid; v_role_owner uuid;
  v_patient_a uuid;
  v_service_a uuid;
  v_invoice_a uuid; v_invoice_draft uuid;
begin
  select id into v_role_finance      from public.roles where key = 'finance' and organization_id is null;
  select id into v_role_practitioner from public.roles where key = 'practitioner' and organization_id is null;
  select id into v_role_owner        from public.roles where key = 'owner' and organization_id is null;

  insert into auth.users (id, email) values (gen_random_uuid(), 'pay-finance@fixture.test') returning id into v_finance;
  -- practitioner holds no payments.* permission at all (migration 0002 seed)
  -- -- the genuine "lacks the permission" case.
  insert into auth.users (id, email) values (gen_random_uuid(), 'pay-practitioner@fixture.test') returning id into v_practitioner;
  insert into auth.users (id, email) values (gen_random_uuid(), 'pay-owner-b@fixture.test') returning id into v_owner_b;

  insert into public.organizations (name) values ('Payments Fixture Org A') returning id into v_org_a;
  insert into public.organizations (name) values ('Payments Fixture Org B') returning id into v_org_b;
  insert into public.clinics (organization_id, name) values (v_org_a, 'Fixture Clinic A') returning id into v_clinic_a;
  insert into public.clinics (organization_id, name) values (v_org_b, 'Fixture Clinic B') returning id into v_clinic_b;

  insert into public.organization_memberships (organization_id, user_id, status) values
    (v_org_a, v_finance, 'active'),
    (v_org_a, v_practitioner, 'active'),
    (v_org_b, v_owner_b, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values
    (v_finance, v_role_finance, v_org_a, null),
    (v_practitioner, v_role_practitioner, v_org_a, null),
    (v_owner_b, v_role_owner, v_org_b, null);

  insert into public.patients (organization_id, clinic_id, first_name, last_name)
    values (v_org_a, v_clinic_a, 'Ada', 'Fixture') returning id into v_patient_a;

  insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
    values (v_org_a, v_clinic_a, 'Consultation', 30, 500) returning id into v_service_a;

  -- An issued invoice with a 1000 total (2x500), ready to accept payments.
  insert into public.invoices (organization_id, clinic_id, patient_id) values (v_org_a, v_clinic_a, v_patient_a)
    returning id into v_invoice_a;
  insert into public.invoice_items (invoice_id, organization_id, clinic_id, service_id, description, quantity, unit_price)
    values (v_invoice_a, v_org_a, v_clinic_a, v_service_a, 'Consultation', 2, 500);
  update public.invoices set status = 'issued' where id = v_invoice_a;

  -- A separate, still-draft invoice -- for the "cannot pay a draft" test.
  insert into public.invoices (organization_id, clinic_id, patient_id) values (v_org_a, v_clinic_a, v_patient_a)
    returning id into v_invoice_draft;

  perform set_config('fx.org_a', v_org_a::text, false);
  perform set_config('fx.org_b', v_org_b::text, false);
  perform set_config('fx.clinic_a', v_clinic_a::text, false);
  perform set_config('fx.finance', v_finance::text, false);
  perform set_config('fx.practitioner', v_practitioner::text, false);
  perform set_config('fx.owner_b', v_owner_b::text, false);
  perform set_config('fx.patient_a', v_patient_a::text, false);
  perform set_config('fx.invoice_a', v_invoice_a::text, false);
  perform set_config('fx.invoice_draft', v_invoice_draft::text, false);
end $$;

set local role authenticated;

-- ----------------------------------------------------------------------------
-- record_manual_payment(): permission, payability, validation.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('practitioner');
select throws_ok(
  format('select public.record_manual_payment(%L::uuid, 100, ''cash'', null)', current_setting('fx.invoice_a')),
  '42501',
  null,
  'a practitioner (no payments.record_manual) cannot record a manual payment'
);

select pg_temp.act_as('finance');

select throws_ok(
  format('select public.record_manual_payment(%L::uuid, 0, ''cash'', null)', current_setting('fx.invoice_a')),
  '23514',
  null,
  'a zero-amount payment is rejected'
);

select throws_ok(
  format('select public.record_manual_payment(%L::uuid, 100, ''cash'', null)', current_setting('fx.invoice_draft')),
  '23514',
  null,
  'a draft invoice cannot accept a payment'
);

select throws_ok(
  format('select public.record_manual_payment(%L::uuid, 1500, ''cash'', null)', current_setting('fx.invoice_a')),
  '23514',
  null,
  'a payment exceeding the outstanding balance (1000) is rejected as overpayment'
);

-- ----------------------------------------------------------------------------
-- Workflow B: partial payment, then completing payment -- invoice status
-- rolls through issued -> partially_paid -> paid, driven entirely by the
-- trigger, never set directly.
-- ----------------------------------------------------------------------------

select public.record_manual_payment(current_setting('fx.invoice_a')::uuid, 300, 'cash', 'OR-001') as payment1_id \gset
select set_config('fx.payment1', :'payment1_id', false);

select is(
  (select status from public.invoices where id = current_setting('fx.invoice_a')::uuid),
  'partially_paid',
  'a 300 payment against a 1000 invoice moves status to partially_paid'
);
select is(
  (select amount_paid from public.invoices where id = current_setting('fx.invoice_a')::uuid),
  300.00,
  'invoices.amount_paid reflects the succeeded payment, derived by the trigger'
);
select is(
  (select balance from public.invoices where id = current_setting('fx.invoice_a')::uuid),
  700.00,
  'balance (generated column) is total - amount_paid = 700'
);

select public.record_manual_payment(current_setting('fx.invoice_a')::uuid, 700, 'bank_transfer', 'OR-002') as payment2_id \gset

select is(
  (select status from public.invoices where id = current_setting('fx.invoice_a')::uuid),
  'paid',
  'the second payment (700) completes the invoice -- status becomes paid'
);
select is(
  (select balance from public.invoices where id = current_setting('fx.invoice_a')::uuid),
  0.00,
  'balance is 0 once the invoice is fully paid'
);

-- A further payment attempt is now rejected -- the invoice is no longer payable.
select throws_ok(
  format('select public.record_manual_payment(%L::uuid, 1, ''cash'', null)', current_setting('fx.invoice_a')),
  '23514',
  null,
  'a fully-paid invoice cannot accept a further payment'
);

-- ----------------------------------------------------------------------------
-- Idempotency: a given provider transaction can back at most one payment.
-- ----------------------------------------------------------------------------

select lives_ok(
  format($sql$insert into public.payments (organization_id, clinic_id, patient_id, invoice_id, amount, currency, payment_method, status, provider, provider_transaction_id) values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, 50, 'PHP', 'card', 'succeeded', 'generic', 'txn_dup')$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a'), current_setting('fx.patient_a'), current_setting('fx.invoice_draft')),
  'first insert with provider_transaction_id txn_dup succeeds'
);
select throws_ok(
  format($sql$insert into public.payments (organization_id, clinic_id, patient_id, invoice_id, amount, currency, payment_method, status, provider, provider_transaction_id) values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, 50, 'PHP', 'card', 'succeeded', 'generic', 'txn_dup')$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a'), current_setting('fx.patient_a'), current_setting('fx.invoice_draft')),
  '23505',
  null,
  'a second payment with the SAME provider_transaction_id is rejected -- prevents double-processing a retried webhook'
);

-- ----------------------------------------------------------------------------
-- record_refund(): permission, eligibility, validation. Refund the first
-- (cash) payment from Workflow B above.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('practitioner');
select throws_ok(
  format('select public.record_refund(%L::uuid, 100, ''test'')', current_setting('fx.payment1')),
  '42501',
  null,
  'a practitioner (no payments.refund) cannot refund a payment -- record_refund''s own internal check, since it is SECURITY DEFINER and RLS does not gate it'
);

select pg_temp.act_as('finance');

select throws_ok(
  format('select public.record_refund(%L::uuid, 100, null)', current_setting('fx.payment1')),
  '23514',
  null,
  'a refund with no reason is rejected'
);

select throws_ok(
  format('select public.record_refund(%L::uuid, 1000, ''too much'')', current_setting('fx.payment1')),
  '23514',
  null,
  'a refund exceeding the payment amount (300) is rejected'
);

select public.record_refund(current_setting('fx.payment1')::uuid, 100, 'Patient requested partial refund') as refund1_id \gset
select set_config('fx.refund1', :'refund1_id', false);

select is(
  (select status from public.payments where id = current_setting('fx.payment1')::uuid),
  'partially_refunded',
  'a 100 refund on a 300 payment marks it partially_refunded'
);
select is(
  (select amount_paid from public.invoices where id = current_setting('fx.invoice_a')::uuid),
  900.00,
  'the invoice''s amount_paid drops by the refunded amount (1000 - 100 = 900), via the refunds rollup trigger'
);
select is(
  (select status from public.invoices where id = current_setting('fx.invoice_a')::uuid),
  'partially_paid',
  'the invoice falls back from paid to partially_paid once its balance is no longer fully covered'
);

-- refunded_amount is not directly client-writable even by a payments.process
-- holder -- only record_refund() (SECURITY DEFINER) may move it.
select throws_ok(
  format('update public.payments set refunded_amount = 0 where id = %L::uuid', current_setting('fx.payment1')),
  '42501',
  null,
  'refunded_amount cannot be set directly by a client update, even by an authorized user'
);

-- ----------------------------------------------------------------------------
-- Org isolation + composite FK.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('owner_b');
select is(
  (select count(*)::int from public.payments where id = current_setting('fx.payment1')::uuid),
  0,
  'an org B user cannot see org A''s payment'
);
select is(
  (select count(*)::int from public.refunds where id = current_setting('fx.refund1')::uuid),
  0,
  'an org B user cannot see org A''s refund'
);

reset role;
select throws_ok(
  format($sql$insert into public.payments (organization_id, clinic_id, patient_id, invoice_id, amount, currency, payment_method, provider) values (%L::uuid, %L::uuid, %L::uuid, %L::uuid, 10, 'PHP', 'cash', 'manual')$sql$,
         current_setting('fx.org_b'), current_setting('fx.clinic_a'), current_setting('fx.patient_a'), current_setting('fx.invoice_a')),
  '23503',
  null,
  'a payment whose clinic belongs to a different organization than declared is rejected by the composite foreign key'
);

set local role authenticated;
select pg_temp.act_as('finance');
select throws_ok(
  format('update public.payments set organization_id = %L::uuid where id = %L::uuid',
         current_setting('fx.org_b'), current_setting('fx.payment1')),
  '42501',
  null,
  'a finance user cannot move a payment into another organization'
);

select * from finish();
rollback;
