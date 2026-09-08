-- ============================================================================
-- 0021 — Clinic branding storage (Phase 10)
--
-- One public bucket for clinic logos, with write access scoped by the same
-- app.permitted_clinics() helper every table policy uses.
--
-- Why a PUBLIC bucket rather than signed URLs: the logo's entire purpose is
-- to be rendered by anonymous visitors on a page whose URL is handed out on
-- Facebook, in an SMS and on a printed QR code. A signed URL would expire
-- mid-session, break social-card previews and page caching, and buy nothing
-- -- the asset is deliberately published. What must NOT be public is the
-- ability to WRITE, and that is what the policies below constrain.
--
-- Path shape: {organization_id}/{clinic_id}/{random}.{ext}
-- The organization segment is not a secret (a UUID reveals nothing and is
-- never enumerable), but it makes the tenancy of every object legible from
-- its key alone, which is what lets the policies below be simple enough to
-- verify by reading them.
--
-- SVG is deliberately NOT accepted. An SVG is an executable document -- it
-- can carry <script> and event handlers -- and this bucket's contents are
-- embedded on a public page. Accepting SVG safely needs a sanitizer this
-- project does not have; restricting to raster formats is the option the
-- brief's own section 3 offers ("restrict SVG uploads and use raster
-- formats") and is the one that does not depend on getting sanitization
-- right. Recorded in docs/modules/ONLINE_BOOKING.md.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinic-branding',
  'clinic-branding',
  true,
  5242880,                                        -- 5 MB, per the brief's section 3
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- app.storage_clinic_id — the clinic segment of an object key, or NULL.
--
-- Returns NULL rather than raising for a malformed key. A policy that raises
-- turns a denied upload into a 500 with a Postgres error string in it; a
-- policy that returns NULL denies quietly, which is the correct behaviour for
-- a security predicate.
-- ----------------------------------------------------------------------------

-- SECURITY DEFINER to keep supabase/tests/authorization_test.sql's "every
-- app.* function is definer with a pinned search_path" invariant absolute --
-- see the same note on app.normalize_phone (migration 0020). This one is
-- also genuinely definer-ish: storage.foldername lives in a schema the
-- authenticated role has no general rights on.
create or replace function app.storage_clinic_id(p_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = pg_catalog, pg_temp
as $fn$
declare
  v_parts text[];
begin
  v_parts := storage.foldername(p_name);
  if array_length(v_parts, 1) is null or array_length(v_parts, 1) < 2 then
    return null;
  end if;
  return v_parts[2]::uuid;
exception when others then
  return null;
end;
$fn$;

revoke execute on function app.storage_clinic_id(text) from public, anon;
grant  execute on function app.storage_clinic_id(text) to authenticated;

-- ----------------------------------------------------------------------------
-- Write policies.
--
-- Gated on clinic.update, not on a separate clinic.branding.manage: a logo is
-- a clinic detail, and the people who may rename a clinic are the people who
-- may set its logo. See migration 0019's permissions comment.
--
-- Reads need no policy -- the bucket is public, which is the point.
-- ----------------------------------------------------------------------------

create policy clinic_branding_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clinic-branding'
    and app.storage_clinic_id(name) = any (select unnest(app.permitted_clinics('clinic.update')))
  );

create policy clinic_branding_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'clinic-branding'
    and app.storage_clinic_id(name) = any (select unnest(app.permitted_clinics('clinic.update')))
  )
  with check (
    bucket_id = 'clinic-branding'
    and app.storage_clinic_id(name) = any (select unnest(app.permitted_clinics('clinic.update')))
  );

-- Replacing a logo uploads the new object under a fresh random name and then
-- deletes the old one, so DELETE is a normal part of the flow rather than an
-- administrative escape hatch.
create policy clinic_branding_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'clinic-branding'
    and app.storage_clinic_id(name) = any (select unnest(app.permitted_clinics('clinic.update')))
  );
