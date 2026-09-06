-- ============================================================================
-- Reporting aggregate-leakage suite (Phase 8)
--
-- Section 37/38/56 mandate this explicitly: "aggregated queries can
-- accidentally leak information even when individual records are
-- protected... unauthorized clinic must not affect 'All Clinics' totals."
--
-- Phase 8 adds NO new tables, RPCs, or RLS policies -- every reporting query
-- in app/(app)/reports/*-queries.ts runs SUM/COUNT through the same
-- RLS-respecting client every other module uses, so this suite is really
-- proving a property of the EXISTING per-table RLS SELECT policies under
-- aggregation, for the specific tables the reporting layer aggregates over:
-- Postgres RLS filters rows out BEFORE any aggregate function ever sees
-- them, so "SUM(invoices.total) WHERE organization_id = X" run by a
-- clinic-A1-only user structurally cannot include clinic A2's rows -- there
-- is no separate "aggregation security" mechanism to test beyond this.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

create or replace function pg_temp.act_as(p_fixture_key text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting('fx.' || p_fixture_key), 'role', 'authenticated')::text,
    true);
$$;

do $$
declare
  v_org_a uuid; v_org_b uuid;
  v_clinic_a1 uuid; v_clinic_a2 uuid; v_clinic_b uuid;
  v_owner_a uuid; v_clinic_a1_mgr uuid; v_owner_b uuid;
  v_role_owner uuid; v_role_clinic_manager uuid;
  v_patient_a1 uuid; v_patient_a2 uuid;
  v_service_a1 uuid; v_service_a2 uuid;
  v_staff uuid;
  v_invoice_a1 uuid; v_invoice_a2 uuid;
begin
  select id into v_role_owner          from public.roles where key = 'owner'          and organization_id is null;
  select id into v_role_clinic_manager from public.roles where key = 'clinic_manager' and organization_id is null;

  insert into auth.users (id, email) values (gen_random_uuid(), 'rpt-owner-a@fixture.test') returning id into v_owner_a;
  insert into auth.users (id, email) values (gen_random_uuid(), 'rpt-a1-mgr@fixture.test') returning id into v_clinic_a1_mgr;
  insert into auth.users (id, email) values (gen_random_uuid(), 'rpt-owner-b@fixture.test') returning id into v_owner_b;
  v_staff := v_owner_a;

  insert into public.organizations (name) values ('Reporting Fixture Org A') returning id into v_org_a;
  insert into public.organizations (name) values ('Reporting Fixture Org B') returning id into v_org_b;
  insert into public.clinics (organization_id, name) values (v_org_a, 'Fixture Clinic A1') returning id into v_clinic_a1;
  insert into public.clinics (organization_id, name) values (v_org_a, 'Fixture Clinic A2') returning id into v_clinic_a2;
  insert into public.clinics (organization_id, name) values (v_org_b, 'Fixture Clinic B') returning id into v_clinic_b;

  insert into public.organization_memberships (organization_id, user_id, status) values
    (v_org_a, v_owner_a, 'active'),
    (v_org_a, v_clinic_a1_mgr, 'active'),
    (v_org_b, v_owner_b, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values
    (v_owner_a, v_role_owner, v_org_a, null),
    (v_clinic_a1_mgr, v_role_clinic_manager, v_org_a, v_clinic_a1),  -- scoped to A1 ONLY, never A2
    (v_owner_b, v_role_owner, v_org_b, null);

  insert into public.patients (organization_id, clinic_id, first_name, last_name)
    values (v_org_a, v_clinic_a1, 'Ada', 'ClinicOne') returning id into v_patient_a1;
  insert into public.patients (organization_id, clinic_id, first_name, last_name)
    values (v_org_a, v_clinic_a2, 'Ben', 'ClinicTwo') returning id into v_patient_a2;

  insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
    values (v_org_a, v_clinic_a1, 'Consult A1', 30, 500) returning id into v_service_a1;
  insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
    values (v_org_a, v_clinic_a2, 'Consult A2', 30, 500) returning id into v_service_a2;

  -- Two appointments at A1, three at A2 -- distinct, easily-verified counts.
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at) values
    (v_org_a, v_clinic_a1, v_patient_a1, v_service_a1, v_staff, '2026-03-01 09:00+00', '2026-03-01 09:30+00'),
    (v_org_a, v_clinic_a1, v_patient_a1, v_service_a1, v_staff, '2026-03-02 09:00+00', '2026-03-02 09:30+00'),
    (v_org_a, v_clinic_a2, v_patient_a2, v_service_a2, v_staff, '2026-03-01 10:00+00', '2026-03-01 10:30+00'),
    (v_org_a, v_clinic_a2, v_patient_a2, v_service_a2, v_staff, '2026-03-02 10:00+00', '2026-03-02 10:30+00'),
    (v_org_a, v_clinic_a2, v_patient_a2, v_service_a2, v_staff, '2026-03-03 10:00+00', '2026-03-03 10:30+00');

  -- A1: one issued invoice for 1000. A2: one issued invoice for 2000.
  insert into public.invoices (organization_id, clinic_id, patient_id) values (v_org_a, v_clinic_a1, v_patient_a1)
    returning id into v_invoice_a1;
  insert into public.invoice_items (invoice_id, organization_id, clinic_id, service_id, description, quantity, unit_price)
    values (v_invoice_a1, v_org_a, v_clinic_a1, v_service_a1, 'Consult A1', 2, 500);
  update public.invoices set status = 'issued' where id = v_invoice_a1;

  insert into public.invoices (organization_id, clinic_id, patient_id) values (v_org_a, v_clinic_a2, v_patient_a2)
    returning id into v_invoice_a2;
  insert into public.invoice_items (invoice_id, organization_id, clinic_id, service_id, description, quantity, unit_price)
    values (v_invoice_a2, v_org_a, v_clinic_a2, v_service_a2, 'Consult A2', 4, 500);
  update public.invoices set status = 'issued' where id = v_invoice_a2;

  -- A1: 500 succeeded payment. A2: 800 succeeded payment.
  insert into public.payments (organization_id, clinic_id, patient_id, invoice_id, amount, currency, payment_method, status, provider, paid_at)
    values (v_org_a, v_clinic_a1, v_patient_a1, v_invoice_a1, 500, 'PHP', 'cash', 'succeeded', 'manual', now());
  insert into public.payments (organization_id, clinic_id, patient_id, invoice_id, amount, currency, payment_method, status, provider, paid_at)
    values (v_org_a, v_clinic_a2, v_patient_a2, v_invoice_a2, 800, 'PHP', 'cash', 'succeeded', 'manual', now());

  perform set_config('fx.org_a', v_org_a::text, false);
  perform set_config('fx.org_b', v_org_b::text, false);
  perform set_config('fx.owner_a', v_owner_a::text, false);
  perform set_config('fx.clinic_a1_mgr', v_clinic_a1_mgr::text, false);
  perform set_config('fx.owner_b', v_owner_b::text, false);
end $$;

set local role authenticated;

-- ----------------------------------------------------------------------------
-- A clinic-A1-scoped user's "All Clinics" aggregate must equal A1 alone,
-- never A1 + A2 -- section 38's exact scenario.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('clinic_a1_mgr');

select is(
  (select sum(total)::numeric(14,2) from public.invoices where organization_id = current_setting('fx.org_a')::uuid),
  1000.00,
  'a clinic-A1-scoped user''s org-wide invoice SUM includes only A1 (1000), never A1+A2 (3000)'
);
select is(
  (select count(*)::int from public.appointments where organization_id = current_setting('fx.org_a')::uuid),
  2,
  'a clinic-A1-scoped user''s org-wide appointment COUNT includes only A1''s 2, never all 5'
);
select is(
  (select sum(amount)::numeric(14,2) from public.payments where organization_id = current_setting('fx.org_a')::uuid and status = 'succeeded'),
  500.00,
  'a clinic-A1-scoped user''s org-wide payment SUM includes only A1''s 500, never A1+A2 (1300)'
);
select is(
  (select count(*)::int from public.patients where organization_id = current_setting('fx.org_a')::uuid),
  1,
  'a clinic-A1-scoped user''s org-wide patient COUNT includes only A1''s 1 patient, never both'
);

-- The same user's aggregate EXPLICITLY filtered to their own clinic must
-- still equal the full A1 total (proves the exclusion above is really about
-- A2, not a general under-count).
select is(
  (select sum(total)::numeric(14,2) from public.invoices where organization_id = current_setting('fx.org_a')::uuid and clinic_id = (select clinic_id from public.user_roles where user_id = current_setting('fx.clinic_a1_mgr')::uuid and clinic_id is not null limit 1)),
  1000.00,
  'the same user''s clinic-A1-filtered SUM correctly returns the full A1 total (1000)'
);

-- ----------------------------------------------------------------------------
-- An org-wide owner legitimately sees the FULL organization total --
-- confirms the exclusion above is authorization-based, not a bug that
-- under-counts for everyone.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('owner_a');

select is(
  (select sum(total)::numeric(14,2) from public.invoices where organization_id = current_setting('fx.org_a')::uuid),
  3000.00,
  'an org-wide owner''s aggregate legitimately includes BOTH clinics (1000 + 2000 = 3000)'
);
select is(
  (select count(*)::int from public.appointments where organization_id = current_setting('fx.org_a')::uuid),
  5,
  'an org-wide owner''s appointment COUNT includes all 5 appointments across both clinics'
);
select is(
  (select sum(amount)::numeric(14,2) from public.payments where organization_id = current_setting('fx.org_a')::uuid and status = 'succeeded'),
  1300.00,
  'an org-wide owner''s payment SUM includes both clinics (500 + 800 = 1300)'
);
select is(
  (select count(*)::int from public.patients where organization_id = current_setting('fx.org_a')::uuid),
  2,
  'an org-wide owner''s patient COUNT includes both clinics'' patients'
);

-- ----------------------------------------------------------------------------
-- Cross-organization: org B's owner aggregating "by organization_id = org A"
-- must see nothing at all -- not a partial/wrong total, zero.
-- ----------------------------------------------------------------------------

select pg_temp.act_as('owner_b');

select is(
  (select coalesce(sum(total), 0)::numeric(14,2) from public.invoices where organization_id = current_setting('fx.org_a')::uuid),
  0.00,
  'org B''s owner aggregating over org A''s id sees zero invoiced total, not org A''s real numbers'
);
select is(
  (select count(*)::int from public.appointments where organization_id = current_setting('fx.org_a')::uuid),
  0,
  'org B''s owner aggregating over org A''s id sees zero appointments'
);
select is(
  (select count(*)::int from public.patients where organization_id = current_setting('fx.org_a')::uuid),
  0,
  'org B''s owner aggregating over org A''s id sees zero patients'
);

select * from finish();
rollback;
