-- ============================================================================
-- Invoicing negative-security + financial-integrity suite (Phase 5)
--
-- Covers what's new here: the rollup trigger (the ONE authoritative total
-- calculation), atomic invoice numbering on issue, items becoming immutable
-- once issued, the void-requires-reason backstop, and the usual
-- isolation/composite-FK shape already proven for every other table.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

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
  v_patient_a uuid; v_patient_b uuid;
  v_service_a uuid;
begin
  select id into v_role_finance      from public.roles where key = 'finance' and organization_id is null;
  select id into v_role_practitioner from public.roles where key = 'practitioner' and organization_id is null;
  select id into v_role_owner        from public.roles where key = 'owner' and organization_id is null;

  insert into auth.users (id, email) values (gen_random_uuid(), 'inv-finance@fixture.test') returning id into v_finance;
  -- practitioner holds no invoices.* permission at all (migration 0002 seed)
  -- -- the genuine "lacks the permission" case.
  insert into auth.users (id, email) values (gen_random_uuid(), 'inv-practitioner@fixture.test') returning id into v_practitioner;
  insert into auth.users (id, email) values (gen_random_uuid(), 'inv-owner-b@fixture.test') returning id into v_owner_b;

  insert into public.organizations (name) values ('Invoices Fixture Org A') returning id into v_org_a;
  insert into public.organizations (name) values ('Invoices Fixture Org B') returning id into v_org_b;
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
  insert into public.patients (organization_id, clinic_id, first_name, last_name)
    values (v_org_b, v_clinic_b, 'Bea', 'Fixture') returning id into v_patient_b;

  insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
    values (v_org_a, v_clinic_a, 'Consultation', 30, 500) returning id into v_service_a;

  perform set_config('fx.org_a', v_org_a::text, false);
  perform set_config('fx.org_b', v_org_b::text, false);
  perform set_config('fx.clinic_a', v_clinic_a::text, false);
  perform set_config('fx.clinic_b', v_clinic_b::text, false);
  perform set_config('fx.finance', v_finance::text, false);
  perform set_config('fx.practitioner', v_practitioner::text, false);
  perform set_config('fx.owner_b', v_owner_b::text, false);
  perform set_config('fx.patient_a', v_patient_a::text, false);
  perform set_config('fx.patient_b', v_patient_b::text, false);
  perform set_config('fx.service_a', v_service_a::text, false);
end $$;

set local role authenticated;
select pg_temp.act_as('finance');

