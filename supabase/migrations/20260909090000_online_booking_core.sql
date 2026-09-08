-- ============================================================================
-- 0019 — Online booking core (Phase 10)
--
-- Private, per-clinic patient-facing booking pages at /book/{slug}, plus the
-- clinic-side branding and booking configuration that drives them.
--
-- The governing principle for this phase is "one booking engine, many entry
-- points": nothing here duplicates clinics, patients, services or
-- appointments. The clinic record stays the single source of truth for name,
-- logo, address, contact details and operating hours; this migration adds the
-- *public booking configuration* around it and the attribution columns the
-- appointment row needs to record where a booking came from.
--
-- Deliberate scope decisions, recorded so they read as decisions:
--
--   - Branding (slug, logo_url) lives ON public.clinics, not in a separate
--     clinic_branding table. The Phase 10 brief's own section 5 lists both as
--     clinic fields and forbids duplicating clinic_name anywhere else; a
--     1:1 side table holding two columns would be a join with no upside and
--     a second place for "which name is authoritative?" to go wrong.
--
--   - Public booking *configuration* does get its own table
--     (clinic_booking_settings) because it is genuinely separable: it is
--     operational policy about a public page (notice period, booking window,
--     confirmation mode), not clinic identity, and it carries its own
--     permission (booking.manage) distinct from clinic.update.
--
--   - No booking_attributions table. source/medium/campaign are three text
--     columns on the appointment they describe -- a 1:1 side table for three
--     nullable strings is the "do not duplicate existing entities" rule in
--     the brief's section 47 read backwards.
--
--   - No booking_tokens table. The cancel/reschedule token is a SHA-256 hash
--     stored on the appointment it manages, with its expiry derived from the
--     appointment's own start time. A separate table would need its own
--     lifecycle, cleanup job, and tenancy columns to express a 1:1
--     relationship the appointment row already has.
--
--   - No practitioner<->service eligibility. Nothing in Phases 1-9 models it
--     (services has no practitioner-requirement column despite migration
--     0012's header mentioning the idea, and there is still no staff table),
--     so public practitioner visibility is clinic-scoped only. Inventing an
--     eligibility matrix here would be a new, unpopulated, unmaintained
--     concept -- see docs/modules/ONLINE_BOOKING.md.
--
--   - No deposit/payment settings. The PaymentProvider is not-configured
--     (lib/providers/payment/not-configured.ts) and no gateway exists, so a
--     "require deposit" toggle could not be honored. A money-handling
--     setting that silently does nothing is worse than its absence.
--     Recorded in CLAUDE.md; the booking RPCs leave the seam open.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Permissions
--
-- Two new keys, not the brief's suggested seven. Phase 7 set the precedent
-- (CLAUDE.md, "Phase 7's inventory permission set uses the coarse grain"):
-- splitting booking.settings.manage / booking.links.manage /
-- clinic.branding.manage apart would mean re-reviewing every role's grants
-- for distinctions no screen in this app makes. Branding reuses the existing
-- clinic.update -- a logo IS a clinic detail, and the same people who rename
-- a clinic are the people who set its logo.
-- ----------------------------------------------------------------------------

alter table public.role_permissions disable trigger role_permissions_no_system_writes;

insert into public.permissions (key, category, description) values
  ('booking.view',   'Online Booking', 'View the online booking dashboard, links and settings'),
  ('booking.manage', 'Online Booking', 'Enable online booking, configure it, and manage booking links');

-- owner holds every permission in the catalogue (migration 0002 seeded it as a
-- cross join, which cannot see rows added later).
insert into public.role_permissions (role_id, permission_key)
select r.id, p.key
  from public.roles r
 cross join (values ('booking.view'), ('booking.manage')) as p (key)
 where r.organization_id is null and r.key = 'owner';

insert into public.role_permissions (role_id, permission_key)
select r.id, x.permission_key
  from public.roles r
  join (values
    ('admin',          'booking.view'), ('admin',          'booking.manage'),
    ('clinic_manager', 'booking.view'), ('clinic_manager', 'booking.manage'),
    -- Front desk sees the booking link (to share it with a patient on the
    -- phone) but does not reconfigure the public page.
    ('receptionist',   'booking.view')
  ) as x (role_key, permission_key) on x.role_key = r.key
 where r.organization_id is null;

alter table public.role_permissions enable trigger role_permissions_no_system_writes;

-- ----------------------------------------------------------------------------
-- Clinic branding — on the clinic record itself.
-- ----------------------------------------------------------------------------

alter table public.clinics
  add column slug     text,
  add column logo_url text;

comment on column public.clinics.slug is
  'Public booking-page identifier: /book/{slug}. Globally unique (the public URL carries no organization component), lowercase kebab-case.';

comment on column public.clinics.logo_url is
  'Public URL of the clinic logo in the clinic-branding storage bucket. NULL renders the initials fallback -- the public page never shows a broken image.';

alter table public.clinics
  add constraint clinics_slug_format
  check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$');

-- Globally unique among live clinics. Partial on deleted_at so retiring a
-- clinic frees its slug rather than reserving it forever (same reasoning as
-- clinics_org_name_uk, migration 0001).
create unique index clinics_slug_uk on public.clinics (slug)
  where slug is not null and deleted_at is null;

-- The public booking page's entry point: slug -> clinic, on every request.
create index clinics_slug_lookup_ix on public.clinics (slug) where slug is not null;

-- Column-level grants: migration 0003 revoked table-level UPDATE and
-- re-granted specific columns, so a new column is NOT writable until named
-- here. Both are gated by clinic.update in the RLS policy.
grant update (slug, logo_url) on public.clinics to authenticated;

-- ----------------------------------------------------------------------------
-- Public service visibility (brief section 13)
--
-- Opt-IN, defaulting to false: an existing clinic that enables online booking
-- must not discover it has silently published its whole internal service
-- catalogue, including services it never intended a patient to see.
-- ----------------------------------------------------------------------------

alter table public.services
  add column online_booking_enabled boolean not null default false,
  add column public_name             text
    check (public_name is null or length(btrim(public_name)) between 1 and 200),
  add column public_description      text
    check (public_description is null or length(public_description) <= 1000);

comment on column public.services.public_name is
  'Patient-facing name, when the internal one is not suitable ("Comp Exam D0150" -> "New Patient Exam"). NULL falls back to services.name.';

grant update (online_booking_enabled, public_name, public_description)
  on public.services to authenticated;

-- ----------------------------------------------------------------------------
-- clinic_booking_settings — one row per clinic, created on demand.
-- ----------------------------------------------------------------------------

create table public.clinic_booking_settings (
  id                       uuid        primary key default gen_random_uuid(),
  organization_id          uuid        not null references public.organizations (id) on delete cascade,
  clinic_id                uuid        not null,

  -- The master switch. False (the default) means /book/{slug} returns the
  -- "booking unavailable" state even when a slug exists.
  online_booking_enabled   boolean     not null default false,

  -- How far ahead of "now" the earliest bookable slot must be, so a patient
  -- cannot book a slot ten minutes from now that nobody will see in time.
  min_notice_hours         integer     not null default 4
                                       check (min_notice_hours between 0 and 720),
  -- How far into the future the calendar opens.
  max_advance_days         integer     not null default 60
                                       check (max_advance_days between 1 and 365),
  -- Slot granularity. 15 minutes suits every clinic type in the spec set;
  -- a 90-minute service still starts on a 15-minute boundary.
  slot_interval_minutes    integer     not null default 15
                                       check (slot_interval_minutes in (5, 10, 15, 20, 30, 60)),

  -- 'auto'   -> appointment lands as 'confirmed', the patient is done.
  -- 'manual' -> appointment lands as 'pending' for the clinic to confirm.
  confirmation_mode        text        not null default 'manual'
                                       check (confirmation_mode in ('auto', 'manual')),

  allow_any_practitioner   boolean     not null default true,
  allow_cancellation       boolean     not null default true,
  allow_rescheduling       boolean     not null default true,
  -- How close to the appointment a patient may still self-serve. Beyond this
  -- they are told to call the clinic.
  manage_cutoff_hours      integer     not null default 24
                                       check (manage_cutoff_hours between 0 and 720),

  -- Which clinic contact details the public page may show. Everything is
  -- opt-in: brief section 32 ("only display information explicitly
  -- configured as public").
  show_address             boolean     not null default true,
  show_phone               boolean     not null default true,
  show_email               boolean     not null default false,
  show_business_hours      boolean     not null default true,

  -- Optional branding/message extensions (brief section 6). Kept to the two
  -- that need no theme builder to be useful.
  primary_color            text        check (primary_color is null or primary_color ~ '^#[0-9a-f]{6}$'),
  welcome_message          text        check (welcome_message is null or length(welcome_message) <= 500),

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint clinic_booking_settings_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint clinic_booking_settings_clinic_uk unique (clinic_id)
);

comment on table public.clinic_booking_settings is
  'Per-clinic public booking policy. Deliberately holds no clinic identity (name/logo/address live on public.clinics) -- see this migration''s header.';

create trigger clinic_booking_settings_set_updated_at
  before update on public.clinic_booking_settings
  for each row execute function public.set_updated_at();

create index clinic_booking_settings_org_ix on public.clinic_booking_settings (organization_id);

-- ----------------------------------------------------------------------------
-- clinic_booking_practitioners — who is publicly bookable, and how they are
-- presented to a patient.
--
-- There is still no staff table (migrations 0011/0013 both record why), so a
-- practitioner is an active organization member. This table answers the one
-- question the existing model cannot: "may a member of the public book this
-- person, at this clinic, and under what name?"
-- ----------------------------------------------------------------------------

create table public.clinic_booking_practitioners (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations (id) on delete cascade,
  clinic_id        uuid        not null,
  user_id          uuid        not null references public.profiles (id) on delete cascade,
  -- Patient-facing name/title. NULL falls back to profiles.full_name; the
  -- public RPCs never expose a practitioner's email.
  display_name     text        check (display_name is null or length(btrim(display_name)) between 1 and 120),
  title            text        check (title is null or length(btrim(title)) between 1 and 120),
  bio              text        check (bio is null or length(bio) <= 1000),
  active           boolean     not null default true,
  sort_order       integer     not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint clinic_booking_practitioners_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint clinic_booking_practitioners_uk unique (clinic_id, user_id)
);

comment on table public.clinic_booking_practitioners is
  'Opt-in list of publicly bookable practitioners per clinic. Absence of a row means "not bookable online", never "bookable by default".';

create trigger clinic_booking_practitioners_set_updated_at
  before update on public.clinic_booking_practitioners
  for each row execute function public.set_updated_at();

create index clinic_booking_practitioners_org_ix on public.clinic_booking_practitioners (organization_id);
create index clinic_booking_practitioners_clinic_active_ix
  on public.clinic_booking_practitioners (clinic_id) where active;

-- ----------------------------------------------------------------------------
-- booking_links — named, attributable entry points into one clinic's page.
--
-- The clinic's slug is always bookable on its own (/book/{slug}); a booking
-- link adds a tracked variant (/book/{slug}?k={token}) that can pre-select a
-- service or practitioner and carries UTM attribution. The token is a public
-- identifier, not a secret -- it grants nothing the bare slug does not.
-- ----------------------------------------------------------------------------

create table public.booking_links (
  id                     uuid        primary key default gen_random_uuid(),
  organization_id        uuid        not null references public.organizations (id) on delete cascade,
  clinic_id              uuid        not null,
  name                   text        not null check (length(btrim(name)) between 1 and 120),
  -- URL-safe, unguessable-enough to avoid enumeration, but see the comment
  -- above: this is an identifier, not an authorization token.
  token                  text        not null unique
                                     check (token ~ '^[a-z0-9]{10,32}$'),
  default_service_id     uuid,
  default_practitioner_id uuid       references public.profiles (id) on delete set null,
  utm_source             text        check (utm_source is null or length(utm_source) <= 100),
  utm_medium             text        check (utm_medium is null or length(utm_medium) <= 100),
  utm_campaign           text        check (utm_campaign is null or length(utm_campaign) <= 150),
  active                 boolean     not null default true,
  created_by             uuid        references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint booking_links_clinic_fk foreign key (clinic_id, organization_id)
    references public.clinics (id, organization_id),
  constraint booking_links_service_fk foreign key (default_service_id, organization_id)
    references public.services (id, organization_id)
);

comment on table public.booking_links is
  'Tracked entry points to one clinic''s booking page. Every link belongs to exactly one clinic (brief section 22).';

create trigger booking_links_set_updated_at
  before update on public.booking_links
  for each row execute function public.set_updated_at();

create index booking_links_org_ix on public.booking_links (organization_id);
create index booking_links_clinic_ix on public.booking_links (clinic_id);

-- ----------------------------------------------------------------------------
-- appointments — booking provenance and the patient-facing manage token.
--
-- 'admin' is the default so every pre-existing row is correctly classified as
-- staff-created without a backfill. 'marketplace' is in the CHECK from day one
-- so the future marketplace becomes another entry point rather than a schema
-- change (brief section 45).
-- ----------------------------------------------------------------------------

alter table public.appointments
  add column booking_source     text not null default 'admin'
                                check (booking_source in ('admin', 'direct_booking', 'marketplace')),
  add column booking_link_id    uuid references public.booking_links (id) on delete set null,
  -- Human-quotable reference shown on the confirmation page ("CF-7K2M9Q").
  add column booking_reference  text check (booking_reference is null or booking_reference ~ '^CF-[0-9A-Z]{6}$'),
  -- SHA-256 hex of the patient's manage token. The plaintext is returned to
  -- the browser exactly once, at booking time, and never stored.
  add column manage_token_hash  text check (manage_token_hash is null or manage_token_hash ~ '^[0-9a-f]{64}$'),
  add column utm_source         text check (utm_source is null or length(utm_source) <= 100),
  add column utm_medium         text check (utm_medium is null or length(utm_medium) <= 100),
  add column utm_campaign       text check (utm_campaign is null or length(utm_campaign) <= 150),
  -- Deduplicates a double-submitted booking form (brief section 16's
  -- "idempotency"). Client-generated, per booking attempt.
  add column booking_idempotency_key text check (booking_idempotency_key is null or length(booking_idempotency_key) between 8 and 100);

comment on column public.appointments.booking_source is
  'Where this appointment came from: admin (staff-created), direct_booking (the clinic''s own public page), marketplace (reserved -- not implemented in Phase 10).';

comment on column public.appointments.manage_token_hash is
  'SHA-256 of the patient''s self-service token. Never reversible; the lookup hashes the presented token and compares. NULL for staff-created appointments, which have no public management surface.';

create unique index appointments_booking_reference_uk
  on public.appointments (organization_id, booking_reference)
  where booking_reference is not null;

create unique index appointments_manage_token_uk
  on public.appointments (manage_token_hash)
  where manage_token_hash is not null;

create unique index appointments_booking_idempotency_uk
  on public.appointments (clinic_id, booking_idempotency_key)
  where booking_idempotency_key is not null;

-- Phase 8 reporting reads bookings by source over a date range.
create index appointments_source_start_ix
  on public.appointments (organization_id, booking_source, start_at)
  where booking_source <> 'admin';

-- Deliberately NOT added to the authenticated UPDATE grant list: every one of
-- these columns is written only by the SECURITY DEFINER booking RPCs
-- (migration 0020). A staff member can cancel or reschedule a public booking
-- through the normal appointment actions, which touch status/start_at/end_at
-- only -- they can never rewrite its provenance or reissue its token.

-- ----------------------------------------------------------------------------
-- booking_rate_limits — abuse protection for the anonymous endpoints.
--
-- A fixed-window counter in Postgres rather than an external store: this app
-- has no Redis and runs on serverless functions with no shared memory, so the
-- database is the only place a counter can actually be shared between two
-- concurrent requests. Deliberately NOT tenant-scoped -- it throttles a
-- client, and a client attacking two clinics is still one client.
-- ----------------------------------------------------------------------------

create table public.booking_rate_limits (
  bucket_key   text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (bucket_key, window_start)
);

comment on table public.booking_rate_limits is
  'Fixed-window rate-limit counters for the anonymous booking RPCs. Written only by app.consume_rate_limit(); no client has any privilege on it.';

alter table public.booking_rate_limits enable row level security;
revoke all on public.booking_rate_limits from authenticated, anon;

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- Same template as every other clinic-scoped table (CLAUDE.md): the clinic id
-- must appear in the array app.permitted_clinics() returns for the relevant
-- permission. The public booking page does NOT read these tables as anon --
-- it goes exclusively through the SECURITY DEFINER RPCs in migration 0020,
-- which is why anon needs (and has) no policy here at all.
-- ----------------------------------------------------------------------------

alter table public.clinic_booking_settings       enable row level security;
alter table public.clinic_booking_practitioners  enable row level security;
alter table public.booking_links                 enable row level security;

create policy clinic_booking_settings_select on public.clinic_booking_settings
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('booking.view'))) );

