-- =============================================================================
-- STEP 0 of the Blind Index rollout - run this FIRST, before Phase 2.
-- -----------------------------------------------------------------------------
-- `policies.customer_name` still holds real plaintext historical names.
-- Phase 2 (scripts/PHASE2_hash_and_drop_customer_name.sql) will overwrite and
-- then permanently DROP that column - there is no way to recover a plaintext
-- name from a hash afterward. If you want a durable backup of your existing
-- customer names before that happens, run this query.
--
-- How to use:
--   1. Open the Supabase SQL Editor for this project.
--   2. Paste and run the query below.
--   3. Click "Download CSV" on the results panel and store the file
--      somewhere appropriately access-controlled (this file itself IS the
--      raw PII you're trying to stop storing in the live app database, so
--      treat the exported CSV with the same care/retention policy).
--   4. Once you're comfortable you have what you need, run Phase 2.
-- =============================================================================

select
  id as policy_id,
  agency_id,
  office_id,
  user_id,
  customer_name,
  product_line,
  premium_amount,
  status,
  logged_at,
  written_at,
  bound_at,
  issued_at
from public.policies
where customer_name is not null and customer_name <> ''
order by logged_at desc;
