-- =============================================================================
-- "Corporate Targets" feature toggles (OBA carrier-agnostic compliance).
-- -----------------------------------------------------------------------------
-- Adds two boolean columns to `agencies` that gate whether the VC (Variable
-- Comp) and Travel/Incentive tracking widgets render anywhere in the app.
-- Both default to FALSE, so every agency is carrier-agnostic ("plain
-- production tracking only") out of the box, and an owner has to explicitly
-- opt in from Settings -> Corporate Targets to turn either one on.
--
-- This mirrors the existing boolean-column-on-`agencies` pattern already used
-- for feature toggles (e.g. `stealth_mode_active`) rather than introducing a
-- new table or overloading an existing JSONB column (`commission_rates`,
-- `custom_product_lines`) that has its own unrelated shape.
--
-- Safe to run multiple times - IF NOT EXISTS guards both ADD COLUMN calls.
-- =============================================================================

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS target_vc_active boolean NOT NULL DEFAULT false;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS target_travel_active boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agencies.target_vc_active IS
  'Corporate Targets toggle: when true, the VC (Variable Comp) tracking widgets render (Revenue & VC tab, Cockpit VC Tier Sniper, Reveal VC cards). Defaults false for carrier-agnostic compliance.';
COMMENT ON COLUMN public.agencies.target_travel_active IS
  'Corporate Targets toggle: when true, the Travel/Incentive tracking widgets render (YTD Projections tab, Cockpit Travel & Incentive Qualifier). Defaults false for carrier-agnostic compliance.';
