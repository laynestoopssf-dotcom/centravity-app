-- Fixes the Scoreboard/commission "Bound" date-window bug (quote date vs. bind date).
--
-- `policies` had no column that reliably recorded "when did this policy's status actually become
-- bound". The app leaned on `written_at` (documented in several places as "the bind date, stamped
-- once at creation") or raw `logged_at` (re-stamped to "now" on every status transition) for
-- date-window membership (Today/Week/Month/Quarter/Year Bound Apps, premium totals, custom
-- targets, the Daily Production Roster, etc). Neither is correct for the most common real flow:
-- quote a policy today, come back and bind that SAME row days/weeks later.
--   - `written_at` is set once at INSERT time (quote time) and is never touched again by the
--     "convert existing quote -> bound" update path (app/dashboard/page.tsx submitLogActivity,
--     the `isExistingQuote` branch), so a policy bound today still carries its original quote-day
--     `written_at` - it silently gets counted as bound on the day it was QUOTED, not bound. This
--     was the exact root cause of "producer bound 3 policies today, scoreboard only shows 1".
--   - `logged_at` gets re-stamped to "now" by updatePolicyStatus on EVERY status transition
--     (including bound -> issued), so it overcounts in the opposite direction - an old bind that
--     later gets marked issued looks like a brand-new bind on the issue date.
--
-- Fix: add a dedicated `bound_at` column, set exactly once by the app at the moment a policy's
-- status first becomes 'bound' (fresh bound-insert, existing-quote-to-bound conversion, or the
-- pipeline status dropdown), and never overwritten afterward (e.g. on a later bound -> issued
-- transition). App code now reads `bound_at` first, falling back to `written_at || logged_at`
-- only for legacy rows written before this column existed.
--
-- Run this migration against the linked project (`supabase db push`) or paste it into the
-- Supabase SQL Editor once. It's idempotent - re-running it is a no-op if the column already
-- exists (the backfill UPDATE only ever touches rows still missing bound_at).

alter table public.policies
  add column if not exists bound_at timestamptz;

comment on column public.policies.bound_at is
  'Timestamp of the moment this policy''s status first became ''bound''. Set once by the app and never overwritten on later transitions (e.g. bound -> issued). NULL for legacy rows written before this column existed and for policies never bound (status = ''quoted''); app code falls back to written_at || logged_at in that case.';

-- One-time backfill for existing rows, using the same written_at || logged_at fallback the app
-- used before this fix, so historical MTD/QTD/YTD numbers don't regress to zero for already-bound
-- policies. This does NOT retroactively recover the true bind date for rows written before this
-- migration (that information was never captured) - it just keeps old totals stable. Every NEW
-- bind event going forward gets a correct, dedicated `bound_at` stamp from the app.
update public.policies
set bound_at = coalesce(written_at, logged_at)
where status in ('bound', 'issued')
  and bound_at is null;