-- ----------------------------------------------------------------------------
-- Insert denial: practitioner has no invoices.create.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('practitioner');
select throws_ok(
  format($sql$insert into public.invoices (organization_id, clinic_id, patient_id) values (%L::uuid, %L::uuid, %L::uuid)$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a'), current_setting('fx.patient_a')),
  '42501',
  null,
  'a practitioner (no invoices.create) cannot create an invoice'
);

-- ----------------------------------------------------------------------------
-- Rollup trigger: the ONE authoritative total calculation.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('finance');

insert into public.invoices (organization_id, clinic_id, patient_id)
values (current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid, current_setting('fx.patient_a')::uuid)
returning id as invoice_id \gset
select set_config('fx.invoice', :'invoice_id', false);

insert into public.invoice_items (invoice_id, organization_id, clinic_id, service_id, description, quantity, unit_price)
values (current_setting('fx.invoice')::uuid, current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid,
        current_setting('fx.service_a')::uuid, 'Consultation', 2, 500);

select is(
  (select subtotal from public.invoices where id = current_setting('fx.invoice')::uuid),
  1000.00,
  'adding a 2x500 line item recomputes subtotal to 1000 via the rollup trigger'
);
select is(
  (select total from public.invoices where id = current_setting('fx.invoice')::uuid),
  1000.00,
  'total matches subtotal when there is no discount/tax yet'
);

-- Apply a 10% discount -- the SECOND trigger (on invoices' own
-- discount/tax columns) must fire without infinite-recursing.
update public.invoices set discount_type = 'percentage', discount_value = 10
  where id = current_setting('fx.invoice')::uuid;

select is(
  (select discount_amount from public.invoices where id = current_setting('fx.invoice')::uuid),
  100.00,
  '10% discount on a 1000 subtotal computes to a 100 discount_amount'
);
select is(
  (select total from public.invoices where id = current_setting('fx.invoice')::uuid),
  900.00,
  'total correctly reflects subtotal minus the discount'
);

-- Add tax on top.
update public.invoices set tax_rate = 12 where id = current_setting('fx.invoice')::uuid;

select is(
  (select tax_amount from public.invoices where id = current_setting('fx.invoice')::uuid),
  108.00,
  '12% tax on the post-discount 900 computes to 108.00'
);
select is(
  (select total from public.invoices where id = current_setting('fx.invoice')::uuid),
  1008.00,
  'total = subtotal - discount + tax = 1000 - 100 + 108 = 1008'
);

-- Remove the item -- subtotal (and therefore total) must fall back to 0.
delete from public.invoice_items where invoice_id = current_setting('fx.invoice')::uuid;
select is(
  (select subtotal from public.invoices where id = current_setting('fx.invoice')::uuid),
  0.00,
  'deleting the only line item recomputes subtotal back to 0'
);

-- Re-add a clean item for the rest of the suite.
insert into public.invoice_items (invoice_id, organization_id, clinic_id, service_id, description, quantity, unit_price)
values (current_setting('fx.invoice')::uuid, current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid,
        current_setting('fx.service_a')::uuid, 'Consultation', 1, 500);
update public.invoices set discount_type = null, discount_value = null, tax_rate = 0
  where id = current_setting('fx.invoice')::uuid;

-- ----------------------------------------------------------------------------
-- Invoice numbering: assigned atomically on issue, sequential, immutable.
-- ----------------------------------------------------------------------------

select is(
  (select invoice_number from public.invoices where id = current_setting('fx.invoice')::uuid),
  null,
  'a draft invoice has no invoice_number yet'
);

update public.invoices set status = 'issued' where id = current_setting('fx.invoice')::uuid;
select ok(
  (select invoice_number from public.invoices where id = current_setting('fx.invoice')::uuid) ~ '^INV-\d{4}-\d{6}$',
  'issuing assigns an invoice_number in the INV-YYYY-NNNNNN format'
);

insert into public.invoices (organization_id, clinic_id, patient_id)
values (current_setting('fx.org_a')::uuid, current_setting('fx.clinic_a')::uuid, current_setting('fx.patient_a')::uuid)
returning id as invoice2_id \gset
update public.invoices set status = 'issued' where id = :'invoice2_id'::uuid;

select isnt(
  (select invoice_number from public.invoices where id = current_setting('fx.invoice')::uuid),
  (select invoice_number from public.invoices where id = :'invoice2_id'::uuid),
  'two issued invoices in the same org get distinct sequential numbers'
);

select throws_ok(
  format('update public.invoices set invoice_number = %L where id = %L::uuid', 'INV-FAKE-000001', current_setting('fx.invoice')),
  '42501',
  null,
  'invoice_number is not client-writable once assigned (column revoke)'
);

-- ----------------------------------------------------------------------------
-- Items become immutable once the invoice is issued.
-- ----------------------------------------------------------------------------

select throws_ok(
  format($sql$insert into public.invoice_items (invoice_id, organization_id, clinic_id, description, quantity, unit_price) values (%L::uuid, %L::uuid, %L::uuid, 'Sneaky add', 1, 100)$sql$,
         current_setting('fx.invoice'), current_setting('fx.org_a'), current_setting('fx.clinic_a')),
  '42501',
  null,
  'cannot add a line item to an already-issued invoice'
);

-- ----------------------------------------------------------------------------
-- Void requires a reason (DB-level backstop, not just app validation).
-- ----------------------------------------------------------------------------

select throws_ok(
  format('update public.invoices set status = %L where id = %L::uuid', 'void', current_setting('fx.invoice')),
  '23514',
  null,
  'voiding an invoice without void_reason is rejected by the CHECK constraint'
);

update public.invoices set void_reason = 'Issued in error', status = 'void'
  where id = current_setting('fx.invoice')::uuid;
select is(
  (select status from public.invoices where id = current_setting('fx.invoice')::uuid),
  'void',
  'voiding WITH a reason succeeds'
);

-- ----------------------------------------------------------------------------
-- Org isolation + composite FK.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('owner_b');
select is(
  (select count(*)::int from public.invoices where id = current_setting('fx.invoice')::uuid),
  0,
  'an org B user cannot see org A''s invoice'
);

reset role;
select throws_ok(
  format($sql$insert into public.invoices (organization_id, clinic_id, patient_id) values (%L::uuid, %L::uuid, %L::uuid)$sql$,
         current_setting('fx.org_a'), current_setting('fx.clinic_a'), current_setting('fx.patient_b')),
  '23503',
  null,
  'an invoice referencing a patient from a different organization is rejected by the composite foreign key'
);

set local role authenticated;
select pg_temp.act_as('finance');
select throws_ok(
  format('update public.invoices set organization_id = %L::uuid where id = %L::uuid',
         current_setting('fx.org_b'), current_setting('fx.invoice')),
  '42501',
  null,
  'a finance user cannot move an invoice into another organization'
);

select * from finish();
rollback;
