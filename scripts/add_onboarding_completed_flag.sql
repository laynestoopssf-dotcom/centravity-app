-- =============================================================================
-- ADDITIVE MIGRATION — safe to run any number of times, never drops/deletes data.
-- Adds an explicit `onboarding_completed` flag to public.profiles, set by
-- app/actions/onboarding.ts (createAgencyOnboarding) once a user finishes the
-- OnboardingWizard. This is metadata/analytics only — the actual /dashboard →
-- /onboarding gatekeeper in app/dashboard/page.tsx keys off `agency_id IS NULL`,
-- since that signal works for BOTH this flow and the legacy
-- register_agency_owner RPC path (which predates this column and never sets it).
--
-- The backfill below is an UPDATE, not a DELETE — it only flips existing rows
-- that are already linked to an agency to `true`, so nobody who's already
-- fully set up gets a stale `false` default.
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Backfill: anyone already linked to an agency is, by definition, already
-- past onboarding (whichever path they came in through).
UPDATE public.profiles
SET onboarding_completed = true
WHERE agency_id IS NOT NULL
  AND onboarding_completed = false;
