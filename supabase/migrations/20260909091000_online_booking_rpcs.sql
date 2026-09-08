-- ============================================================================
-- 0020 — Online booking service layer (Phase 10)
--
-- The public booking page's ONLY access path. Migration 0001 revoked every
-- table privilege from `anon` and 0019 kept it that way, so an anonymous
-- visitor cannot read one row of one table directly; they can call exactly
-- the functions granted below, each of which returns the minimum data a
-- booking needs and nothing else (brief section 35).
--
-- Why SECURITY DEFINER RPCs rather than anon-facing RLS policies:
--
--   1. RLS answers "which rows may this caller see?". The public booking page
--      needs the opposite shape -- "given a slug, project a curated view of
--      one clinic" -- which is a function, not a predicate. Expressing it as
--      policies would mean granting anon SELECT on clinics, services,
--      profiles and appointments and then trying to claw it back, where a
--      single policy mistake is a cross-tenant leak.
--   2. PostgREST gives one transaction per HTTP request (CLAUDE.md,
--      "Architecture rules"). Creating a booking resolves a patient, inserts
--      an appointment and fires automation -- it MUST be one RPC.
--
-- Every function here derives the organization and clinic from the slug or
-- from the appointment row, never from an argument (CLAUDE.md rule 4). No
-- function accepts an organization_id or clinic_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- app.consume_rate_limit — fixed-window counter, one row per (key, window).
--
-- Returns false when the caller is over budget. SECURITY DEFINER because no
-- client role holds any privilege on booking_rate_limits.
--
-- The INSERT ... ON CONFLICT DO UPDATE is atomic under concurrency: two
-- simultaneous requests serialize on the row lock, so the counter cannot be
-- lost the way a read-then-write would lose it.
-- ----------------------------------------------------------------------------

