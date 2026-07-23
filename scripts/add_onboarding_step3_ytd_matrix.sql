-- =============================================================================
-- ADDITIVE MIGRATION — safe to run any number of times, never drops/deletes data.
-- Expands the Step 3 "YTD Starting Line" from a single blended
-- premium/bound-apps pair into a full per-line matrix (Apps + Premium for
-- Auto, Fire, Life, and Health), matching the {concept}_{line}_{apps|premium}
-- naming convention already used everywhere else in this schema (see
-- annual_target_auto_apps, book_size_auto, base_comm_auto, etc. on offices).
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_ytd_auto_apps integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_ytd_auto_premium numeric NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_ytd_fire_apps integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_ytd_fire_premium numeric NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_ytd_life_apps integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_ytd_life_premium numeric NOT NULL DEFAULT 0;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_ytd_health_apps integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS starting_ytd_health_premium numeric NOT NULL DEFAULT 0;

-- NOTE: the original starting_ytd_premium / starting_ytd_bound_apps columns
-- (see scripts/add_onboarding_ytd_columns.sql) are NOT dropped. Nothing else
-- in the app reads them today, but app/actions/onboarding.ts keeps writing
-- them as a blended sum of the 4 lines above (premium total / apps total) so
-- they stay accurate as a free rollup for any future feature that wants a
-- single blended number without re-summing the matrix itself.
