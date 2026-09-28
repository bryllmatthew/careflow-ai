-- ============================================================================
-- Clinic types + the dental module: capability gating, permissions, patient
-- visibility, the clinical state machine, immutability, audit, isolation.
--
-- Fixture:
--   Org A  clinic A1 = dental, clinic A2 = aesthetic (one org, two types)
--          owner, practitioner (assigned patients only), receptionist,
--          inventory manager, and a custom "dental assistant" role holding
--          dental.record but NOT dental.complete
--          patients: pA1 (A1, assigned), pA1u (A1, unassigned),
--                    pA2 (A2, assigned -- visible to the practitioner, so a
--                    refusal there can only come from the clinic type)
--   Org B  clinic B1 = dental, owner, patient pB1
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;

select plan(43);

create or replace function pg_temp.act_as(p_fixture_key text) returns void
language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', current_setting('fx.' || p_fixture_key), 'role', 'authenticated')::text,
    true);
$$;

do $$
declare
  v_owner_a uuid := gen_random_uuid();
  v_prac    uuid := gen_random_uuid();
  v_recep   uuid := gen_random_uuid();
  v_inv     uuid := gen_random_uuid();
  v_asst    uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_org_a uuid; v_org_b uuid; v_a1 uuid; v_a2 uuid; v_b1 uuid;
  v_svc_a1 uuid; v_pa1 uuid; v_pa1u uuid; v_pa2 uuid; v_pb1 uuid;
  v_ap_pa1 uuid; v_ap_pa1u uuid; v_asst_role uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, confirmation_token, recovery_token,
                          email_change_token_new, email_change)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', u.email, 'x',
         now(), now(), now(), '', '', '', ''
    from (values (v_owner_a, 'owner-a@dental.test'), (v_prac, 'prac@dental.test'),
                 (v_recep, 'recep@dental.test'), (v_inv, 'inv@dental.test'),
                 (v_asst, 'asst@dental.test'), (v_owner_b, 'owner-b@dental.test')) as u (id, email);

  insert into public.organizations (name, business_type) values ('Dental Org A', 'dental') returning id into v_org_a;
  insert into public.organizations (name, business_type) values ('Dental Org B', 'dental') returning id into v_org_b;

  insert into public.clinics (organization_id, name, clinic_type) values (v_org_a, 'A1 Dental', 'dental')    returning id into v_a1;
  insert into public.clinics (organization_id, name, clinic_type) values (v_org_a, 'A2 Aesthetic', 'aesthetic') returning id into v_a2;
  insert into public.clinics (organization_id, name, clinic_type) values (v_org_b, 'B1 Dental', 'dental')    returning id into v_b1;

  insert into public.organization_memberships (organization_id, user_id, status)
  select v_org_a, u, 'active' from unnest(array[v_owner_a, v_prac, v_recep, v_inv, v_asst]) as u
  union all select v_org_b, v_owner_b, 'active';

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id)
  select x.u, r.id, x.o, null
    from (values (v_owner_a, 'owner', v_org_a), (v_prac, 'practitioner', v_org_a),
                 (v_recep, 'receptionist', v_org_a), (v_inv, 'inventory_manager', v_org_a),
                 (v_owner_b, 'owner', v_org_b)) as x (u, k, o)
    join public.roles r on r.key = x.k and r.organization_id is null;

  -- A custom role that may chart and plan but not sign off a procedure.
  insert into public.roles (organization_id, key, name) values (v_org_a, 'dental_assistant', 'Dental Assistant')
  returning id into v_asst_role;
  insert into public.role_permissions (role_id, permission_key)
  values (v_asst_role, 'patients.view'), (v_asst_role, 'dental.view'), (v_asst_role, 'dental.record');
  insert into public.user_roles (user_id, role_id, organization_id, clinic_id)
  values (v_asst, v_asst_role, v_org_a, null);

  insert into public.services (organization_id, clinic_id, name, duration_minutes, price)
  values (v_org_a, v_a1, 'Composite Restoration', 45, 2500) returning id into v_svc_a1;

  insert into public.patients (organization_id, clinic_id, first_name, last_name, assigned_staff_id)
  values (v_org_a, v_a1, 'Assigned', 'Dental', v_prac) returning id into v_pa1;
  insert into public.patients (organization_id, clinic_id, first_name, last_name)
  values (v_org_a, v_a1, 'Unassigned', 'Dental') returning id into v_pa1u;
  insert into public.patients (organization_id, clinic_id, first_name, last_name, assigned_staff_id)
  values (v_org_a, v_a2, 'Assigned', 'Aesthetic', v_prac) returning id into v_pa2;
  insert into public.patients (organization_id, clinic_id, first_name, last_name)
  values (v_org_b, v_b1, 'Other', 'Tenant') returning id into v_pb1;

  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
  values (v_org_a, v_a1, v_pa1, v_svc_a1, v_prac, now() + interval '2 days', now() + interval '2 days 45 minutes', 'confirmed')
  returning id into v_ap_pa1;
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
  values (v_org_a, v_a1, v_pa1u, v_svc_a1, v_prac, now() + interval '3 days', now() + interval '3 days 45 minutes', 'confirmed')
  returning id into v_ap_pa1u;

  perform set_config('fx.owner_a', v_owner_a::text, false);
  perform set_config('fx.prac',    v_prac::text,    false);
  perform set_config('fx.recep',   v_recep::text,   false);
  perform set_config('fx.inv',     v_inv::text,     false);
  perform set_config('fx.asst',    v_asst::text,    false);
  perform set_config('fx.owner_b', v_owner_b::text, false);
  perform set_config('fx.org_a',   v_org_a::text,   false);
  perform set_config('fx.a1',      v_a1::text,      false);
  perform set_config('fx.a2',      v_a2::text,      false);
  perform set_config('fx.pa1',     v_pa1::text,     false);
  perform set_config('fx.pa1u',    v_pa1u::text,    false);
  perform set_config('fx.pa2',     v_pa2::text,     false);
  perform set_config('fx.pb1',     v_pb1::text,     false);
  perform set_config('fx.ap_pa1',  v_ap_pa1::text,  false);
  perform set_config('fx.ap_pa1u', v_ap_pa1u::text, false);