create or replace function app.consume_rate_limit(
  p_bucket_key text,
  p_limit      integer,
  p_window     interval
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_window_start timestamptz;
  v_hits         integer;
begin
  if p_bucket_key is null or btrim(p_bucket_key) = '' then
    -- No usable client identity (no forwarded IP). Fail OPEN rather than
    -- locking every anonymous visitor out of every clinic's booking page --
    -- the double-booking constraint and the idempotency key remain the real
    -- guarantees, and this is a throttle, not an authorization check.
    return true;
  end if;

  -- Truncate to the window so the key is stable for its duration.
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / extract(epoch from p_window))
    * extract(epoch from p_window)
  );

  insert into public.booking_rate_limits (bucket_key, window_start, hits)
  values (p_bucket_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set hits = public.booking_rate_limits.hits + 1
  returning hits into v_hits;

  -- Opportunistic cleanup: ~1 call in 100 sweeps windows older than a day, so
  -- the table stays small without a cron job for something this trivial.
  if random() < 0.01 then
    delete from public.booking_rate_limits where window_start < clock_timestamp() - interval '1 day';
  end if;

  return v_hits <= p_limit;
end;
$fn$;

revoke execute on function app.consume_rate_limit(text, integer, interval) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- public.run_appointment_automation — the single appointment automation
-- engine, moved from TypeScript into SQL.
--
-- Phase 4 implemented this in lib/automation/dispatch.ts, which works only
-- for a signed-in caller holding INSERT rights on reminders/follow_ups. A
-- public booking has no caller at all, so Phase 10 needed the same rules to
-- run for an anonymous booking -- and the brief (section 26) is explicit:
-- "Reuse Phase 4 notification infrastructure. Do not create a separate
-- notification system."
--
-- Rather than write a second copy of the rule loop for the public path, the
-- rule loop moved here and lib/automation/dispatch.ts now calls this. One
-- engine, two entry points -- the same principle Phase 10 applies to booking
-- itself. Semantics are ported exactly, including the "a 24h reminder for an
-- appointment that is already sooner than 24h away is skipped, not fired
-- late" rule and the ON CONFLICT idempotency.
-- ----------------------------------------------------------------------------

create or replace function public.run_appointment_automation(
  p_appointment_id uuid,
  p_trigger        text
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_appt   record;
  v_rule   record;
  v_actor  uuid := (select auth.uid());
  v_when   timestamptz;
begin
  select a.id, a.organization_id, a.clinic_id, a.patient_id, a.start_at
    into v_appt
    from public.appointments a
   where a.id = p_appointment_id;

  if not found then
    return;
  end if;

  -- When there IS a caller, they must be an active member of the
  -- appointment's organization. When there is not (the anonymous booking
  -- path, which reaches this function only from inside
  -- create_public_booking), there is nothing to authorize -- the caller
  -- already proved which clinic it was acting on by resolving a live slug.
  if v_actor is not null and not exists (
    select 1 from public.organization_memberships
     where organization_id = v_appt.organization_id
       and user_id = v_actor
       and status = 'active'
  ) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  for v_rule in
    select r.id, r.action_type, r.config
      from public.automation_rules r
     where r.organization_id = v_appt.organization_id
       and r.trigger_type = p_trigger
       and r.enabled
  loop
    if v_rule.action_type = 'reminder' then
      v_when := case
        when (v_rule.config ->> 'hours_before') is not null
          then v_appt.start_at - make_interval(hours => (v_rule.config ->> 'hours_before')::integer)
        else now()
      end;

      -- A time-based reminder whose moment has already passed is skipped
      -- rather than sent immediately and mislabeled: there is no meaningful
      -- "24 hours before" left to give.
      continue when (v_rule.config ->> 'hours_before') is not null and v_when <= now();

      insert into public.reminders (
        organization_id, clinic_id, patient_id, appointment_id,
        automation_rule_id, reminder_type, channel, scheduled_for
      ) values (
        v_appt.organization_id, v_appt.clinic_id, v_appt.patient_id, v_appt.id,
        v_rule.id, v_rule.config ->> 'reminder_type', 'email', v_when
      )
      on conflict (appointment_id, reminder_type) where status <> 'cancelled'
      do nothing;

    elsif v_rule.action_type = 'followup' then
      insert into public.follow_ups (
        organization_id, clinic_id, patient_id, appointment_id,
        automation_rule_id, type, due_at, priority
      ) values (
        v_appt.organization_id, v_appt.clinic_id, v_appt.patient_id, v_appt.id,
        v_rule.id, v_rule.config ->> 'followup_type',
        now() + make_interval(hours => coalesce((v_rule.config ->> 'due_in_hours')::integer, 24)),
        coalesce(v_rule.config ->> 'priority', 'normal')
      )
      on conflict (appointment_id, type) where appointment_id is not null and status <> 'cancelled'
      do nothing;
    end if;
  end loop;
end;
$fn$;

comment on function public.run_appointment_automation(uuid, text) is
  'The one appointment automation engine (Phase 4 rules, Phase 10 refactor). Called by lib/automation/dispatch.ts for staff actions and internally by create_public_booking for anonymous bookings.';

revoke execute on function public.run_appointment_automation(uuid, text) from public, anon;
grant  execute on function public.run_appointment_automation(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- app.bookable_clinic — slug -> clinic, or NULL.
--
-- The single choke point every public function goes through. A clinic is
-- publicly bookable only when it is live, active, has a slug, and has
-- explicitly switched online booking on. Four conditions in one place, so a
-- new public endpoint cannot accidentally implement three of them.
-- ----------------------------------------------------------------------------

create or replace function app.bookable_clinic(p_slug text)
returns public.clinics
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select c.*
    from public.clinics c
    join public.clinic_booking_settings s on s.clinic_id = c.id
   where c.slug = lower(btrim(p_slug))
     and c.deleted_at is null
     and c.status = 'active'
     and s.online_booking_enabled
$fn$;

revoke execute on function app.bookable_clinic(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- app.booking_slots — the availability engine.
--
-- Phases 1-9 never built one: appointments are booked at an arbitrary
-- instant and the EXCLUDE constraint (migration 0013) is the only arbiter.
-- That is fine for a receptionist who can see the calendar and is unfine for
-- a patient who cannot, so Phase 10 adds slot generation. It is built ON the
-- existing primitives rather than beside them -- clinics.operating_hours for
-- the day's windows, services.duration_minutes for the length, the same
-- appointments rows and the same status exclusions the EXCLUDE constraint
-- uses -- and the constraint remains the final arbiter at write time, so a
-- slot this function offers can still lose a race and be refused. That is
-- the correct division: this makes concurrent conflicts rare, the constraint
-- makes them impossible.
--
-- The existing-appointment check is deliberately NOT filtered by clinic or
-- organization, exactly matching appointments_no_staff_overlap: a
-- practitioner is one person and cannot be in two places at once, even
-- across clinics. Cross-tenant rows are read but never returned -- the
-- output is a list of times, not appointment data.
-- ----------------------------------------------------------------------------

create or replace function app.booking_slots(
  p_clinic_id  uuid,
  p_service_id uuid,
  p_staff_ids  uuid[],
  p_date       date
)
returns table (slot_start timestamptz, available_staff uuid[])
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  with cfg as (
    select c.timezone,
           coalesce(c.operating_hours, '{}'::jsonb) as operating_hours,
           s.slot_interval_minutes,
           s.min_notice_hours,
           s.max_advance_days
      from public.clinics c
      join public.clinic_booking_settings s on s.clinic_id = c.id
     where c.id = p_clinic_id
  ),
  svc as (
    select duration_minutes
      from public.services
     where id = p_service_id and clinic_id = p_clinic_id
       and deleted_at is null and status = 'active' and online_booking_enabled
  ),
  -- clinics.operating_hours is keyed by lowercase three-letter weekday
  -- ('mon'..'sun') -- the shape migration 0001 documented and the booking
  -- settings editor writes.
  windows as (
    select (w ->> 'open')::time  as open_t,
           (w ->> 'close')::time as close_t,
           cfg.timezone, cfg.slot_interval_minutes, cfg.min_notice_hours, cfg.max_advance_days
      from cfg
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(cfg.operating_hours -> lower(to_char(p_date, 'dy'))) = 'array'
             then cfg.operating_hours -> lower(to_char(p_date, 'dy'))
             else '[]'::jsonb end
      ) as w
     where (w ->> 'open') ~ '^[0-9]{1,2}:[0-9]{2}$'
       and (w ->> 'close') ~ '^[0-9]{1,2}:[0-9]{2}$'
       and (w ->> 'close')::time > (w ->> 'open')::time
  ),
  raw_slots as (
    select distinct gs as slot_start, w.min_notice_hours, w.max_advance_days
      from windows w
      cross join svc
      cross join lateral generate_series(
        ((p_date + w.open_t)  at time zone w.timezone),
        ((p_date + w.close_t) at time zone w.timezone) - make_interval(mins => svc.duration_minutes),
        make_interval(mins => w.slot_interval_minutes)
      ) as gs
  ),
  bounded as (
    select rs.slot_start
      from raw_slots rs
     where rs.slot_start >= now() + make_interval(hours => rs.min_notice_hours)
       and rs.slot_start <= now() + make_interval(days  => rs.max_advance_days)
  )
  select b.slot_start,
         array_agg(cand.staff_id order by cand.staff_id) as available_staff
    from bounded b
    cross join svc
    cross join lateral unnest(p_staff_ids) as cand(staff_id)
   where not exists (
     select 1
       from public.appointments a
      where a.staff_id = cand.staff_id
        and a.status not in ('cancelled', 'no_show', 'rescheduled')
        and a.time_range && tstzrange(
              b.slot_start,
              b.slot_start + make_interval(mins => svc.duration_minutes),
              '[)')
   )
   group by b.slot_start
   order by b.slot_start
$fn$;

revoke execute on function app.booking_slots(uuid, uuid, uuid[], date) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- app.public_practitioner_ids — the opt-in, active practitioner set for a
-- clinic, further narrowed to still-active organization members.
--
-- A practitioner who is suspended or removed from the organization stops
-- being publicly bookable immediately, with no separate deactivation step --
-- the same "membership status is load-bearing" rule the authorization
-- helpers apply (migration 0003).
-- ----------------------------------------------------------------------------

create or replace function app.public_practitioner_ids(p_clinic_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select coalesce(array_agg(bp.user_id order by bp.sort_order, bp.user_id), '{}'::uuid[])
    from public.clinic_booking_practitioners bp
    join public.organization_memberships m
      on m.organization_id = bp.organization_id
     and m.user_id = bp.user_id
     and m.status = 'active'
   where bp.clinic_id = p_clinic_id
     and bp.active
$fn$;

revoke execute on function app.public_practitioner_ids(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- public.get_public_booking_page — everything the page needs, in one call.
--
-- Branding, the publishable subset of contact details, booking policy, the
-- bookable service list and the bookable practitioner list. Folded into a
-- single RPC because none of it varies independently and the page needs all
-- of it to render (brief section 38: minimize API calls).
--
-- Contact fields are omitted entirely -- not nulled -- when their show_*
-- flag is off, so a curious visitor cannot distinguish "not configured" from
-- "configured but private" (brief section 32).
-- ----------------------------------------------------------------------------

create or replace function public.get_public_booking_page(
  p_slug       text,
  p_link_token text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_clinic public.clinics;
  v_set    public.clinic_booking_settings;
  v_link   public.booking_links;
  v_result jsonb;
begin
  v_clinic := app.bookable_clinic(p_slug);
  if v_clinic.id is null then
    return null;   -- "not found" and "booking disabled" are one state to the public.
  end if;

  select * into v_set from public.clinic_booking_settings where clinic_id = v_clinic.id;

  if p_link_token is not null then
    select * into v_link
      from public.booking_links
     where token = lower(btrim(p_link_token))
       and clinic_id = v_clinic.id      -- a link from another clinic is simply ignored
       and active;
  end if;

  v_result := jsonb_build_object(
    'clinic', jsonb_strip_nulls(jsonb_build_object(
      'name',     v_clinic.name,
      'slug',     v_clinic.slug,
      'logoUrl',  v_clinic.logo_url,
      'timezone', v_clinic.timezone,
      'address',  case when v_set.show_address then v_clinic.address end,
      'phone',    case when v_set.show_phone   then v_clinic.phone   end,
      'email',    case when v_set.show_email   then v_clinic.email   end,
      'businessHours', case when v_set.show_business_hours then v_clinic.operating_hours end
    )),
    'settings', jsonb_build_object(
      'allowAnyPractitioner', v_set.allow_any_practitioner,
      'allowCancellation',    v_set.allow_cancellation,
      'allowRescheduling',    v_set.allow_rescheduling,
      'minNoticeHours',       v_set.min_notice_hours,
      'maxAdvanceDays',       v_set.max_advance_days,
      'confirmationMode',     v_set.confirmation_mode,
      'primaryColor',         v_set.primary_color,
      'welcomeMessage',       v_set.welcome_message
    ),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',              s.id,
               'name',            coalesce(nullif(btrim(s.public_name), ''), s.name),
               'description',     coalesce(s.public_description, s.description),
               'durationMinutes', s.duration_minutes,
               'price',           s.price::text
             ) order by coalesce(nullif(btrim(s.public_name), ''), s.name))
        from public.services s
       where s.clinic_id = v_clinic.id
         and s.deleted_at is null
         and s.status = 'active'
         and s.online_booking_enabled
    ), '[]'::jsonb),
    'practitioners', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',    bp.user_id,
               -- Never the profile email: a practitioner without a full_name
               -- falls back to a neutral label, not to their address.
               'name',  coalesce(nullif(btrim(bp.display_name), ''),
                                 nullif(btrim(pr.full_name), ''),
                                 'Practitioner'),
               'title', bp.title,
               'bio',   bp.bio
             ) order by bp.sort_order, bp.user_id)
        from public.clinic_booking_practitioners bp
        join public.profiles pr on pr.id = bp.user_id
       where bp.user_id = any (app.public_practitioner_ids(v_clinic.id))
         and bp.clinic_id = v_clinic.id
    ), '[]'::jsonb),
    'link', case when v_link.id is null then null else jsonb_strip_nulls(jsonb_build_object(
      'name',                v_link.name,
      'defaultServiceId',    v_link.default_service_id,
      'defaultPractitionerId', v_link.default_practitioner_id
    )) end
  );

  return v_result;
