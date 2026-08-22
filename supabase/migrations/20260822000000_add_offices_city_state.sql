-- =============================================================================
-- ADDITIVE MIGRATION — safe to run any number of times, never drops/deletes data.
-- -----------------------------------------------------------------------------
-- Adds structured City/State columns to public.offices, backing the new
-- "City" and "State" fields on Step 1 (Agency Setup) of the OnboardingWizard.
-- Both are nullable free text — no format is enforced, matching every other
-- office field the wizard collects (see office.name for "Primary Office
-- Location", which stays a separate freeform display label untouched by this
-- migration).
-- =============================================================================

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS city text;

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS state text;
