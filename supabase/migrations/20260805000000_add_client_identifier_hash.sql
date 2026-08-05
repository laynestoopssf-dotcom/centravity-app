-- =============================================================================
-- Blind Index for client identifiers (OBA compliance) - PHASE 1 of 2.
-- -----------------------------------------------------------------------------
-- Centravity must never store a raw, human-readable client/customer name in
-- Supabase. Going forward, every "Identifier" a producer types is hashed
-- client-side (SHA-256, salted with agency_id - see utils/crypto.ts) BEFORE
-- it's ever sent in a request body, and only the hash is written here.
--
-- This is PHASE 1 ONLY: it just adds the new column. It deliberately does
-- NOT touch `policies.customer_name` yet - that column still holds real
-- plaintext historical names from before this change, and per an explicit
-- decision on 2026-08-05, those are being left in place until the agency
-- has had a chance to export/back them up (see
-- scripts/export_customer_names_before_hashing.sql). Once that's done, run
-- scripts/PHASE2_hash_and_drop_customer_name.sql to backfill hashes for the
-- old rows and permanently drop the plaintext column - that step is
-- irreversible (there is no decrypt path for a hash), so it is intentionally
-- NOT bundled into this migration.
--
-- All application code has already stopped reading/writing `customer_name`
-- as of this same change - it's just inert plaintext sitting in the table
-- until Phase 2 runs.
--
-- Run this migration against the linked project (`supabase db push`) or
-- paste it into the Supabase SQL Editor once. It's idempotent - re-running
-- it is a no-op if the column already exists.
--
-- ADDENDUM (2026-08-05, later same day): the "salted with agency_id" scheme
-- described above was flagged as weak (agency_id isn't secret) and replaced
-- by 20260805010000_secure_pepper_hash_rpc.sql, which moves the actual
-- hashing into a Postgres RPC keyed with a random pepper in Supabase Vault.
-- The column/index added here are unaffected - only how the hash going into
-- it is computed changed. The `comment on column` below reflects the current
-- (post-hardening) scheme.
-- =============================================================================

alter table public.policies
  add column if not exists client_identifier_hash text;

comment on column public.policies.client_identifier_hash is
  'One-way SHA-256 hash of the client identifier the producer typed, computed server-side by public.hash_client_identifier() (normalized + salted with agency_id + a secret Vault pepper - see 20260805010000_secure_pepper_hash_rpc.sql and utils/crypto.ts hashIdentifier()). NULL when no identifier was entered (it is optional) or for legacy rows written before this column existed. There is no decrypt path by design - this column exists purely as an exact-match search key, never for display. See scripts/PHASE2_hash_and_drop_customer_name.sql for the still-pending, deliberately-not-yet-run step that backfills this for historical rows and drops the old customer_name column.';

-- Exact-match lookups (the only kind a blind index supports) are the whole
-- point of this column, so index it now rather than waiting for Phase 2.
create index if not exists idx_policies_client_identifier_hash on public.policies(agency_id, client_identifier_hash) where client_identifier_hash is not null;