end;
$fn$;

revoke execute on function public.get_public_booking_page(text, text) from public;
grant  execute on function public.get_public_booking_page(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- public.get_public_booking_availability — bookable start times for one
-- service across a date range.
--
-- Rate-limited: availability is the cheapest endpoint to hammer and the most
-- expensive to serve.
-- ----------------------------------------------------------------------------

create or replace function public.get_public_booking_availability(
  p_slug       text,
  p_service_id uuid,
  p_staff_id   uuid  default null,
  p_from       date  default null,
  p_days       integer default 14,
  p_client_key text  default null
)
returns jsonb
language plpgsql
-- VOLATILE, not STABLE, even though this reads availability and returns no
-- changed data: it increments a rate-limit counter, which is a write.
-- PostgREST honours the volatility marker by running a STABLE function inside
-- a READ ONLY transaction, so declaring this STABLE makes every call fail with
-- 25006 ("cannot execute INSERT in a read-only transaction") the moment it is
-- reached over HTTP rather than from psql. The marker has to describe what the
-- function does, not how it feels to the caller.
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_clinic public.clinics;
  v_set    public.clinic_booking_settings;
  v_staff  uuid[];
  v_from   date;
  v_days   integer;
begin
  v_clinic := app.bookable_clinic(p_slug);
  if v_clinic.id is null then
    return jsonb_build_object('error', 'unavailable');
  end if;

  if not app.consume_rate_limit('avail:' || coalesce(p_client_key, 'anon'), 120, interval '1 minute') then
    return jsonb_build_object('error', 'rate_limited');
  end if;

  select * into v_set from public.clinic_booking_settings where clinic_id = v_clinic.id;

  v_staff := app.public_practitioner_ids(v_clinic.id);

  if p_staff_id is not null then
    -- A practitioner id the clinic has not published is not an error worth
    -- distinguishing -- it collapses to "no availability", which is also
    -- what an enumeration attempt sees.
    v_staff := array(select unnest(v_staff) intersect select p_staff_id);
  elsif not v_set.allow_any_practitioner then
    return jsonb_build_object('error', 'practitioner_required');
  end if;

  if array_length(v_staff, 1) is null then
    return jsonb_build_object('days', '[]'::jsonb);
  end if;

  v_from := greatest(coalesce(p_from, (now() at time zone v_clinic.timezone)::date),
                     (now() at time zone v_clinic.timezone)::date);
  v_days := least(greatest(coalesce(p_days, 14), 1), 31);

  return jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(day_payload order by d)
        from generate_series(v_from, v_from + (v_days - 1), interval '1 day') as g(d)
        cross join lateral (
          select jsonb_build_object(
                   'date', g.d::date,
                   'slots', coalesce((
                     select jsonb_agg(jsonb_build_object(
                              'startAt', bs.slot_start,
                              'staffIds', to_jsonb(bs.available_staff)
                            ) order by bs.slot_start)
                       from app.booking_slots(v_clinic.id, p_service_id, v_staff, g.d::date) bs
                   ), '[]'::jsonb)
                 ) as day_payload
        ) as p
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke execute on function public.get_public_booking_availability(text, uuid, uuid, date, integer, text) from public;
grant  execute on function public.get_public_booking_availability(text, uuid, uuid, date, integer, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- app.generate_booking_reference — CF-XXXXXX, unique within an organization.
--
-- Crockford-style alphabet with I/L/O/U/0/1 removed so a reference read over
-- the phone survives the trip. Loops on collision rather than trusting a
-- single draw; the unique index is the real guarantee.
-- ----------------------------------------------------------------------------

create or replace function app.generate_booking_reference(p_organization_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_ref text;
  v_i   integer;
begin
  for v_attempt in 1..20 loop
    v_ref := 'CF-';
    for v_i in 1..6 loop
      v_ref := v_ref || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    if not exists (
      select 1 from public.appointments
       where organization_id = p_organization_id and booking_reference = v_ref
    ) then
      return v_ref;
    end if;
  end loop;
  raise exception 'could not allocate a booking reference';
end;
$fn$;

revoke execute on function app.generate_booking_reference(uuid) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- app.normalize_phone — digits only, for patient matching.
--
-- Deliberately not a full E.164 parser: matching '0917 555 1234' against
-- '09175551234' is the real-world case, and normalizing both to digits
-- handles it without a library or a country-code assumption.
-- ----------------------------------------------------------------------------

-- SECURITY DEFINER despite being a pure text function: supabase/tests/
-- authorization_test.sql asserts that EVERY app.* function is definer with a
-- pinned search_path, because the one that isn't is the one that silently
-- breaks the RLS-bypass-by-ownership mechanism the helpers depend on. Keeping
-- the invariant absolute is worth more than an exemption for a function that
-- touches no table.
create or replace function app.normalize_phone(p_phone text)
returns text
language sql
immutable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '')
$fn$;

revoke execute on function app.normalize_phone(text) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- public.create_public_booking — the whole booking, in one transaction.
--
-- Order matters and is the security model:
--   slug -> clinic (never a client-supplied clinic id)
--   rate limit -> idempotency replay -> service validation ->
--   practitioner validation -> AVAILABILITY RECHECK -> patient resolution ->
--   appointment insert (EXCLUDE constraint is the final arbiter) ->
--   automation -> audit.
--
-- The availability recheck is not defensive duplication: the browser's slot
-- list is a snapshot that can be minutes old, and a client that skips the UI
-- entirely never had one. Nothing the client sends about WHEN a service runs,
-- how long it takes, or who may perform it is trusted -- only the start
-- instant is taken as input, and it must match a slot this server generates.
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
  -- ---- clinic ------------------------------------------------------------
  v_clinic := app.bookable_clinic(p_slug);
  if v_clinic.id is null then
    return jsonb_build_object('ok', false, 'error', 'unavailable');
  end if;

  select * into v_set from public.clinic_booking_settings where clinic_id = v_clinic.id;

  -- ---- abuse protection --------------------------------------------------
  -- Tighter than availability: a booking writes rows and sends messages.
  if not app.consume_rate_limit('book:' || coalesce(p_client_key, 'anon'), 5, interval '10 minutes') then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  -- ---- idempotency -------------------------------------------------------
  -- A resubmitted form (double-click, retried request, browser back) returns
  -- the SAME booking rather than a second appointment. The manage token is
  -- deliberately not re-issued here: it exists only in the original response.
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

  -- ---- input -------------------------------------------------------------
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

  -- ---- service (must be this clinic's, and published) --------------------
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

  -- ---- practitioner ------------------------------------------------------
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

  -- ---- availability recheck (server-side, authoritative) -----------------
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

  -- ---- patient resolution (scoped to THIS clinic, never global) ----------
  -- Brief section 18: "Never search globally across all CareFlow
  -- organizations. A patient belonging to Clinic A must never accidentally be
  -- matched to Clinic B." The clinic_id predicate is what enforces that, and
  -- it is not optional -- phone numbers are shared between family members and
  -- reused between people over time, so a wider match would merge strangers.
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

  -- ---- attribution -------------------------------------------------------
  if p_link_token is not null then
    select * into v_link
      from public.booking_links
     where token = lower(btrim(p_link_token)) and clinic_id = v_clinic.id and active;
  end if;

  -- ---- appointment -------------------------------------------------------
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
    -- The EXCLUDE constraint is the final arbiter (migration 0013). Losing
    -- this race is a normal outcome of two patients wanting the same slot,
    -- not an error to leak upward.
    when exclusion_violation then
      return jsonb_build_object('ok', false, 'error', 'slot_taken');
    -- A concurrent duplicate submission with the same idempotency key.
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

  -- ---- Phase 4 automation (confirmation + 24h/2h reminders) --------------
  perform public.run_appointment_automation(v_appt_id, 'appointment.created');
  if v_status = 'confirmed' then
    perform public.run_appointment_automation(v_appt_id, 'appointment.confirmed');
  end if;

  -- ---- audit -------------------------------------------------------------
  -- user_id is NULL: there is no CareFlow user, and inventing one would make
  -- the log lie about who acted. audit_logs has no client INSERT path
  -- (migration 0004), so this definer function is the only way in.
  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (v_clinic.organization_id, null, 'booking.public_created', 'appointment', v_appt_id,
          jsonb_build_object('clinic_id', v_clinic.id, 'reference', v_ref,
                             'link_token', p_link_token, 'source', 'direct_booking'));

  return jsonb_build_object(
    'ok', true,
    'appointmentId', v_appt_id,
    'reference', v_ref,
    -- Returned exactly once. Only its SHA-256 is stored.
    'manageToken', v_token,
    'startAt', p_start_at,
    'endAt', v_end_at,
    'status', v_status
  );
end;
$fn$;

revoke execute on function public.create_public_booking(text, uuid, timestamptz, text, text, text, text, uuid, text, date, text, text, text) from public;
grant  execute on function public.create_public_booking(text, uuid, timestamptz, text, text, text, text, uuid, text, date, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Patient self-service: view / cancel / reschedule by manage token.
--
-- The token is the credential, so it is compared as a hash and never
-- returned. There is no /appointment/{id} public surface anywhere (brief
-- section 27): the id alone opens nothing.
-- ----------------------------------------------------------------------------

create or replace function app.booking_by_token(p_token text)
returns public.appointments
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
  select a.*
    from public.appointments a
   where a.manage_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     and a.booking_source <> 'admin'
$fn$;

revoke execute on function app.booking_by_token(text) from public, anon, authenticated;

create or replace function public.get_public_booking(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_appt   public.appointments;
  v_clinic public.clinics;
  v_set    public.clinic_booking_settings;
begin
  v_appt := app.booking_by_token(p_token);
  if v_appt.id is null then
    return null;
  end if;

  select * into v_clinic from public.clinics where id = v_appt.clinic_id;
  select * into v_set from public.clinic_booking_settings where clinic_id = v_appt.clinic_id;

  return jsonb_build_object(
    'reference', v_appt.booking_reference,
    'status',    v_appt.status,
    'startAt',   v_appt.start_at,
    'endAt',     v_appt.end_at,
    'clinic', jsonb_strip_nulls(jsonb_build_object(
      'name',     v_clinic.name,
      'slug',     v_clinic.slug,
      'logoUrl',  v_clinic.logo_url,
      'timezone', v_clinic.timezone,
      'address',  case when v_set.show_address then v_clinic.address end,
      'phone',    case when v_set.show_phone   then v_clinic.phone   end,
      'email',    case when v_set.show_email   then v_clinic.email   end
    )),
    'service', (select jsonb_build_object(
                  'id', s.id,
                  'name', coalesce(nullif(btrim(s.public_name), ''), s.name),
                  'durationMinutes', s.duration_minutes)
                from public.services s where s.id = v_appt.service_id),
    'practitioner', (select coalesce(nullif(btrim(bp.display_name), ''),
                                     nullif(btrim(pr.full_name), ''), 'Practitioner')
                       from public.profiles pr
                       left join public.clinic_booking_practitioners bp
                         on bp.user_id = pr.id and bp.clinic_id = v_appt.clinic_id
                      where pr.id = v_appt.staff_id),
    -- What the patient may still do, computed here rather than trusted from
    -- the browser: the clinic's toggles AND the cutoff AND the appointment
    -- still being live.
    'canCancel',     v_set.allow_cancellation
                       and v_appt.status in ('pending', 'confirmed')
                       and v_appt.start_at > now() + make_interval(hours => v_set.manage_cutoff_hours),
    'canReschedule', v_set.allow_rescheduling
                       and v_appt.status in ('pending', 'confirmed')
                       and v_appt.start_at > now() + make_interval(hours => v_set.manage_cutoff_hours)
  );
end;
$fn$;

revoke execute on function public.get_public_booking(text) from public;
grant  execute on function public.get_public_booking(text) to anon, authenticated;

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

  update public.appointments set status = 'cancelled' where id = v_appt.id;

  -- Same rule as the staff cancellation path (app/(app)/appointments/
  -- actions.ts): nothing further should be sent for a cancelled
  -- appointment, but already-sent reminders stay as history.
  update public.reminders set status = 'cancelled'
   where appointment_id = v_appt.id and status = 'scheduled';

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, metadata)
  values (v_appt.organization_id, null, 'booking.public_cancelled', 'appointment', v_appt.id,
          jsonb_build_object('clinic_id', v_appt.clinic_id, 'reference', v_appt.booking_reference));

  return jsonb_build_object('ok', true);
end;
$fn$;

revoke execute on function public.cancel_public_booking(text, text) from public;
grant  execute on function public.cancel_public_booking(text, text) to anon, authenticated;

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

  -- The new slot is validated exactly as a new booking would be, against the
  -- SAME practitioner -- a reschedule moves an appointment, it does not
  -- reassign it to whoever happens to be free.
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

  return jsonb_build_object('ok', true, 'startAt', p_start_at);
end;
$fn$;

revoke execute on function public.reschedule_public_booking(text, timestamptz, text) from public;
grant  execute on function public.reschedule_public_booking(text, timestamptz, text) to anon, authenticated;
