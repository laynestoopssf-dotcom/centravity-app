-- =============================================================================
-- Agency-shared symmetric key for client-side AES-GCM identifier encryption.
-- -----------------------------------------------------------------------------
-- Problem this solves: the blind hash/trigram system (20260805000000,
-- 20260827030000) never stores anything that can be turned back into
-- plaintext - which is the strongest privacy guarantee available, but it
-- also means NO ONE, not even the Owner who's fully authorized to see a
-- teammate's customer, can ever see the real name again from a browser that
-- never personally typed it. IdentifierChip.tsx falls back to a "Secure
-- Customer (cross-team)" placeholder for exactly that reason.
--
-- This migration adds real, reversible encryption ON TOP of (not instead of)
-- that existing hash/trigram system, so authorized cross-team viewers can see
-- the real identifier while search keeps working exactly as it does today:
--   - client_identifier_hash / client_identifier_trigrams (unchanged) still
--     drive search - see components/DashboardTab.tsx's matchesIdentifierSearch.
--   - client_identifier_ciphertext / client_identifier_iv (new, below) exist
--     purely so an authorized browser can DECRYPT AND DISPLAY the real
--     identifier - see utils/e2ee.ts.
--
-- IMPORTANT - read before assuming this is "zero-knowledge": the AES-256 key
-- below lives in this same database, gated by Row Level Security. RLS is
-- enforced BY Postgres itself, which means Postgres (and anything holding
-- this project's service_role key, which parts of this app's own server
-- actions already use) can always read it and decrypt every identifier in
-- the agency. That is a materially WEAKER guarantee than the hash/trigram
-- columns above, which have no decrypt path at all, from anyone, ever - a
-- full database compromise recovers zero identifiers from those columns but
-- ALL of them from these new ones. This is "encryption at rest with
-- app-managed, RLS-gated access" (a legitimate, common compliance pattern),
-- not literal zero-knowledge end-to-end encryption (which would require each
-- authorized user's copy of the key to itself be wrapped by something only
-- that human knows, e.g. their login password, so the server never holds a
-- usable key at all). This trade-off was discussed explicitly and this
-- simpler design was the one chosen - see chat history.
--
-- Retroactivity: exactly like the trigram column, this can only ever be
-- populated going forward. Every row logged before this migration has no
-- ciphertext to decrypt (client_identifier_ciphertext is NULL) and keeps
-- showing the placeholder in IdentifierChip.tsx forever - there is no
-- plaintext left anywhere to retroactively encrypt.
-- =============================================================================

create table if not exists public.agency_encryption_keys (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  encryption_key text not null,
  created_at timestamptz not null default now()
);

comment on table public.agency_encryption_keys is
  'One shared AES-256 key per agency (base64-encoded raw key bytes), used client-side via the Web Crypto API to encrypt/decrypt public.policies.client_identifier_ciphertext. See utils/e2ee.ts. RLS-gated, not a substitute for the zero-knowledge blind hash/trigram columns - see the migration header comment for the explicit trade-off.';
comment on column public.agency_encryption_keys.encryption_key is
  'Base64-encoded 256-bit AES-GCM key, generated once via gen_random_bytes(32). Never rotated automatically - rotating would make every existing client_identifier_ciphertext row undecryptable, since there is no plaintext left anywhere to re-encrypt with a new key.';

alter table public.agency_encryption_keys enable row level security;

-- Read access: any authenticated member of the agency (owner, manager, producer, service -
-- deliberately NOT role-restricted, since a producer must be able to decrypt their own logged
-- identifiers too, and an owner/manager needs the same key to decrypt a teammate's). Restricted
-- to members of THIS agency only, so a different agency's key is never exposed.
drop policy if exists "agency_members_read_own_key" on public.agency_encryption_keys;
create policy "agency_members_read_own_key"
on public.agency_encryption_keys
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.agency_id = agency_encryption_keys.agency_id
  )
);

-- No insert/update/delete policy is defined for any client-facing role - the only way a row
-- gets written is through _ensure_agency_encryption_key() below (SECURITY DEFINER) or a
-- service_role connection, both of which bypass RLS entirely. `authenticated`/`anon` therefore
-- have no direct write path to this table even though RLS is enabled.

-- Idempotent provisioning helper - generates a fresh random key for an agency only if one
-- doesn't already exist. SECURITY DEFINER so it can insert despite the table having no
-- client-facing write policy above.
create or replace function public._ensure_agency_encryption_key(p_agency_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_agency_id is null then
    return;
  end if;

  insert into public.agency_encryption_keys (agency_id, encryption_key)
  values (p_agency_id, encode(gen_random_bytes(32), 'base64'))
  on conflict (agency_id) do nothing;
end;
$$;

revoke all on function public._ensure_agency_encryption_key(uuid) from public;

-- Public RPC a client can call defensively before its first encrypt/decrypt of a session, in
-- case this agency somehow doesn't have a key row yet (new agency created by a code path that
-- predates the trigger below, a partially-applied backfill, etc.) - cheap no-op once the row
-- exists. Derives the caller's own agency_id server-side rather than trusting a client-supplied
-- id, same pattern as hash_client_identifier_full() etc.
create or replace function public.ensure_my_agency_encryption_key()
returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_agency_id uuid;
begin
  select agency_id into v_agency_id from public.profiles where id = auth.uid();
  perform public._ensure_agency_encryption_key(v_agency_id);
end;
$$;

revoke all on function public.ensure_my_agency_encryption_key() from public;
grant execute on function public.ensure_my_agency_encryption_key() to authenticated;

-- Auto-provision a key for every NEW agency going forward, so normal signup/onboarding never
-- has to know or care that this table exists.
create or replace function public._agency_encryption_key_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  perform public._ensure_agency_encryption_key(new.id);
  return new;
end;
$$;

drop trigger if exists trg_agency_encryption_key on public.agencies;
create trigger trg_agency_encryption_key
after insert on public.agencies
for each row execute function public._agency_encryption_key_trigger();

-- Backfill: every agency that already existed before this migration also needs a key.
insert into public.agency_encryption_keys (agency_id, encryption_key)
select id, encode(gen_random_bytes(32), 'base64')
from public.agencies
on conflict (agency_id) do nothing;

-- Ciphertext storage on policies - AES-GCM needs both the encrypted payload and its unique
-- (never-reused) 12-byte nonce to decrypt, so both are stored per row. NULL/NULL for every row
-- logged before this migration, and for any row whose identifier was left blank.
alter table public.policies
  add column if not exists client_identifier_ciphertext text,
  add column if not exists client_identifier_iv text;

comment on column public.policies.client_identifier_ciphertext is
  'Base64 AES-256-GCM ciphertext of the client identifier, encrypted client-side with this agency''s shared key (see agency_encryption_keys, utils/e2ee.ts). Decryptable by any authenticated member of the same agency - NOT zero-knowledge (see agency_encryption_keys comment). NULL for rows logged before this column existed, or with no identifier entered; those fall back to a placeholder in IdentifierChip.tsx. This is purely a DISPLAY convenience layered on top of - never a replacement for - client_identifier_hash/client_identifier_trigrams, which remain what search actually queries.';
comment on column public.policies.client_identifier_iv is
  'Base64 12-byte AES-GCM nonce paired 1:1 with client_identifier_ciphertext. A fresh random nonce is generated for every encryption - never reuse one across rows, even for the same plaintext, or AES-GCM''s confidentiality guarantee breaks.';
