-- =============================================================================
-- Blind trigram (n-gram) index for real partial/"contains" Identifier search.
-- -----------------------------------------------------------------------------
-- Problem this solves: `client_identifier_hash` (20260805000000) is a single
-- SHA-256 hash of the WHOLE normalized identifier - it can only ever answer
-- "is this EXACTLY the string I typed?", never "does this CONTAIN what I
-- typed?". That's fine for a producer re-finding their own recently-logged
-- household (this browser already cached the plaintext locally at insert
-- time - see utils/identifierCache.ts), but it means an Owner/Manager
-- searching for a TEAMMATE's customer they never personally typed has to
-- guess the exact original string, character-for-character, or the search
-- (and the reveal/eye icon it unlocks - see components/ui/IdentifierChip.tsx,
-- which only ever renders once something is cached) looks broken. It isn't a
-- permissions bug - see 20260827000000_owner_manager_team_select_policy.sql's
-- comment and the live cross-account verification that preceded this file -
-- it's this exact-match-only design.
--
-- Fix: also blind-index every identifier as a SET of overlapping 3-character
-- "trigrams", each hashed individually (same SHA-256 + per-agency Vault
-- pepper as the existing exact hash - see 20260805010000). A search term's
-- own trigrams are hashed the same way and matched against that set with
-- Postgres's array containment operator (`@>`), so "ohn D" correctly matches
-- a row whose real identifier is "John D." without ever knowing that.
--
-- Trade-off (spelled out for whoever reads this next): trigram indexing is a
-- WEAKER blind index than a single whole-string hash - hashing every 3-char
-- window necessarily reveals more structure (e.g. two different rows sharing
-- many identical trigram hashes are very likely to share substrings), and a
-- large-enough corpus of guessed trigrams could in principle let someone
-- reconstruct likely candidates faster than brute-forcing the whole string.
-- It is still one-way (no stored plaintext, no decrypt path, same pepper/
-- agency salting as the exact hash) and still requires DB access to see even
-- the hashes. This was a deliberate, explicit trade-off (see chat history) in
-- exchange for Owner/Manager actually being able to find a teammate's
-- customer by partial text - NOT a silent regression of the 20260805010000
-- hardening pass.
--
-- Retroactivity: this can ONLY populate `client_identifier_trigrams` going
-- forward, for identifiers hashed via the new hash_client_identifier[s]_full()
-- RPCs below. There is no decrypt path from the existing `client_identifier_
-- hash` column back to plaintext (by design), so rows logged before this
-- migration - or never re-saved through it - simply have no trigrams to
-- match against and fall back to exact-match-only, forever. Not fixable
-- without a plaintext source, which this app deliberately never stores.
-- =============================================================================

alter table public.policies
  add column if not exists client_identifier_trigrams text[];

comment on column public.policies.client_identifier_trigrams is
  'Blind-indexed set of hashed 3-character "trigrams" of the normalized client identifier (see hash_client_identifier_full()/hash_client_identifiers_full() below), padded with a single boundary space on each side. Enables partial/"contains" search via `@>` against a search term''s own (unpadded) trigrams from hash_search_identifier() - see components/DashboardTab.tsx. NULL for rows logged before this column existed, or never re-saved since; those remain exact-match-only via client_identifier_hash. Never contains plaintext - see the hardening note on client_identifier_hash for why.';

-- GIN is the standard index type for containment queries (`@>`, `&&`) against
-- array columns - without it, `@>` still works, just as a full scan.
create index if not exists idx_policies_client_identifier_trigrams
  on public.policies using gin (client_identifier_trigrams);

-- Pure, no-pepper helper: normalize + optionally boundary-pad + split into every
-- overlapping 3-character window. Split out from the hashing functions below so it's
-- independently testable and never needs `security definer` itself (no secret touched).
-- Padding with a plain space (not some exotic sentinel) deliberately mirrors pg_trgm's own
-- convention - the accepted trade-off is that a genuine space in the middle of an identifier
-- could theoretically produce a trigram indistinguishable from a boundary one, which can only
-- ever make an unrelated row's trigram set look a little more similar than it really is, never
-- less - i.e. the failure mode is a rarer false positive, never a false negative, which is the
-- safe direction for a search feature.
create or replace function public._identifier_trigrams(p_normalized text, p_pad boolean)
returns text[]
language sql
immutable
as $$
  select case
    when p_normalized is null or p_normalized = '' then null
    else (
      select array_agg(distinct substr(padded, i, 3))
      from (select case when p_pad then ' ' || p_normalized || ' ' else p_normalized end as padded) s,
           generate_series(1, length(s.padded) - 2) as i
      where length(s.padded) >= 3
    )
  end
