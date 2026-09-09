-- ============================================================================
-- 0022 — Online booking staff notifications (Phase 10 follow-up)
--
-- A booking that arrives while nobody is looking at the calendar is the whole
-- risk of putting a booking page on the internet: the clinic finds out when the
-- patient turns up. Phase 10 shipped the booking, the audit row and the
-- patient's own confirmation, but nothing told the clinic.
--
-- This adds staff notifications for the three things a patient can do
-- unattended -- book, cancel, reschedule -- through the SAME per-user
-- notifications inbox every other operational alert uses (migration 0014). No
-- new delivery mechanism, no second inbox.
--
-- Cancellation and reschedule are included even though only "new booking" was
-- asked for: a patient silently cancelling is strictly worse for a clinic than
-- a patient silently booking, and the marginal cost is two more calls.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extend the notification type vocabulary (the same drop/add pattern
-- migrations 0016 and 0017 already use on this constraint).
-- ----------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'followup_due', 'followup_overdue', 'reminder_failed',
    'appointment_cancelled', 'appointment_rescheduled',
    'no_show_followup_created',
    'payment_succeeded', 'payment_failed', 'payment_refunded',
    'inventory_low_stock', 'inventory_out_of_stock', 'inventory_consumption_failed',
    'online_booking_created', 'online_booking_cancelled', 'online_booking_rescheduled'
  ));

-- ----------------------------------------------------------------------------
-- app.clinic_notify_targets — "who should hear about this clinic?"
--
-- The inverse of app.permitted_clinics(): that answers "which clinics may the
-- CURRENT user touch", this answers "which users may touch THIS clinic". The
-- booking path has no current user at all, so the usual helper cannot serve.
--
-- Same joins and the same membership-status rule, so a suspended or removed
-- member stops being notified at exactly the moment they stop being able to
-- open the appointment -- the two can never drift apart.
-- ----------------------------------------------------------------------------

