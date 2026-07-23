-- =============================================================================
-- ADDITIVE MIGRATION — safe to run any number of times, never drops/deletes data.
-- Adds the two "YTD Starting Line" columns that
-- app/actions/onboarding.ts writes to when a producer is onboarded mid-year,
-- so their pacing/VC math starts from a real baseline instead of $0.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_ytd_premium numeric NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_ytd_bound_apps integer NOT NULL DEFAULT 0;
