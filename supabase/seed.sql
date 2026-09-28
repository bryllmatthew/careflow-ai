-- ============================================================================
-- Local dev seed data.
--
-- Runs automatically after every `supabase db reset` (this is the exact
-- filename the CLI looks for). Recreates the demo account and a realistic
-- working dataset so `db reset` -- needed whenever a migration changes --
-- never again leaves the app with no way to log in. This file was added
-- after exactly that happened during Phase 9 development: db reset wiped
-- auth.users (never seed-scripted before), and there was no way to recover
-- the prior ad hoc demo data created by hand through the UI.
--
-- Demo login: admin@careflow.local / CareFlow123!
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- Demo user. Inserted directly into auth.users (mirrors what GoTrue itself
-- writes on signup) rather than calling the signup API from SQL, which
-- isn't possible. public.handle_new_user() (migration 20260903072153) fires
-- on insert and creates the matching profiles row automatically.
-- encrypted_password uses the same bcrypt scheme GoTrue verifies against
-- (pgcrypto's crypt()/gen_salt('bf')), so the real login form works with
-- this account, not just direct API/RPC calls.
-- ----------------------------------------------------------------------------
do $$
declare
  v_admin_id         uuid := '00000000-0000-0000-0000-0000000000a1';
  v_practitioner_id  uuid := '00000000-0000-0000-0000-0000000000a2';
  v_receptionist_id  uuid := '00000000-0000-0000-0000-0000000000a3';

  v_org_id           uuid;
  v_clinic1_id       uuid;
  v_clinic2_id       uuid;
  v_owner_role_id    uuid;
  v_practitioner_role_id uuid;
  v_receptionist_role_id uuid;

  v_service_cleaning_id  uuid;
  v_service_whitening_id uuid;
  v_service_rootcanal_id uuid;

  v_supplier_id      uuid;
  v_product_floss_id uuid;
  v_product_gel_id   uuid;
  v_product_cotton_id uuid;

  v_patient_juan_id  uuid;
  v_patient_maria_id uuid;
  v_patient_pedro_id uuid;
  v_patient_liza_id  uuid;
  v_patient_carlos_id uuid;
  v_patient_nina_id  uuid;
  v_appt_id          uuid;
  v_invoice_id       uuid;
  v_po_id            uuid;

  v_now              timestamptz := now();
begin
  -- Idempotent: if the demo admin already exists (a reset was run against a
  -- database this script already seeded), skip everything rather than
  -- erroring on duplicate keys.
  if exists (select 1 from auth.users where id = v_admin_id) then
    raise notice 'Seed data already present -- skipping.';
    return;
  end if;

  -- --------------------------------------------------------------------------
  -- Users
  -- --------------------------------------------------------------------------
  -- confirmation_token/recovery_token/email_change_token_new/email_change
  -- have no column default (NULL) but GoTrue's Go model scans them as
  -- non-nullable strings -- a real signup always writes '', and a NULL
  -- here makes password-grant login fail with a 500 ("converting NULL to
  -- string is unsupported"), confirmed live against this exact insert.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    is_sso_user, is_anonymous, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated', 'authenticated',
    'admin@careflow.local', extensions.crypt('CareFlow123!', extensions.gen_salt('bf')),
    v_now, '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '', '', '', '',
    false, false, v_now, v_now
  );
  insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_admin_id, v_admin_id::text, 'email',
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@careflow.local', 'email_verified', true),
    v_now, v_now, v_now);

  -- Staff accounts exist to be referenced as appointment/patient staff --
  -- no password is set since they're not meant to be logged into directly.
  insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change, is_sso_user, is_anonymous, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', v_practitioner_id, 'authenticated', 'authenticated',
      'ana.reyes@careflow.local', v_now, '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Dr. Ana Reyes"}'::jsonb, '', '', '', '', false, false, v_now, v_now),
    ('00000000-0000-0000-0000-000000000000', v_receptionist_id, 'authenticated', 'authenticated',
      'mia.santos@careflow.local', v_now, '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Mia Santos"}'::jsonb, '', '', '', '', false, false, v_now, v_now);

  -- profiles.full_name isn't populated by handle_new_user() from
  -- raw_user_meta_data (it only copies email) -- set it directly so staff
  -- display names are real instead of falling back to their email.
  update public.profiles set full_name = 'Dr. Ana Reyes' where id = v_practitioner_id;
  update public.profiles set full_name = 'Mia Santos' where id = v_receptionist_id;

  -- --------------------------------------------------------------------------
  -- Organization + clinics. create_organization() derives its actor from
  -- auth.uid(), which reads the request.jwt.claims GUC -- fake it the same
  -- way supabase/tests/*.sql fixtures do, since there's no real session here.
  -- ----------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, false);

  v_org_id := public.create_organization('CareFlow Demo Clinic', 'dental', 'Davao Branch');
  select id into v_clinic1_id from public.clinics where organization_id = v_org_id order by created_at limit 1;

  -- Cebu is an AESTHETIC branch of a dental organization: the demo shows a
  -- mixed-type organization, and that the dental chart follows the clinic.
  insert into public.clinics (organization_id, name, address, timezone, status, clinic_type)
  values (v_org_id, 'Cebu Branch', '123 IT Park, Cebu City', 'Asia/Manila', 'active', 'aesthetic')
  returning id into v_clinic2_id;

  -- --------------------------------------------------------------------------
  -- Staff roles, scoped to clinic 1 (Davao Branch) -- not org-wide, so this
  -- also demonstrates the clinic-scoped-grant path, not just the owner's
  -- org-wide one.
  -- --------------------------------------------------------------------------
  select id into v_practitioner_role_id from public.roles where key = 'practitioner' and organization_id is null;
  select id into v_receptionist_role_id from public.roles where key = 'receptionist' and organization_id is null;

  insert into public.organization_memberships (organization_id, user_id, status) values
    (v_org_id, v_practitioner_id, 'active'),
    (v_org_id, v_receptionist_id, 'active');

  insert into public.user_roles (user_id, role_id, organization_id, clinic_id) values
    (v_practitioner_id, v_practitioner_role_id, v_org_id, v_clinic1_id),
    (v_receptionist_id, v_receptionist_role_id, v_org_id, v_clinic1_id);

  -- --------------------------------------------------------------------------
  -- Services (clinic 1)
  -- --------------------------------------------------------------------------
  insert into public.services (organization_id, clinic_id, name, description, duration_minutes, price, cost)
  values (v_org_id, v_clinic1_id, 'Dental Cleaning', 'Routine scale and polish.', 45, 1500.00, 300.00)
  returning id into v_service_cleaning_id;
  insert into public.services (organization_id, clinic_id, name, description, duration_minutes, price, cost)
  values (v_org_id, v_clinic1_id, 'Teeth Whitening', 'In-clinic whitening session.', 60, 4500.00, 900.00)
  returning id into v_service_whitening_id;
  insert into public.services (organization_id, clinic_id, name, description, duration_minutes, price, cost)
  values (v_org_id, v_clinic1_id, 'Root Canal Therapy', 'Single-visit root canal.', 90, 12000.00, 2500.00)
  returning id into v_service_rootcanal_id;

  -- --------------------------------------------------------------------------
  -- Supplier, products, inventory (clinic 1) -- one product deliberately
  -- below its reorder level so the low-stock dashboard alert has something
  -- real to show.
  -- --------------------------------------------------------------------------
  insert into public.suppliers (organization_id, name, contact_person, email, phone)
  values (v_org_id, 'MedSupply PH', 'Carlo Villanueva', 'orders@medsupplyph.test', '+63 917 555 0101')
  returning id into v_supplier_id;

  insert into public.products (organization_id, sku, name, category, unit_of_measure, unit_cost, selling_price, supplier_id, reorder_level, reorder_quantity)
  values (v_org_id, 'DF-001', 'Dental Floss (box)', 'Consumables', 'box', 45.00, null, v_supplier_id, 10, 30)
  returning id into v_product_floss_id;
  insert into public.products (organization_id, sku, name, category, unit_of_measure, unit_cost, selling_price, supplier_id, reorder_level, reorder_quantity)
  values (v_org_id, 'AG-002', 'Anesthetic Gel', 'Consumables', 'tube', 120.00, null, v_supplier_id, 15, 25)
  returning id into v_product_gel_id;
  insert into public.products (organization_id, sku, name, category, unit_of_measure, unit_cost, selling_price, supplier_id, reorder_level, reorder_quantity)
  values (v_org_id, 'CR-003', 'Cotton Rolls (pack)', 'Consumables', 'pack', 25.00, null, v_supplier_id, 20, 50)
  returning id into v_product_cotton_id;

  insert into public.inventory (organization_id, clinic_id, product_id, quantity_on_hand, reorder_level, reorder_quantity)
  values
    (v_org_id, v_clinic1_id, v_product_floss_id, 40, 10, 30),
    (v_org_id, v_clinic1_id, v_product_gel_id, 6, 15, 25),   -- below reorder_level on purpose
    (v_org_id, v_clinic1_id, v_product_cotton_id, 80, 20, 50);

  -- Draft purchase order for the low-stock item.
  insert into public.purchase_orders (organization_id, clinic_id, supplier_id, status, order_date, notes)
  values (v_org_id, v_clinic1_id, v_supplier_id, 'draft', current_date, 'Restock anesthetic gel.')
  returning id into v_po_id;
  insert into public.purchase_order_items (purchase_order_id, organization_id, clinic_id, product_id, description, quantity_ordered, unit_cost)
  values (v_po_id, v_org_id, v_clinic1_id, v_product_gel_id, 'Anesthetic Gel', 25, 120.00);

  -- --------------------------------------------------------------------------
  -- Patients (clinic 1) -- two assigned to the practitioner, to exercise
  -- the patients.view.assigned row-scope branch.
  -- --------------------------------------------------------------------------
  insert into public.patients (organization_id, clinic_id, first_name, last_name, email, phone, date_of_birth, gender, assigned_staff_id, status)
  values (v_org_id, v_clinic1_id, 'Juan', 'Dela Cruz', 'juan.delacruz@example.test', '+63 917 111 0001', '1988-04-12', 'male', v_practitioner_id, 'active')
  returning id into v_patient_juan_id;
  insert into public.patients (organization_id, clinic_id, first_name, last_name, email, phone, date_of_birth, gender, assigned_staff_id, status)
  values (v_org_id, v_clinic1_id, 'Maria', 'Santos', 'maria.santos@example.test', '+63 917 111 0002', '1995-09-02', 'female', v_practitioner_id, 'active')
  returning id into v_patient_maria_id;
  insert into public.patients (organization_id, clinic_id, first_name, last_name, email, phone, date_of_birth, gender, assigned_staff_id, status)
  values (v_org_id, v_clinic1_id, 'Pedro', 'Ramos', 'pedro.ramos@example.test', '+63 917 111 0003', '1979-01-23', 'male', null, 'active')
  returning id into v_patient_pedro_id;
  insert into public.patients (organization_id, clinic_id, first_name, last_name, email, phone, date_of_birth, gender, assigned_staff_id, status)
  values (v_org_id, v_clinic1_id, 'Liza', 'Gonzales', 'liza.gonzales@example.test', '+63 917 111 0004', '2001-06-30', 'female', null, 'active')
  returning id into v_patient_liza_id;
  insert into public.patients (organization_id, clinic_id, first_name, last_name, email, phone, date_of_birth, gender, assigned_staff_id, status)
  values (v_org_id, v_clinic1_id, 'Carlos', 'Tan', 'carlos.tan@example.test', '+63 917 111 0005', '1990-11-15', 'male', null, 'active')
  returning id into v_patient_carlos_id;
  insert into public.patients (organization_id, clinic_id, first_name, last_name, email, phone, date_of_birth, gender, assigned_staff_id, status)
  values (v_org_id, v_clinic1_id, 'Nina', 'Villareal', 'nina.villareal@example.test', '+63 917 111 0006', '1985-03-08', 'female', null, 'active')
  returning id into v_patient_nina_id;

  -- --------------------------------------------------------------------------
  -- Appointments: a mix of past-completed, cancelled, no-show, and
  -- upcoming, spread across ~6 weeks so date-range filters (today/this
  -- week/this month/last month) all return something.
  -- --------------------------------------------------------------------------
  -- Completed, 3 weeks ago -- will get a fully-paid invoice.
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
  values (v_org_id, v_clinic1_id, v_patient_juan_id, v_service_cleaning_id, v_practitioner_id,
          v_now - interval '21 days', v_now - interval '21 days' + interval '45 minutes', 'completed')
  returning id into v_appt_id;

  insert into public.invoices (organization_id, clinic_id, patient_id, appointment_id, status, due_date)
  values (v_org_id, v_clinic1_id, v_patient_juan_id, v_appt_id, 'draft', (v_now - interval '21 days')::date + 14)
  returning id into v_invoice_id;
  insert into public.invoice_items (invoice_id, organization_id, clinic_id, service_id, description, quantity, unit_price)
  values (v_invoice_id, v_org_id, v_clinic1_id, v_service_cleaning_id, 'Dental Cleaning', 1, 1500.00);
  update public.invoices set status = 'issued' where id = v_invoice_id;
  perform public.record_manual_payment(v_invoice_id, 1500.00, 'cash', 'OR-0001');

  -- Completed, 10 days ago -- partially paid (outstanding balance).
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
  values (v_org_id, v_clinic1_id, v_patient_maria_id, v_service_whitening_id, v_practitioner_id,
          v_now - interval '10 days', v_now - interval '10 days' + interval '60 minutes', 'completed')
  returning id into v_appt_id;

  insert into public.invoices (organization_id, clinic_id, patient_id, appointment_id, status, due_date)
  values (v_org_id, v_clinic1_id, v_patient_maria_id, v_appt_id, 'draft', (v_now - interval '10 days')::date + 14)
  returning id into v_invoice_id;
  insert into public.invoice_items (invoice_id, organization_id, clinic_id, service_id, description, quantity, unit_price)
  values (v_invoice_id, v_org_id, v_clinic1_id, v_service_whitening_id, 'Teeth Whitening', 1, 4500.00);
  update public.invoices set status = 'issued' where id = v_invoice_id;
  perform public.record_manual_payment(v_invoice_id, 2000.00, 'bank_transfer', 'TXN-0002');

  -- Completed, 40 days ago -- unpaid, past due (overdue receivable).
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
  values (v_org_id, v_clinic1_id, v_patient_pedro_id, v_service_rootcanal_id, v_practitioner_id,
          v_now - interval '40 days', v_now - interval '40 days' + interval '90 minutes', 'completed')
  returning id into v_appt_id;

  insert into public.invoices (organization_id, clinic_id, patient_id, appointment_id, status, due_date)
  values (v_org_id, v_clinic1_id, v_patient_pedro_id, v_appt_id, 'draft', (v_now - interval '40 days')::date + 7)
  returning id into v_invoice_id;
  insert into public.invoice_items (invoice_id, organization_id, clinic_id, service_id, description, quantity, unit_price)
  values (v_invoice_id, v_org_id, v_clinic1_id, v_service_rootcanal_id, 'Root Canal Therapy', 1, 12000.00);
  update public.invoices set status = 'issued' where id = v_invoice_id;

  -- Completed, 5 days ago -- no invoice yet (still billable).
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
  values (v_org_id, v_clinic1_id, v_patient_liza_id, v_service_cleaning_id, v_practitioner_id,
          v_now - interval '5 days', v_now - interval '5 days' + interval '45 minutes', 'completed');

  -- No-show, 2 days ago -- triggers a high-priority follow-up below.
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
  values (v_org_id, v_clinic1_id, v_patient_carlos_id, v_service_cleaning_id, v_practitioner_id,
          v_now - interval '2 days', v_now - interval '2 days' + interval '45 minutes', 'no_show')
  returning id into v_appt_id;

  insert into public.follow_ups (organization_id, clinic_id, patient_id, appointment_id, type, status, priority, due_at, assigned_to, notes)
  values (v_org_id, v_clinic1_id, v_patient_carlos_id, v_appt_id, 'no_show', 'pending', 'high', v_now - interval '1 day', v_receptionist_id, 'Missed cleaning appointment -- reschedule.');

  -- Cancelled, 1 week ago.
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
  values (v_org_id, v_clinic1_id, v_patient_nina_id, v_service_whitening_id, v_practitioner_id,
          v_now - interval '7 days', v_now - interval '7 days' + interval '60 minutes', 'cancelled');

  -- Upcoming: confirmed tomorrow, pending next week.
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
  values (v_org_id, v_clinic1_id, v_patient_juan_id, v_service_cleaning_id, v_practitioner_id,
          v_now + interval '1 day', v_now + interval '1 day' + interval '45 minutes', 'confirmed');
  insert into public.appointments (organization_id, clinic_id, patient_id, service_id, staff_id, start_at, end_at, status)
  values (v_org_id, v_clinic1_id, v_patient_maria_id, v_service_whitening_id, v_practitioner_id,
          v_now + interval '6 days', v_now + interval '6 days' + interval '60 minutes', 'pending');

  -- --------------------------------------------------------------------------
  -- A couple more follow-ups independent of the no-show one above, so
  -- "due today" / "upcoming" buckets both have a row too.
  -- --------------------------------------------------------------------------
  insert into public.follow_ups (organization_id, clinic_id, patient_id, type, status, priority, due_at, assigned_to, notes)
  values
    (v_org_id, v_clinic1_id, v_patient_pedro_id, 'payment', 'pending', 'high', date_trunc('day', v_now) + interval '10 hours', v_receptionist_id, 'Follow up on the overdue root canal invoice.'),
    (v_org_id, v_clinic1_id, v_patient_liza_id, 'post_appointment', 'pending', 'normal', v_now + interval '3 days', v_practitioner_id, 'Check in after cleaning -- any sensitivity?');

  -- --------------------------------------------------------------------------
  -- Phase 10: the first clinic's public booking page, live and bookable at
  -- /book/smile-dental.
  --
  -- Operating hours are set HERE for the first time -- clinics.operating_hours
  -- has existed since migration 0001 and nothing has ever written to it,
  -- because no feature read it until the availability engine did. Without it
  -- the booking page renders correctly and offers no times at all, which is
  -- accurate but makes for a poor demo.
  -- --------------------------------------------------------------------------
  update public.clinics
     set slug = 'smile-dental',
         -- Every monetary and location example in the spec set is Philippine
         -- (docs/AI_TOOLS.md, docs/UI_UX_SPEC.md), and the availability engine
         -- renders slots in the CLINIC's zone -- so the demo clinic should not
         -- sit in UTC.
         timezone = 'Asia/Manila',
         operating_hours = '{"mon":[{"open":"09:00","close":"12:00"},{"open":"13:00","close":"17:00"}],
                             "tue":[{"open":"09:00","close":"12:00"},{"open":"13:00","close":"17:00"}],
                             "wed":[{"open":"09:00","close":"12:00"},{"open":"13:00","close":"17:00"}],
                             "thu":[{"open":"09:00","close":"12:00"},{"open":"13:00","close":"17:00"}],
                             "fri":[{"open":"09:00","close":"12:00"},{"open":"13:00","close":"17:00"}],
                             "sat":[{"open":"09:00","close":"12:00"}]}'::jsonb
   where id = v_clinic1_id;

  update public.clinics set slug = 'smile-dental-cebu' where id = v_clinic2_id;

  insert into public.clinic_booking_settings (
    organization_id, clinic_id, online_booking_enabled, min_notice_hours,
    max_advance_days, confirmation_mode, welcome_message
  )
  values (
    v_org_id, v_clinic1_id, true, 2, 45, 'manual',
    'Choose a service to get started. We''ll confirm your appointment by text.'
  );

  -- Cleaning and whitening are publishable; the root canal deliberately is
  -- not, so the demo shows that publishing is per-service and opt-in.
  update public.services
     set online_booking_enabled = true
   where id in (v_service_cleaning_id, v_service_whitening_id);

  update public.services
     set public_name = 'Teeth Whitening (in-clinic)',
         public_description = 'A single 60-minute in-clinic whitening session.'
   where id = v_service_whitening_id;

  insert into public.clinic_booking_practitioners (
    organization_id, clinic_id, user_id, display_name, title, bio, active
  )
  values (
    v_org_id, v_clinic1_id, v_practitioner_id, 'Dr. Ramon Cruz', 'Dentist',
    'General and cosmetic dentistry, 12 years in practice.', true
  );

  insert into public.booking_links (
    organization_id, clinic_id, name, token,
    default_service_id, utm_source, utm_medium, utm_campaign, created_by
  )
  values (
    v_org_id, v_clinic1_id, 'Facebook — cleaning promo', 'fbcleaning2026',
    v_service_cleaning_id, 'facebook', 'paid', 'cleaning-promo', v_admin_id
  );

  -- --------------------------------------------------------------------------
  -- Dental chart for Juan (Davao Branch is a dental clinic). Written through
  -- the same RPCs the app uses, acting as the practitioner so every record is
  -- signed by the dentist rather than the admin.
  -- --------------------------------------------------------------------------
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_practitioner_id, 'role', 'authenticated')::text, false);

  perform public.dental_record_conditions(v_patient_juan_id, array[18, 28]::smallint[], 'missing');
  perform public.dental_record_conditions(v_patient_juan_id, array[46]::smallint[], 'crown',
    '{}', 'Porcelain-fused-to-metal crown, placed at a previous clinic.');
  perform public.dental_record_conditions(v_patient_juan_id, array[48]::smallint[], 'impacted',
    '{}', 'Partially erupted. Monitor; refer if symptomatic.');
  perform public.dental_record_conditions(v_patient_juan_id, array[36]::smallint[], 'caries',
    array['occlusal', 'distal'], 'Sensitive to cold.');

  -- Performed: a restoration on 14 (charts the tooth as restored).
  perform public.dental_plan_treatment(v_patient_juan_id, 'Composite restoration',
    '[{"tooth_code": 14, "surfaces": ["mesial", "occlusal"]}]'::jsonb,
    p_resulting_condition => 'restoration', p_complete_now => true);

  -- Planned, and scheduled into Juan's appointment tomorrow.
  perform public.dental_plan_treatment(v_patient_juan_id, 'Composite restoration',
    '[{"tooth_code": 36, "surfaces": ["occlusal", "distal"]}]'::jsonb,
    p_appointment_id => (select id from public.appointments
                          where patient_id = v_patient_juan_id and start_at > v_now
                          order by start_at limit 1),
    p_resulting_condition => 'restoration');

  -- Planned, not yet scheduled.
  perform public.dental_plan_treatment(v_patient_juan_id, 'Surgical extraction',
    '[{"tooth_code": 48}]'::jsonb,
    p_resulting_condition => 'extracted', p_notes => 'Refer to oral surgeon if roots are curved.');

  -- Spread the chart over time so its history reads like a real patient's,
  -- not one afternoon. Demo data only: the guards stamp every live record
  -- with now(), so they (and the audit triggers) are paused for this backdate.
  alter table public.dental_conditions disable trigger user;
  alter table public.dental_treatments disable trigger user;

  update public.dental_conditions set noted_at = v_now - interval '120 days'
   where patient_id = v_patient_juan_id and condition in ('missing', 'crown', 'impacted');
  update public.dental_conditions set noted_at = v_now - interval '14 days'
   where patient_id = v_patient_juan_id and condition = 'caries';

  update public.dental_treatments
     set planned_at = v_now - interval '42 days', completed_at = v_now - interval '35 days'
   where patient_id = v_patient_juan_id and status = 'completed';
  update public.dental_conditions set noted_at = v_now - interval '35 days'
   where patient_id = v_patient_juan_id and source_treatment_id is not null;
  update public.dental_treatments set planned_at = v_now - interval '14 days'
   where patient_id = v_patient_juan_id and status in ('planned', 'scheduled');

  alter table public.dental_conditions enable trigger user;
  alter table public.dental_treatments enable trigger user;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_admin_id, 'role', 'authenticated')::text, false);

  raise notice 'Seed complete: organization %, clinics % / %, staff % / %',
    v_org_id, v_clinic1_id, v_clinic2_id, v_practitioner_id, v_receptionist_id;
end $$;

commit;