end $$;

-- =============================================================== structure ==

select has_column('public', 'clinics', 'clinic_type', 'clinics carry a clinic type');

select is((select count(*)::int from public.dental_teeth where dentition = 'permanent'), 32,
  'the reference table holds all 32 permanent teeth');

select is(
  (select string_agg(universal, ',' order by code) from public.dental_teeth where code in (18, 28, 38, 48)),
  '1,16,17,32',
  'Universal numbers are derived correctly from ISO 3950 codes (18->1, 28->16, 38->17, 48->32)');

select ok(app.clinic_type_has_capability('dental', 'dental'), 'a dental clinic has the dental capability');
select ok(not app.clinic_type_has_capability('aesthetic', 'dental'), 'an aesthetic clinic does not');

-- create_organization() stamps the first clinic with the organization's type.
select pg_temp.act_as('owner_b');
select public.create_organization('Typed Org', 'medical', 'Typed Clinic') as typed_org \gset
select is((select clinic_type from public.clinics where organization_id = :'typed_org'::uuid),
  'medical', 'onboarding''s clinic type is stored on the first clinic');

-- ============================================================= permissions ==

select ok(exists (select 1 from public.role_permissions rp join public.roles r on r.id = rp.role_id
                   where r.key = 'practitioner' and r.organization_id is null
                     and rp.permission_key = 'dental.complete'),
  'practitioners may sign off dental treatments');

select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
            where r.key = 'receptionist' and r.organization_id is null and rp.permission_key like 'dental.%'),
  0, 'receptionists get no dental permissions by default');

select is((select count(*)::int from public.role_permissions rp join public.roles r on r.id = rp.role_id
            where r.key = 'inventory_manager' and r.organization_id is null and rp.permission_key like 'dental.%'),
  0, 'inventory managers get no dental permissions');