create policy clinic_booking_settings_insert on public.clinic_booking_settings
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('booking.manage'))) );

create policy clinic_booking_settings_update on public.clinic_booking_settings
  for update to authenticated
  using      ( clinic_id = any (select unnest(app.permitted_clinics('booking.manage'))) )
  with check ( clinic_id = any (select unnest(app.permitted_clinics('booking.manage'))) );

create policy clinic_booking_practitioners_select on public.clinic_booking_practitioners
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('booking.view'))) );

create policy clinic_booking_practitioners_insert on public.clinic_booking_practitioners
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('booking.manage'))) );

create policy clinic_booking_practitioners_update on public.clinic_booking_practitioners
  for update to authenticated
  using      ( clinic_id = any (select unnest(app.permitted_clinics('booking.manage'))) )
  with check ( clinic_id = any (select unnest(app.permitted_clinics('booking.manage'))) );

create policy clinic_booking_practitioners_delete on public.clinic_booking_practitioners
  for delete to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('booking.manage'))) );

create policy booking_links_select on public.booking_links
  for select to authenticated
  using ( clinic_id = any (select unnest(app.permitted_clinics('booking.view'))) );

create policy booking_links_insert on public.booking_links
  for insert to authenticated
  with check ( clinic_id = any (select unnest(app.permitted_clinics('booking.manage'))) );

