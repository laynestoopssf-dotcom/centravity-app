-- =============================================================================
-- Patch the manual_bonuses PII leak - PHASE 2 of 2 (historical cleanup).
-- -----------------------------------------------------------------------------
-- ⚠️  DO NOT RUN THIS UNTIL YOU HAVE EXPORTED/BACKED UP THE HISTORICAL BONUS
--     NAMES - see scripts/export_manual_bonuses_before_scrubbing.sql. ⚠️
--
-- 20260805020000_add_manual_bonuses_policy_id.sql fixed the leak GOING
-- FORWARD (the Spiff Claim modal now links a bonus to a policy_id instead of
-- folding a typed customer name into bonus_name). This script cleans up rows
-- that were already written by the OLD modal, which saved bonus_name as
-- "<bonus type> — <First L.>" (e.g. "Google Review — John D.") - plaintext PII
-- with no hashing at all.
--
-- This script permanently strips everything from the first " — " (a real em
-- dash, "—", surrounded by spaces) onward, leaving just the bonus type - e.g.
-- "Google Review — John D." becomes "Google Review". It intentionally only
-- touches rows with `policy_id is null` and that exact em-dash shape, so it
-- can't accidentally mangle a manager's free-text "Custom Reason" bonus (that
-- flow has never involved a customer name, and a plain hyphen "-" typed on a
-- normal keyboard does not match a real em dash "—").
--
-- This is irreversible - once this runs, the trailing name segment is gone
-- for good, in this app and by querying the database directly. There is no
-- "undo" other than restoring from the CSV export you took in Step 0 or a
-- database backup/PITR. It also does NOT attempt to backfill `policy_id` for
-- these rows - there is no reliable way to automatically re-match a bare
-- "First L." string back to a specific policy, so these historical claims
-- will simply show their bonus type with no linked customer going forward,
-- same as any other policy_id-less bonus (e.g. "Custom Reason" entries).
--
-- The guard block below intentionally makes this script fail loudly if run
-- as-is. Once you're ready, delete the `do $$ ... end $$;` guard block
-- (only that block - leave everything below it) and re-run.
-- =============================================================================

do $$
begin
  raise exception 'PHASE 2 GUARD: this permanently destroys the plaintext customer-name suffix in historical manual_bonuses.bonus_name rows. Delete this guard block only after you have exported/backed up those rows (see scripts/export_manual_bonuses_before_scrubbing.sql) and are ready to proceed.';
end $$;

update public.manual_bonuses
set bonus_name = trim(split_part(bonus_name, chr(8212), 1))
where policy_id is null
  and bonus_name like '% ' || chr(8212) || ' %';
