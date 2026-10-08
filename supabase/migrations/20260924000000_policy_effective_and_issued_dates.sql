-- Three distinct policy dates: Production vs. Commission vs. Coverage.
-- -----------------------------------------------------------------------------
--   bound_at        (bound_date)     WHEN THE WORK HAPPENED. Stamped once when status first becomes
--                                    'bound'. Drives all PRODUCTION credit (Scoreboard, Weekly Rank,
--                                    pacing, Agency MTD) - an agent is credited the day they bind.
--                                    (Already exists - see 20260731000000_add_policies_bound_at.sql.)
--   effective_date  (effective_date) WHEN COVERAGE STARTS. Optional, may be in the FUTURE (e.g. a home
--                                    closing next month). Informational only - never used for
--                                    production or commission math.  (NEW in this migration.)
--   issued_at       (issued_date)    WHEN THE CARRIER ISSUES IT / money is real. Stamped when status
--                                    flips to 'issued' and cleared when it flips back. Drives
--                                    COMMISSION eligibility: a policy is commissionable in the month
--                                    its issued_at falls in AND only while status = 'issued'.
--                                    (The app has been writing this column already; this migration
--                                    makes sure it exists - `if not exists` - since no earlier
--                                    migration file in the repo created it.)
--
-- Idempotent: safe to run more than once.
-- =============================================================================

alter table public.policies
  add column if not exists issued_at timestamptz,
  add column if not exists effective_date date;

comment on column public.policies.effective_date is
  'Date coverage starts. Optional and may be in the future. Informational only - does not affect production (bound_at) or commission (issued_at) bucketing.';
comment on column public.policies.issued_at is
  'Timestamp the policy status was set to ''issued'' (when the carrier issued it and the money is real). NULL whenever status is not ''issued''. Commission statements include a policy only when status = ''issued'' AND issued_at falls in the statement month.';

-- Backfill 1: policies already 'issued' with no issued_at would silently vanish from every
-- commission statement under the new rule. updatePolicyStatus re-stamps logged_at at the moment of
-- each status transition, so logged_at is the best available approximation of the issue date for
-- those legacy rows (no better record of it exists).
update public.policies
set issued_at = logged_at
where status = 'issued' and issued_at is null;

-- Backfill 2: invariant - only 'issued' policies carry an issued_at. Rows that were flipped back to
-- 'bound' (or any other status) before the app learned to clear it would otherwise keep a stale
-- date; they're not commissionable anyway (status check), but this keeps the column honest.
update public.policies
set issued_at = null
where status <> 'issued' and issued_at is not null;
