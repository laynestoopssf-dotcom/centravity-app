-- =============================================================================
-- ADDITIVE MIGRATION — safe to run any number of times, never drops/deletes data.
-- Adds the close-rate (quotes → bound apps) settings behind the Executive
-- Cockpit's "Activity Pacing Engine" (see app/dashboard/cockpit/page.tsx and
-- components/SettingsTab.tsx's "Conversion Metrics" section).
-- -----------------------------------------------------------------------------
-- WHY THIS EXISTS: the app already computes ACTUAL historical close rates
-- on the fly in several places (e.g. app/dashboard/page.tsx's closeRate =
-- bound/quotes), but the Cockpit's forward-looking "how many quotes per day"
-- math needs an explicit, owner-controlled ASSUMPTION to plan against —
-- distinct from a backward-looking actual. Producers without an override
-- fall back to the agency-wide global rate.
-- -----------------------------------------------------------------------------
-- SCHEMA NOTES:
--   * `agencies.global_close_rate` — whole percent (20 = 20%), same
--     convention as current_vc_rate / base_comm_*.
--   * `profiles.close_rate` — nullable whole percent; NULL means "use the
--     agency's global_close_rate" (see utils/pacing usage in the Cockpit).
-- =============================================================================

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS global_close_rate numeric NOT NULL DEFAULT 20;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS close_rate numeric NULL;