create policy booking_links_update on public.booking_links
  for update to authenticated
  using      ( clinic_id = any (select unnest(app.permitted_clinics('booking.manage'))) )
  with check ( clinic_id = any (select unnest(app.permitted_clinics('booking.manage'))) );

-- No DELETE policy on booking_links: a link is deactivated (active = false),
-- never removed, so the appointments attributed to it keep a resolvable
-- source (docs/AUTHORIZATION.md section 12's preference, applied to
-- attribution data rather than financial data).

-- Column-level write grants. organization_id/clinic_id are immutable, which
-- RLS cannot express (CLAUDE.md, "Database conventions").
revoke update on public.clinic_booking_settings from authenticated;
grant update (
  online_booking_enabled, min_notice_hours, max_advance_days, slot_interval_minutes,
  confirmation_mode, allow_any_practitioner, allow_cancellation, allow_rescheduling,
  manage_cutoff_hours, show_address, show_phone, show_email, show_business_hours,
  primary_color, welcome_message
) on public.clinic_booking_settings to authenticated;

revoke update on public.clinic_booking_practitioners from authenticated;
grant update (display_name, title, bio, active, sort_order)
  on public.clinic_booking_practitioners to authenticated;

revoke update on public.booking_links from authenticated;
grant update (name, default_service_id, default_practitioner_id,
              utm_source, utm_medium, utm_campaign, active)
  on public.booking_links to authenticated;

-- The anon role has no business touching any tenant table directly; migration
-- 0001 revoked the schema-wide default, and these tables inherit that. Stated
-- explicitly because it is the load-bearing half of this phase's security
-- model: everything anonymous goes through migration 0020's RPCs.
revoke all on public.clinic_booking_settings      from anon;
revoke all on public.clinic_booking_practitioners from anon;
revoke all on public.booking_links                from anon;