$$;

-- Mirrors _hash_client_identifier_internal (20260805030000) exactly for normalization/salting -
-- same lower+btrim+collapse-whitespace, same `trigram:agency_id:pepper` sha256 scheme - just
-- applied per-trigram instead of to the whole string. `p_pad = true` for identifiers actually
-- being STORED (captures boundary trigrams too); `p_pad = false` for an incoming SEARCH TERM,
-- so a mid-string query like "ohn d" isn't artificially boundary-anchored and still matches
-- against the padded trigram set of the row it's a real substring of.
create or replace function public._hash_client_identifier_trigrams_internal(p_identifier text, p_agency_id uuid, p_pad boolean)
returns text[]
language plpgsql
stable
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_pepper text;
  v_normalized text;
  v_trigrams text[];
  v_result text[];
begin
  if p_identifier is null or btrim(p_identifier) = '' or p_agency_id is null then
    return null;
  end if;

  select decrypted_secret into v_pepper from vault.decrypted_secrets where name = 'client_identifier_pepper';
  if v_pepper is null then
    raise exception 'client_identifier_pepper is not configured in Vault';
  end if;

  v_normalized := regexp_replace(lower(btrim(p_identifier)), '\s+', ' ', 'g');
  v_trigrams := public._identifier_trigrams(v_normalized, p_pad);
  if v_trigrams is null then
    return null;
  end if;

  select array_agg(distinct encode(digest(t || ':' || p_agency_id::text || ':' || v_pepper, 'sha256'), 'hex'))
    into v_result
  from unnest(v_trigrams) as t;

  return v_result;
end;
$$;

revoke all on function public._identifier_trigrams(text, boolean) from public;
revoke all on function public._hash_client_identifier_trigrams_internal(text, uuid, boolean) from public;

-- WRITE-time RPC: one round trip that returns BOTH the existing exact hash and the new padded
-- trigram hashes for a single identifier, so every "log/edit an identifier" call site only needs
-- to change from `hashIdentifier()` to `hashIdentifierFull()` (see utils/crypto.ts) and start
-- writing client_identifier_trigrams alongside client_identifier_hash, instead of doubling every
-- write path's network round trips.
create or replace function public.hash_client_identifier_full(p_identifier text)
returns jsonb
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

  return jsonb_build_object(
    'hash', public._hash_client_identifier_internal(p_identifier, v_agency_id),
    'trigrams', to_jsonb(public._hash_client_identifier_trigrams_internal(p_identifier, v_agency_id, true))
  );
end;
$$;

-- Batch WRITE-time variant (CSV/"Historical Logger" import - see app/dashboard/page.tsx). Returns
-- a jsonb ARRAY (not a native 2D text[][], which requires every row to have the same number of
-- trigrams - these don't) of {hash, trigrams} objects, same order as the input.
create or replace function public.hash_client_identifiers_full(p_identifiers text[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_agency_id uuid;
  v_result jsonb;
begin
  select agency_id into v_agency_id from public.profiles where id = auth.uid();
  if v_agency_id is null then
    raise exception 'No agency found for the current user';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'hash', public._hash_client_identifier_internal(ident, v_agency_id),
      'trigrams', to_jsonb(public._hash_client_identifier_trigrams_internal(ident, v_agency_id, true))
    ) order by ord
  )
  into v_result
  from unnest(p_identifiers) with ordinality as t(ident, ord);

  return v_result;
end;
$$;

-- SEARCH-time RPC: hashes an incoming search term BOTH ways at once - the same whole-string
-- exact hash (still useful: a full, exact term is the strongest, most private signal) AND its
-- own (unpadded) trigrams for the `@>` partial-match query against client_identifier_trigrams.
-- Returns {hash, trigrams: null} for a term under 3 normalized characters - too short to form
-- even one trigram, so the caller falls back to exact-match-only for it (same UX pg_trgm's own
-- `%` operator has for very short queries).
create or replace function public.hash_search_identifier(p_term text)
returns jsonb
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

  return jsonb_build_object(
    'hash', public._hash_client_identifier_internal(p_term, v_agency_id),
    'trigrams', to_jsonb(public._hash_client_identifier_trigrams_internal(p_term, v_agency_id, false))
  );
end;
$$;

revoke all on function public.hash_client_identifier_full(text) from public;
revoke all on function public.hash_client_identifiers_full(text[]) from public;
revoke all on function public.hash_search_identifier(text) from public;
grant execute on function public.hash_client_identifier_full(text) to authenticated;
grant execute on function public.hash_client_identifiers_full(text[]) to authenticated;
grant execute on function public.hash_search_identifier(text) to authenticated;