-- ============================================================ practitioner ==

set local role authenticated;
select pg_temp.act_as('prac');

select lives_ok(
  $$select public.dental_record_conditions(current_setting('fx.pa1')::uuid, array[26]::smallint[],
                                          'caries', array['occlusal'], 'Deep occlusal lesion')$$,
  'a practitioner records a condition on an assigned patient');

select is((select count(*)::int from public.dental_conditions where patient_id = current_setting('fx.pa1')::uuid),
  1, 'and can read it back');

select throws_ok(
  $$select public.dental_record_conditions(current_setting('fx.pa1u')::uuid, array[26]::smallint[], 'caries')$$,
  '42501', null,
  'a practitioner cannot chart a patient they are not assigned to -- dental access follows patient access');

select throws_ok(
  $$select public.dental_record_conditions(current_setting('fx.pa2')::uuid, array[26]::smallint[], 'caries')$$,
  '42501', null,
  'a patient of an AESTHETIC clinic cannot be charted, even one the practitioner can see');

select public.dental_plan_treatment(
  current_setting('fx.pa1')::uuid, 'Composite restoration',
  '[{"tooth_code": 11, "surfaces": ["mesial", "incisal"]}, {"tooth_code": 12, "surfaces": ["distal"]}]'::jsonb,
  p_resulting_condition => 'restoration') as tid \gset
select set_config('fx.tid', :'tid', false);

select is((select status from public.dental_treatments where id = current_setting('fx.tid')::uuid),
  'planned', 'a new treatment starts as planned');

select is((select count(*)::int from public.dental_treatment_teeth where treatment_id = current_setting('fx.tid')::uuid),
  2, 'one procedure covering two teeth is one treatment with two tooth rows');

select public.dental_schedule_treatment(current_setting('fx.tid')::uuid, current_setting('fx.ap_pa1')::uuid);
select is((select status from public.dental_treatments where id = current_setting('fx.tid')::uuid),
  'scheduled', 'linking an appointment schedules the plan -- and does not complete it');

select throws_ok(
  $$select public.dental_schedule_treatment(current_setting('fx.tid')::uuid, current_setting('fx.ap_pa1u')::uuid)$$,
  '23514', null, 'a treatment cannot be linked to another patient''s appointment');

select public.dental_complete_treatment(current_setting('fx.tid')::uuid);
select is((select status from public.dental_treatments where id = current_setting('fx.tid')::uuid),
  'completed', 'an explicit sign-off completes the treatment');

select is((select completed_by from public.dental_treatments where id = current_setting('fx.tid')::uuid),
  current_setting('fx.prac')::uuid, 'completion is stamped with the real signer, not a client value');

select is((select count(*)::int from public.dental_conditions
            where source_treatment_id = current_setting('fx.tid')::uuid and condition = 'restoration'),
  2, 'completing writes the resulting condition onto every treated tooth');

select throws_ok(
  $$update public.dental_treatments set notes = 'rewritten' where id = current_setting('fx.tid')::uuid$$,
  '42501', null, 'a completed treatment cannot be edited');

select throws_ok(
  $$select public.dental_close_treatment(current_setting('fx.tid')::uuid, '', true)$$,
  '23514', null, 'marking a record entered-in-error requires a reason');

select lives_ok(
  $$select public.dental_close_treatment(current_setting('fx.tid')::uuid, 'Charted on the wrong patient', true)$$,
  'a completed treatment can be corrected as entered-in-error, with a reason');

select throws_ok(
  $$update public.dental_conditions set condition = 'crown'
     where patient_id = current_setting('fx.pa1')::uuid and condition = 'caries'$$,
  '42501', null, 'a recorded condition cannot be rewritten in place');

select lives_ok(
  $$select public.dental_set_condition_status(
      (select id from public.dental_conditions
        where patient_id = current_setting('fx.pa1')::uuid and condition = 'caries'), 'resolved')$$,
  'a condition can be resolved');

