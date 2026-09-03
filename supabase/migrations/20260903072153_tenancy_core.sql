-- ============================================================================
-- 0001 — Tenancy core
--
-- Organizations, clinics, profiles and organization membership: the root of the
-- multi-tenant model. Roles and permissions land in 0002; RLS policies and the
-- app.* authorization helpers land in 0003.
--
-- RLS is ENABLED here but no policies are created yet. In PostgreSQL, RLS
-- enabled with zero policies denies all access to non-owner roles, so the
-- window between this migration and 0003 is closed rather than open.
--
-- See docs/DATABASE_SCHEMA.md, docs/AUTHORIZATION.md, and CLAUDE.md
-- ("Database conventions") for the rules this migration follows.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- Shared updated_at trigger
--
-- docs/DATABASE_SCHEMA.md rule 4 ("use timestamps consistently") is violated by
-- the spec's own tables, so every table here gets the same trigger instead.
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $fn$
begin
  new.updated_at := now();
  return new;
end;
$fn$;

comment on function public.set_updated_at() is
  'Maintains updated_at on every mutation. Attached to all tables with an updated_at column.';

-- ----------------------------------------------------------------------------
-- organizations — the tenant root
-- ----------------------------------------------------------------------------

create table public.organizations (
  id              uuid        primary key default gen_random_uuid(),
  name            text        not null check (length(btrim(name)) between 1 and 200),
  business_type   text        not null default 'other'
                              check (business_type in ('dental', 'medical', 'therapy',
                                                       'aesthetic', 'wellness', 'other')),
  logo_url        text,
  email           text,
  phone           text,
  -- IANA zone, e.g. 'Asia/Manila'. Clinics may override per branch.
  timezone        text        not null default 'UTC',
  -- ISO 4217. Defaults to PHP because every monetary example in the specs uses
  -- PHP (docs/AI_TOOLS.md 18, docs/UI_UX_SPEC.md); set explicitly at creation.
  currency        text        not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  status          text        not null default 'active'
                              check (status in ('active', 'suspended')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

comment on table public.organizations is
  'Tenant root. Every business record is scoped to an organization (docs/AUTHORIZATION.md section 6).';

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- clinics — branches within an organization
-- ----------------------------------------------------------------------------

create table public.clinics (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  name            text        not null check (length(btrim(name)) between 1 and 200),
  address         text,
  phone           text,
  email           text,
  timezone        text        not null default 'UTC',
  -- Shape: {"mon": [{"open": "09:00", "close": "17:00"}], ...}. Validated in the
  -- application (lib/validation) rather than by a CHECK, so the schedule format
  -- can evolve without a migration.
  operating_hours jsonb       not null default '{}'::jsonb,
  status          text        not null default 'active'
                              check (status in ('active', 'inactive')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,

  -- Target for the composite foreign keys that every clinic-scoped table will
  -- carry. This is what makes a cross-tenant clinic reference structurally
  -- impossible rather than merely policy-dependent. See CLAUDE.md.
  constraint clinics_id_org_uk unique (id, organization_id)
);

comment on constraint clinics_id_org_uk on public.clinics is
  'Composite FK target. Clinic-scoped tables reference (clinic_id, organization_id) so a row cannot point at a clinic in another tenant.';

create trigger clinics_set_updated_at
  before update on public.clinics
  for each row execute function public.set_updated_at();

create index clinics_org_ix on public.clinics (organization_id) include (id);

-- Clinic names are unique per organization among live rows only. Partial on
-- deleted_at so a soft-deleted clinic neither blocks reuse of its name nor
-- surfaces a constraint error for a row the user cannot see (CLAUDE.md).
create unique index clinics_org_name_uk
  on public.clinics (organization_id, lower(btrim(name)))
  where deleted_at is null;

-- ----------------------------------------------------------------------------
-- profiles — 1:1 with auth.users, deliberately ORGANIZATION-AGNOSTIC
--
-- Replaces the spec's `users` table, which carried a scalar organization_id.
-- docs/AUTHORIZATION.md sections 1 and 15 require that a user may belong to
-- more than one organization, so that relationship lives in
-- organization_memberships. Recorded in CLAUDE.md under "Deliberate deviations".
-- ----------------------------------------------------------------------------

create table public.profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  full_name  text,
  -- Mirrored from auth.users for display and staff lists, which must not require
  -- the admin API. auth.users stays the source of truth; kept in sync by
  -- handle_new_user() on insert and sync_profile_email() on email change.
  email      text,
  phone      text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Per-user profile, 1:1 with auth.users, scoped to no organization. Org relationships live in organization_memberships.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Provision a profile for every new auth user.
--
-- SECURITY DEFINER because the trigger runs in the context of an auth signup,
-- which holds no rights on public.profiles.
-- ----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $fn$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$fn$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.sync_profile_email();

-- ----------------------------------------------------------------------------
-- organization_memberships — explicit org membership with lifecycle status
--
-- docs/AUTHORIZATION.md section 15. `status` is load-bearing for security: the
-- authorization helpers in 0003 join on status = 'active', so suspending a
-- member revokes their access immediately and everywhere.
-- ----------------------------------------------------------------------------

create table public.organization_memberships (
  id              uuid        primary key default gen_random_uuid(),
  organization_id uuid        not null references public.organizations (id) on delete cascade,
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  status          text        not null default 'invited'
                              check (status in ('invited', 'active', 'suspended', 'removed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on column public.organization_memberships.status is
  'invited | active | suspended | removed. Only active grants access: the app.permitted_* helpers (0003) join on it, so a status change takes effect on the next statement with no token refresh.';

create trigger organization_memberships_set_updated_at
  before update on public.organization_memberships
  for each row execute function public.set_updated_at();

-- One membership row per (organization, user).
create unique index organization_memberships_org_user_uk
  on public.organization_memberships (organization_id, user_id);

-- Drives the authorization helpers' hot path: which orgs is this user active in?
create index organization_memberships_user_active_ix
  on public.organization_memberships (user_id, organization_id)
  where status = 'active';

-- ----------------------------------------------------------------------------
-- Row Level Security
--
-- Enabled with NO policies. PostgreSQL denies all access to non-owner roles when
-- RLS is on and no policy matches, so this migration is closed by default and
-- 0003 opens precisely what is intended.
--
-- FORCE ROW LEVEL SECURITY is deliberately NOT set: the app.* helpers in 0003
-- depend on table-owner RLS bypass to avoid infinite policy recursion
-- (42P17) when a policy on an authorization table consults those same tables.
-- ----------------------------------------------------------------------------

alter table public.organizations            enable row level security;
alter table public.clinics                  enable row level security;
alter table public.profiles                 enable row level security;
alter table public.organization_memberships enable row level security;

-- The anon role never has a legitimate reason to touch tenant data.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
