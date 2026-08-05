-- =============================================================================
-- Hardening pass on the Blind Index (see 20260805000000_add_client_identifier_hash.sql):
-- moves hashing server-side so the browser never sees the salt/pepper.
-- -----------------------------------------------------------------------------
-- The original design salted with `agency_id`, which is NOT a secret (it shows
-- up in invite links, etc.) - so a client with DB access and an agency_id could
-- offline-brute-force the small "First L." search space. This migration:
--
--   1. Generates a random 256-bit "pepper" and stores it in Supabase Vault -
--      a value that never appears in this file, in application code, or in
--      the browser. Only a SECURITY DEFINER function running inside Postgres
--      can ever read it back out.
--   2. Moves the actual hash computation into that same trusted context via
--      two RPCs the app now calls instead of hashing locally:
--        - public.hash_client_identifier(text)        - single identifier
--        - public.hash_client_identifiers(text[])      - batch (CSV import)
--      Both derive the caller's agency_id server-side from their own JWT
--      (auth.uid() -> profiles.agency_id) rather than trusting a client-
--      supplied agency_id, so a compromised client can't even choose which
--      agency's salt to hash under.
--   3. Formula: SHA-256(normalized_identifier || ':' || agency_id || ':' || pepper).
--      Same normalization as before (trim/lowercase/collapse whitespace), so
--      previously-written hashes computed under the OLD (pepper-less) formula
--      will no longer match - harmless here because, per the 2026-08-05
--      decision to defer the customer_name backfill, nothing has been written
--      under the old formula yet. If this ever needs to run after real hashes
--      exist, those rows would need re-hashing.
-- =============================================================================

create extension if not exists pgcrypto;

-- Supabase Vault ships enabled on every project; this is a no-op guard in case
-- it isn't yet on this one. If it fails, enable "vault" under
-- Database > Extensions in the Supabase dashboard and re-run this file.
create extension if not exists supabase_vault cascade;

-- ---------------------------------------------------------------------------
-- STEP 1: Generate the pepper once, straight into Vault. The random value
-- itself is generated in-database and never appears in this file's text, so
-- it never lands in git history, logs, or anyone's terminal scrollback.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'client_identifier_pepper') then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'client_identifier_pepper',
      'HMAC pepper for blind-indexing client identifiers (utils/crypto.ts). Never exposed to any client - only readable inside hash_client_identifier[s]() below.'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- STEP 2: Internal helper - NOT exposed to authenticated/anon. Takes an
-- explicit agency_id so migration/seed scripts (running as postgres, with no
-- auth.uid() of their own) can call it directly; the public RPCs below derive
-- agency_id themselves and then delegate here.
-- ---------------------------------------------------------------------------
create or replace function public._hash_client_identifier_internal(p_identifier text, p_agency_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, vault, pg_temp
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

-- ---------------------------------------------------------------------------
-- STEP 3: Public RPCs. agency_id always comes from the CALLER's own profile
-- row, never from a client-supplied argument - see the file header.
-- ---------------------------------------------------------------------------
create or replace function public.hash_client_identifier(p_identifier text)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
set search_path = public, pg_temp
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
