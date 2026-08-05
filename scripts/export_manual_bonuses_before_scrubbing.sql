-- =============================================================================
-- STEP 0 of the manual_bonuses PII cleanup - run this FIRST, before the scrub.
-- -----------------------------------------------------------------------------
-- Before 20260805020000_add_manual_bonuses_policy_id.sql, the Spiff Claim
-- modal (CommissionTab.tsx) asked for a free-text "Customer First Name" +
-- "Last Initial" and folded the result straight into `bonus_name`, e.g.
-- "Google Review — John D." - plaintext PII, with no hashing at all.
--
-- scripts/PHASE2_scrub_manual_bonuses_pii.sql (run after this one) will
-- permanently strip that trailing "— First L." segment from every historical
-- row - there is no way to recover it afterward. If you want a durable backup
-- of the full historical bonus_name values first, run this query.
--
-- How to use:
--   1. Open the Supabase SQL Editor for this project.
--   2. Paste and run the query below.
--   3. Click "Download CSV" on the results panel and store the file
--      somewhere appropriately access-controlled (this file itself IS the
--      raw PII you're trying to stop storing in the live app database, so
--      treat the exported CSV with the same care/retention policy).
--   4. Once you're comfortable you have what you need, run
--      scripts/PHASE2_scrub_manual_bonuses_pii.sql.
--
-- The filter below matches the exact "<type> — <First L.>" shape the old
-- code always produced (a real em dash, "—", surrounded by spaces - not a
-- plain hyphen "-", which a manager could plausibly type into the unrelated
-- free-text "Custom Reason" field and which this deliberately leaves alone).
-- It also excludes rows that already have a `policy_id` - genuine post-fix
-- claims never have PII folded into bonus_name in the first place, so there's
-- nothing to export/scrub for those regardless of what their name happens to
-- contain.
-- =============================================================================

select
  id as bonus_id,
  agency_id,
  user_id,
  bonus_name,
  amount,
  logged_at
from public.manual_bonuses
where policy_id is null
  and bonus_name like '% ' || chr(8212) || ' %'
order by logged_at desc;
