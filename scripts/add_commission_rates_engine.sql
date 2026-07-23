-- =============================================================================
-- ADDITIVE MIGRATION — safe to run any number of times, never drops/deletes data.
-- Adds a dynamic, carrier-accurate commission rate table for Life & Health so
-- their revenue projections can be decoupled from the P&C Variable Comp (VC)
-- multiplier (see app/dashboard/page.tsx calculateRev / app/dashboard/reveal
-- for the consumers, and utils/commissionRates.ts for the shared read helpers).
-- -----------------------------------------------------------------------------
-- WHY `agencies` and not a new `agency_settings` table: this codebase has no
-- `agency_settings` table today — the single `agencies` row per agency (loaded
-- everywhere as `agencySettings`) already plays that role (see
-- current_vc_rate, custom_product_lines, custom_roles, etc. all living here).
-- Keeping `commission_rates` alongside them means it rides the exact same
-- fetch/save plumbing (fetchAgencySettings, SettingsTab) with zero new wiring.
-- -----------------------------------------------------------------------------
-- SCHEMA NOTES:
--   * Life: keyed by product sub-type (term / traditional_ordinary /
--     single_premium), each with year1 (new business), year2_to_5 and
--     year6_plus (servicing/renewal) rates. Traditional Ordinary's year1/
--     year2_to_5 are an intentional average across the carrier's mid-tier age
--     brackets for projection simplicity — the nested-object shape leaves room
--     to swap in per-age-bracket arrays later without a breaking schema change
--     (e.g. `"traditional_ordinary": { "18-40": {...}, "41-60": {...} }`).
--   * Health: keyed by product sub-type (medicare_supplement /
--     long_term_care_and_disability / hospital_income), each with first_year
--     (new business) and servicing (renewal/existing book) rates.
--   * All values are decimals (0.20 = 20%), matching how current_vc_rate /
--     base_comm_* are already stored (as whole percents, /100'd at read time)
--     -- NOTE the difference: commission_rates values are pre-divided decimals
--     so the read helpers in utils/commissionRates.ts can use them directly.
-- =============================================================================

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS commission_rates jsonb NOT NULL DEFAULT '{
    "life": {
      "term": { "year1": 0.20, "year2_to_5": 0.03, "year6_plus": 0.02 },
      "traditional_ordinary": { "year1": 0.30, "year2_to_5": 0.12, "year6_plus": 0.03 },
      "single_premium": { "year1": 0.03, "year2_to_5": 0.00, "year6_plus": 0.00 }
    },
    "health": {
      "medicare_supplement": { "first_year": 0.11, "servicing": 0.11 },
      "long_term_care_and_disability": { "first_year": 0.40, "servicing": 0.10 },
      "hospital_income": { "first_year": 0.25, "servicing": 0.10 }
    }
  }'::jsonb;

-- Safety net for any agency row created before this migration ran with the
-- column nullable, or where a prior partial run left it as an empty object.
UPDATE public.agencies
SET commission_rates = '{
    "life": {
      "term": { "year1": 0.20, "year2_to_5": 0.03, "year6_plus": 0.02 },
      "traditional_ordinary": { "year1": 0.30, "year2_to_5": 0.12, "year6_plus": 0.03 },
      "single_premium": { "year1": 0.03, "year2_to_5": 0.00, "year6_plus": 0.00 }
    },
    "health": {
      "medicare_supplement": { "first_year": 0.11, "servicing": 0.11 },
      "long_term_care_and_disability": { "first_year": 0.40, "servicing": 0.10 },
      "hospital_income": { "first_year": 0.25, "servicing": 0.10 }
    }
  }'::jsonb
WHERE commission_rates IS NULL OR commission_rates = '{}'::jsonb;