select throws_ok(
  $$delete from public.dental_conditions where patient_id = current_setting('fx.pa1')::uuid$$,
  '42501', null, 'dental records cannot be deleted');

select is((select closed_by from public.dental_conditions
            where patient_id = current_setting('fx.pa1')::uuid and condition = 'caries'),
  current_setting('fx.prac')::uuid, 'resolving is stamped with who did it');

-- ================================================ dental assistant (custom) ==

select pg_temp.act_as('asst');

select public.dental_plan_treatment(
  current_setting('fx.pa1')::uuid, 'Scaling', '[{"tooth_code": 31}]'::jsonb) as asst_tid \gset
select set_config('fx.asst_tid', :'asst_tid', false);

select is((select status from public.dental_treatments where id = current_setting('fx.asst_tid')::uuid),
  'planned', 'dental.record is enough to plan a treatment');

select throws_ok(
  $$select public.dental_complete_treatment(current_setting('fx.asst_tid')::uuid)$$,
  '42501', null, 'but signing it off requires dental.complete');

-- ============================================================ receptionist ==

select pg_temp.act_as('recep');

select is((select count(*)::int from public.dental_conditions), 0,
  'a receptionist sees no dental records');

select throws_ok(
  $$select public.dental_record_conditions(current_setting('fx.pa1')::uuid, array[16]::smallint[], 'caries')$$,
  '42501', null, 'and cannot record one, even for a patient they can see');

-- ======================================================= inventory manager ==

select pg_temp.act_as('inv');
select is((select count(*)::int from public.dental_treatments), 0,
  'an inventory manager sees no dental treatments');

-- ============================================================ other tenant ==

select pg_temp.act_as('owner_b');

select is((select count(*)::int from public.dental_conditions), 0,
  'another organization''s owner sees none of org A''s dental records');

select throws_ok(
  $$select public.dental_record_conditions(current_setting('fx.pa1')::uuid, array[16]::smallint[], 'caries')$$,
  '42501', null, 'and cannot write to org A''s patient by supplying its id');

-- ================================================== owner, aesthetic clinic ==

select pg_temp.act_as('owner_a');

select throws_ok(
  $$select public.dental_record_conditions(current_setting('fx.pa2')::uuid, array[26]::smallint[], 'caries')$$,
  '42501', null,
  'even the organization owner cannot create dental data in a non-dental clinic');

select is((select count(*)::int from public.dental_conditions
            where patient_id = current_setting('fx.pa1')::uuid),
  3, 'the owner sees the full history: the resolved caries and both restorations');

-- ================================================ clinic type change guard ==

select throws_ok(
  $$update public.clinics set clinic_type = 'medical' where id = current_setting('fx.a1')::uuid$$,
  '23514', null,
  'a clinic holding dental records cannot be re-typed as non-dental (its history would vanish)');

select lives_ok(
  $$update public.clinics set clinic_type = 'wellness' where id = current_setting('fx.a2')::uuid$$,
  'a clinic with no dental records can change type freely');

-- =================================================================== audit ==

reset role;

select ok(exists (select 1 from public.audit_logs
                   where action = 'dental.condition.added' and user_id = current_setting('fx.prac')::uuid),
  'adding a condition is audited');

select ok(exists (select 1 from public.audit_logs
                   where action = 'dental.treatment.completed' and entity_id = current_setting('fx.tid')::uuid),
  'completing a treatment is audited');

select ok(exists (select 1 from public.audit_logs
                   where action = 'dental.treatment.corrected' and entity_id = current_setting('fx.tid')::uuid
                     and metadata ->> 'reason' = 'Charted on the wrong patient'),
  'a correction is audited with its reason');

select ok(exists (select 1 from public.audit_logs
                   where action = 'dental.condition.resolved'
                     and (metadata ->> 'previous_status') = 'present'),
  'a status change records the previous value');

-- ==================================================================== anon ==

set local role anon;
select throws_ok($$select 1 from public.dental_conditions limit 1$$, '42501', null,
  'the anonymous role cannot read dental records');

select * from finish();
rollback;
