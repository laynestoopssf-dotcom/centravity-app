-- =============================================================================
-- Adds a distinct "Not Sold" outcome to `public.policies.status`, plus a
-- lightweight `notes` column so a producer can jot down *why* the customer
-- declined right when they mark a deal that way.
-- -----------------------------------------------------------------------------
-- STATUS VOCABULARY BEFORE THIS MIGRATION (see scripts/normalize_demo_metrics.ts's
-- header comment for the prior canonical list): 'quoted' | 'bound' | 'issued' |
-- 'not_taken' | 'positive' | 'negative'. `status` has always been a plain `text`
-- column with NO Postgres enum type and NO CHECK constraint - every one of those
-- values is (and was) enforced purely by app code (the <select> in
-- components/DashboardTab.tsx, LogActivityModal.tsx's Complex Resolution
-- logging), never by the database itself.
--
-- 'not_sold' is intentionally a SEPARATE, new value from the existing
-- 'not_taken' - they mean different things and both stay:
--   - 'not_taken' - the CARRIER declined the risk (underwriting decline). Stays
--     the same as before, still rendered "DECLINED" everywhere.
--   - 'not_sold'  - the CUSTOMER said no. A coaching opportunity, not a dead
--     end - see components/DashboardTab.tsx's highlighted row + auto-revealed
--     "Send to Coaching" button, which now also seeds a live Sparring Ring
--     session (components/coaching/SparringRing.tsx) with this deal's real
--     product line / premium / notes so the producer can practice the exact
--     objection immediately.
--
-- This migration ALSO formalizes the CHECK constraint that should have existed
-- from the start, now that a 7th value is being added deliberately - locking in
-- the full real vocabulary (verified live against production before writing
-- this: quoted, bound, issued, not_taken, positive - 'negative' is a valid but
-- currently-unused Complex Resolution outcome, included so it never becomes an
-- accidental constraint violation the first time it's written) so a future typo
-- in a new status string fails loudly at the database instead of silently
-- creating an unrecognized status that every status-based filter/badge in the
-- app quietly ignores.
--
-- Safe to run multiple times: `ADD COLUMN IF NOT EXISTS` and a
-- drop-then-recreate CHECK constraint are both idempotent.
-- =============================================================================

alter table public.policies
  add column if not exists notes text;

comment on column public.policies.notes is
  'Optional free-text note captured at status-change time - today only ever populated when a producer marks a deal ''not_sold'' (see components/DashboardTab.tsx''s inline notes prompt), explaining why the customer declined. NULL for every other status/legacy row.';

alter table public.policies
  drop constraint if exists policies_status_check;

alter table public.policies
  add constraint policies_status_check
  check (status in ('quoted', 'bound', 'issued', 'not_taken', 'not_sold', 'positive', 'negative'));