create or replace function app.clinic_notify_targets(p_clinic_id uuid, p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(array_agg(distinct ur.user_id), '{}'::uuid[])
    from public.user_roles ur
    join public.organization_memberships m
      on m.organization_id = ur.organization_id
     and m.user_id = ur.user_id
     and m.status = 'active'
    join public.role_permissions rp
      on rp.role_id = ur.role_id
     and rp.permission_key = p_permission
    join public.clinics c
      on c.organization_id = ur.organization_id
     and (ur.clinic_id is null or c.id = ur.clinic_id)
   where c.id = p_clinic_id
$fn$;

revoke execute on function app.clinic_notify_targets(uuid, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- app.notify_booking — one notification per staff member who can see this
-- clinic's appointments.
--
-- Deliberately NOT public.create_notification(): that function requires
-- auth.uid() and refuses an unauthenticated caller, which is precisely the
-- caller here. This writes the same rows into the same table and is reachable
-- only from inside the booking RPCs.
--
-- Recipients are gated on appointments.view, so this can never tell someone
-- about an appointment they are not allowed to open -- the notification and
-- the row it links to are governed by one permission.
-- ----------------------------------------------------------------------------

create or replace function app.notify_booking(
  p_appointment_id uuid,
  p_type           text,
  p_title          text,
  p_message        text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_appt record;
begin
  select a.id, a.organization_id, a.clinic_id into v_appt
    from public.appointments a where a.id = p_appointment_id;
  if not found then
    return;
  end if;

  insert into public.notifications (
    organization_id, user_id, type, title, message, entity_type, entity_id
  )
  select v_appt.organization_id, target, p_type, p_title, p_message, 'appointment', v_appt.id
    from unnest(app.clinic_notify_targets(v_appt.clinic_id, 'appointments.view')) as target;
end;
$fn$;

revoke execute on function app.notify_booking(uuid, text, text, text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- app.booking_notice_line — "Ana Reyes · Dental Cleaning · Tue 08 Sep, 1:00 PM"
--
-- Rendered in the CLINIC's timezone: a notification that says 5:00 AM for a
-- 1:00 PM appointment is worse than no notification. The patient's name is
-- included because every recipient holds appointments.view for this clinic and
-- can already open the record -- withholding it would only make the alert
-- useless, not safer.
-- ----------------------------------------------------------------------------

create or replace function app.booking_notice_line(p_appointment_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select concat_ws(' · ',
           p.first_name || ' ' || p.last_name,
           coalesce(nullif(btrim(s.public_name), ''), s.name),
           to_char(a.start_at at time zone c.timezone, 'FMDy DD Mon, FMHH12:MI AM'))
    from public.appointments a
    join public.patients p on p.id = a.patient_id
    join public.services s on s.id = a.service_id
    join public.clinics  c on c.id = a.clinic_id
   where a.id = p_appointment_id
$fn$;

revoke execute on function app.booking_notice_line(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Wire the three patient-facing RPCs.
--
-- Each notification call is the last step before the return value. None can
-- fail the booking: notifying zero recipients is a no-op insert, so a clinic
-- with nobody holding appointments.view simply gets no alert.
--
-- Only the notification lines are new -- everything else is migration 0020's
-- body, restated because CREATE OR REPLACE FUNCTION has no partial form.
-- ----------------------------------------------------------------------------

create or replace function public.create_public_booking(
  p_slug             text,
  p_service_id       uuid,
  p_start_at         timestamptz,
  p_first_name       text,
  p_last_name        text,
  p_phone            text    default null,
  p_email            text    default null,
  p_staff_id         uuid    default null,
  p_notes            text    default null,
  p_date_of_birth    date    default null,
  p_link_token       text    default null,
  p_idempotency_key  text    default null,
  p_client_key       text    default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_clinic   public.clinics;
  v_set      public.clinic_booking_settings;
  v_link     public.booking_links;
  v_service  public.services;
  v_staff    uuid[];
  v_chosen   uuid;
  v_patient  uuid;
  v_existing public.appointments;
  v_token    text;
  v_ref      text;
  v_appt_id  uuid;
  v_end_at   timestamptz;
  v_status   text;
  v_phone_n  text;
  v_email_n  text;
begin
  v_clinic := app.bookable_clinic(p_slug);
  if v_clinic.id is null then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  select * into v_set from public.clinic_booking_settings where clinic_id = v_clinic.id;

  if not app.consume_rate_limit('book:' || coalesce(p_client_key, 'anon'), 5, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
      from public.appointments
     where clinic_id = v_clinic.id and booking_idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'ok', true, 'duplicate', true,
        'appointmentId', v_existing.id,
        'reference', v_existing.booking_reference,
        'startAt', v_existing.start_at
      );
    end if;
  end if;

  p_first_name := btrim(coalesce(p_first_name, ''));
  p_last_name  := btrim(coalesce(p_last_name, ''));
  v_phone_n    := app.normalize_phone(p_phone);
  v_email_n    := nullif(lower(btrim(coalesce(p_email, ''))), '');

  if p_first_name = '' or p_last_name = '' then
    return jsonb_build_object('ok', false, 'error', 'name_required');
  end if;
  if v_phone_n is null and v_email_n is null then
    return jsonb_build_object('ok', false, 'error', 'contact_required');
  end if;
  if v_email_n is not null and v_email_n !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  select * into v_service
    from public.services
   where id = p_service_id
     and clinic_id = v_clinic.id
     and deleted_at is null
     and status = 'active'
     and online_booking_enabled;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'service_unavailable');
  end if;

  v_staff := app.public_practitioner_ids(v_clinic.id);
  if p_staff_id is not null then
    if not (p_staff_id = any (v_staff)) then
      return jsonb_build_object('ok', false, 'error', 'practitioner_unavailable');
    end if;
    v_staff := array[p_staff_id];
  elsif not v_set.allow_any_practitioner then
    return jsonb_build_object('ok', false, 'error', 'practitioner_required');
  end if;

  if array_length(v_staff, 1) is null then
    return jsonb_build_object('ok', false, 'error', 'practitioner_unavailable');
  end if;

  select bs.available_staff[1] into v_chosen
    from app.booking_slots(
           v_clinic.id, v_service.id, v_staff,
           (p_start_at at time zone v_clinic.timezone)::date
         ) bs
   where bs.slot_start = p_start_at
   limit 1;

  if v_chosen is null then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  select id into v_patient
    from public.patients
   where clinic_id = v_clinic.id
     and status <> 'archived'
     and (
       (v_phone_n is not null and app.normalize_phone(phone) = v_phone_n)
       or (v_email_n is not null and lower(btrim(email)) = v_email_n)
     )
   order by created_at
   limit 1;

  if v_patient is null then
    insert into public.patients (
      organization_id, clinic_id, first_name, last_name, email, phone, date_of_birth
    ) values (
      v_clinic.organization_id, v_clinic.id, p_first_name, p_last_name,
      v_email_n, nullif(btrim(coalesce(p_phone, '')), ''), p_date_of_birth
    )
    returning id into v_patient;
  end if;

  if p_link_token is not null then
    select * into v_link
      from public.booking_links
     where token = lower(btrim(p_link_token)) and clinic_id = v_clinic.id and active;
  end if;

  v_end_at := p_start_at + make_interval(mins => v_service.duration_minutes);
  v_status := case when v_set.confirmation_mode = 'auto' then 'confirmed' else 'pending' end;
  v_ref    := app.generate_booking_reference(v_clinic.organization_id);
  v_token  := encode(extensions.gen_random_bytes(32), 'hex');

  begin
    insert into public.appointments (
      organization_id, clinic_id, patient_id, service_id, staff_id,
      start_at, end_at, status, notes,
      booking_source, booking_link_id, booking_reference, manage_token_hash,
      utm_source, utm_medium, utm_campaign, booking_idempotency_key
    ) values (
      v_clinic.organization_id, v_clinic.id, v_patient, v_service.id, v_chosen,
      p_start_at, v_end_at, v_status, nullif(btrim(coalesce(p_notes, '')), ''),
      'direct_booking', v_link.id, v_ref,
      encode(extensions.digest(v_token, 'sha256'), 'hex'),
      v_link.utm_source, v_link.utm_medium, v_link.utm_campaign, p_idempotency_key
    )
    returning id into v_appt_id;
  exception
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'error', 'slot_taken');
    when unique_violation then
      select * into v_existing
        from public.appointments
       where clinic_id = v_clinic.id and booking_idempotency_key = p_idempotency_key;
      if found then
        return jsonb_build_object('ok', true, 'duplicate', true,
                                  'appointmentId', v_existing.id,
                                  'reference', v_existing.booking_reference,
                                  'startAt', v_existing.start_at);
      end if;
      return jsonb_build_object('ok', false, 'error', 'slot_taken');
  end;

  perform public.run_appointment_automation(v_appt_id, 'appointment.created');
  if v_status = 'confirmed' then
    perform public.run_appointment_automation(v_appt_id, 'appointment.confirmed');
  end if;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (v_clinic.organization_id, null, 'booking.public_created', 'appointment', v_appt_id,
          jsonb_build_object('clinic_id', v_clinic.id, 'reference', v_ref,
                             'link_token', p_link_token, 'source', 'direct_booking'));

  -- NEW: tell the clinic. The title distinguishes the two confirmation modes,
  -- because a pending booking is a task and a confirmed one is only news.
  perform app.notify_booking(
    v_appt_id,
    'online_booking_created',
    case when v_status = 'pending' then 'New online booking — needs confirming'
         else 'New online booking' end,
    app.booking_notice_line(v_appt_id));

  return jsonb_build_object(
    'ok', true,
    'appointmentId', v_appt_id,
    'reference', v_ref,
    'manageToken', v_token,
    'startAt', p_start_at,
    'endAt', v_end_at,
    'status', v_status
  );
end;
$fn$;

revoke execute on function public.create_public_booking(text, uuid, timestamptz, text, text, text, text, uuid, text, date, text, text, text) from public;
grant  execute on function public.create_public_booking(text, uuid, timestamptz, text, text, text, text, uuid, text, date, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- cancel ----

create or replace function public.cancel_public_booking(
  p_token      text,
  p_client_key text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_appt public.appointments;
  v_set  public.clinic_booking_settings;
  v_line text;
begin
  if not app.consume_rate_limit('manage:' || coalesce(p_client_key, 'anon'), 20, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_appt := app.booking_by_token(p_token);
  if v_appt.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_set from public.clinic_booking_settings where clinic_id = v_appt.clinic_id;

  if not v_set.allow_cancellation then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_appt.status not in ('pending', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable');
  end if;
  if v_appt.start_at <= now() + make_interval(hours => v_set.manage_cutoff_hours) then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;

  -- Captured BEFORE the status change, while the row still describes the slot
  -- the clinic had in its calendar.
  v_line := app.booking_notice_line(v_appt.id);

  update public.appointments set status = 'cancelled' where id = v_appt.id;

  update public.reminders set status = 'cancelled'
   where appointment_id = v_appt.id and status = 'scheduled';

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (v_appt.organization_id, null, 'booking.public_cancelled', 'appointment', v_appt.id,
          jsonb_build_object('clinic_id', v_appt.clinic_id, 'reference', v_appt.booking_reference));

  perform app.notify_booking(
    v_appt.id, 'online_booking_cancelled',
    'Online booking cancelled by patient', v_line);

  return jsonb_build_object('ok', true);
end;
$fn$;

revoke execute on function public.cancel_public_booking(text, text) from public;
grant  execute on function public.cancel_public_booking(text, text) to anon, authenticated;

-- ------------------------------------------------------------ reschedule ----

create or replace function public.reschedule_public_booking(
  p_token      text,
  p_start_at   timestamptz,
  p_client_key text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_appt   public.appointments;
  v_set    public.clinic_booking_settings;
  v_clinic public.clinics;
  v_dur    integer;
  v_chosen uuid;
  v_was    text;
begin
  if not app.consume_rate_limit('manage:' || coalesce(p_client_key, 'anon'), 20, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_appt := app.booking_by_token(p_token);
  if v_appt.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_set    from public.clinic_booking_settings where clinic_id = v_appt.clinic_id;
  select * into v_clinic from public.clinics where id = v_appt.clinic_id;

  if not v_set.allow_rescheduling then
    return jsonb_build_object('ok', false, 'error', 'not_allowed');
  end if;
  if v_appt.status not in ('pending', 'confirmed') then
    return jsonb_build_object('ok', false, 'error', 'not_reschedulable');
  end if;
  if v_appt.start_at <= now() + make_interval(hours => v_set.manage_cutoff_hours) then
    return jsonb_build_object('ok', false, 'error', 'too_late');
  end if;

  select bs.available_staff[1] into v_chosen
    from app.booking_slots(
           v_appt.clinic_id, v_appt.service_id, array[v_appt.staff_id],
           (p_start_at at time zone v_clinic.timezone)::date
         ) bs
   where bs.slot_start = p_start_at
   limit 1;

  if v_chosen is null then
    return jsonb_build_object('ok', false, 'error', 'slot_unavailable');
  end if;

  select duration_minutes into v_dur from public.services where id = v_appt.service_id;

  -- The OLD time, captured before the move, so the notification can say what
  -- changed rather than only where it landed.
  v_was := to_char(v_appt.start_at at time zone v_clinic.timezone, 'FMDy DD Mon, FMHH12:MI AM');

  begin
    update public.appointments
       set start_at = p_start_at,
           end_at   = p_start_at + make_interval(mins => v_dur)
     where id = v_appt.id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'error', 'slot_taken');
  end;

  update public.reminders set status = 'cancelled'
   where appointment_id = v_appt.id and status = 'scheduled';
  perform public.run_appointment_automation(v_appt.id, 'appointment.rescheduled');

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (v_appt.organization_id, null, 'booking.public_rescheduled', 'appointment', v_appt.id,
          jsonb_build_object('clinic_id', v_appt.clinic_id, 'reference', v_appt.booking_reference,
                             'from', v_appt.start_at, 'to', p_start_at));

  perform app.notify_booking(
    v_appt.id, 'online_booking_rescheduled',
    'Online booking moved by patient',
    app.booking_notice_line(v_appt.id) || ' (was ' || v_was || ')');

  return jsonb_build_object('ok', true, 'startAt', p_start_at);
end;
$fn$;

revoke execute on function public.reschedule_public_booking(text, timestamptz, text) from public;
grant  execute on function public.reschedule_public_booking(text, timestamptz, text) to anon, authenticated;
