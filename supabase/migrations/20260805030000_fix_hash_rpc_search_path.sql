-- =============================================================================
-- Fixes a likely real bug in 20260805010000_secure_pepper_hash_rpc.sql: on a
-- standard Supabase-hosted project, `pgcrypto` (and most other extensions)
-- get installed into the `extensions` schema, NOT `public` - even when the
-- CREATE EXTENSION statement doesn't say so explicitly, because that's where
-- Supabase's own bootstrapping already put it before this migration's
-- `create extension if not exists pgcrypto;` ever ran (which is then just a
-- no-op, since the extension already exists somewhere).
--
-- All three hashing functions declared `SET search_path` WITHOUT `extensions`
-- in it, so `digest(...)` inside _hash_client_identifier_internal() could not
-- be resolved at call time, failing with:
--   ERROR: function digest(text, unknown) does not exist (SQLSTATE 42883)
-- This is a well-known Supabase gotcha with SECURITY DEFINER functions - see
-- https://github.com/supabase/supabase/issues/462 and
-- https://github.com/supabase/cli/issues/4640 for other people hitting the
-- exact same thing.
--
-- This is a plain `create or replace function` for all three - same bodies,
-- just with `extensions` added to each SET search_path. Safe/idempotent to
-- re-run. Re-run the GRANT/REVOKE statements too just in case this is being
-- applied to a project where the original migration partially failed before
-- reaching them.
-- =============================================================================

create or replace function public._hash_client_identifier_internal(p_identifier text, p_agency_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_pepper text;
  v_normalized text;
begin
  if p_identifier is null or btrim(p_identifier) = '' or p_agency_id is null then
    return null;
  end if;

  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'client_identifier_pepper';
  if v_pepper is null then
    raise exception 'client_identifier_pepper is not configured in Vault';
  end if;

  v_normalized := regexp_replace(lower(btrim(p_identifier)), '\s+', ' ', 'g');

  return encode(digest(v_normalized || ':' || p_agency_id::text || ':' || v_pepper, 'sha256'), 'hex');
end;
$$;

revoke all on function public._hash_client_identifier_internal(text, uuid) from public;

create or replace function public.hash_client_identifier(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_agency_id uuid;
begin
  select agency_id into v_agency_id from public.profiles where id = auth.uid();
  if v_agency_id is null then
    raise exception 'No agency found for the current user';
  end if;

  return public._hash_client_identifier_internal(p_identifier, v_agency_id);
end;
$$;

create or replace function public.hash_client_identifiers(p_identifiers text[])
returns text[]
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_agency_id uuid;
  v_result text[];
begin
  select agency_id into v_agency_id from public.profiles where id = auth.uid();
  if v_agency_id is null then
    raise exception 'No agency found for the current user';
  end if;

  select array_agg(public._hash_client_identifier_internal(ident, v_agency_id) order by ord)
    into v_result
  from unnest(p_identifiers) with ordinality as t(ident, ord);

  return v_result;
end;
$$;

revoke all on function public.hash_client_identifier(text) from public;
revoke all on function public.hash_client_identifiers(text[]) from public;
grant execute on function public.hash_client_identifier(text) to authenticated;
grant execute on function public.hash_client_identifiers(text[]) to authenticated;
