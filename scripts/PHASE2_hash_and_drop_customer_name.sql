-- =============================================================================
-- Blind Index for client identifiers (OBA compliance) - PHASE 2 of 2.
-- -----------------------------------------------------------------------------
-- ⚠️  DO NOT RUN THIS UNTIL YOU HAVE EXPORTED/BACKED UP EXISTING CUSTOMER
--     NAMES - see scripts/export_customer_names_before_hashing.sql. ⚠️
--
-- Requires 20260805010000_secure_pepper_hash_rpc.sql to have already run (this
-- script calls the same private, pepper-keyed hashing helper it defines, so
-- historical rows land on the exact same hash a live search/write would
-- produce today - just invoked directly in SQL instead of via the RPC, since
-- a migration/seed script has no auth.uid() of its own to derive agency_id from).
--
-- This script:
--   1. Hashes every remaining plaintext `customer_name` into
--      `client_identifier_hash` via public._hash_client_identifier_internal()
--      (SHA-256 of the normalized identifier + agency_id + the secret Vault
--      pepper - see that migration for why this replaced a plain agency_id salt).
--   2. PERMANENTLY DROPS the `customer_name` column.
--
-- Step 2 is irreversible. A SHA-256 hash cannot be decrypted back into a
-- name - once this runs, nobody (support, an admin, you) will ever be able
-- to see these historical customer names again, in this app or by querying
-- the database directly. This is the whole point of a blind index, but it
-- means there is no "undo" once this script has run, other than restoring
-- from the CSV export you took in Step 0 or a database backup/PITR.
--
-- The guard block below intentionally makes this script fail loudly if run
-- as-is. Once you're ready, delete the `do $$ ... end $$;` guard block
-- (only that block - leave everything below it) and re-run.
-- =============================================================================

do $$
begin
  raise exception 'PHASE 2 GUARD: this migration permanently destroys plaintext customer names. Delete this guard block only after you have exported/backed up customer_name (see scripts/export_customer_names_before_hashing.sql) and are ready to proceed.';
end $$;

update public.policies
set client_identifier_hash = public._hash_client_identifier_internal(customer_name, agency_id)
where customer_name is not null
  and trim(customer_name) <> ''
  and client_identifier_hash is null;

alter table public.policies drop column customer_name;
