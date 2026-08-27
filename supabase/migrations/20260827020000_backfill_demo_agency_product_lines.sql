-- =============================================================================
-- One-off backfill: populate the live Demo Agency's custom_product_lines with
-- the default State Farm sub-line catalog.
-- -----------------------------------------------------------------------------
-- scripts/seed_demo_agency.ts (and app/actions/onboarding.ts's
-- saveStep1Foundation, for real signups) now seeds every brand-new agency's
-- custom_product_lines with this exact catalog on creation - see
-- utils/defaultProductLines.ts, the single source of truth both of those
-- import from. The live Demo Agency predates that change, so it's missing
-- these sub-lines entirely (falls back to the generic 5-line placeholder set
-- in the Scoreboard logging dropdowns instead).
--
-- This is a plain UPDATE of one column on one specific row - idempotent and
-- safe to run more than once (it just re-applies the identical JSON), and
-- does NOT touch any other agency. Equivalent to running:
--   npm run backfill:demo-lines
-- (scripts/backfill_demo_product_lines.ts) against .env.local's
-- DEMO_AGENCY_ID - use whichever is more convenient; both write the exact
-- same array via the exact same column real manual "Add" clicks in
-- Settings -> Custom Product Lines use.
--
-- Replace the id below with your own DEMO_AGENCY_ID (see .env.local) if it
-- ever differs from what's checked in here.
-- =============================================================================

update public.agencies
set custom_product_lines = '[
  {"name": "Added Auto", "parent": "Auto"},
  {"name": "Raw New Auto", "parent": "Auto"},
  {"name": "Non Tenant - Condominium Unitowners", "parent": "Fire"},
  {"name": "Non Tenant - Homeowners", "parent": "Fire"},
  {"name": "Non Tenant - Manufactured Home Policy", "parent": "Fire"},
  {"name": "Other Personal Fire - Boatowners Policy", "parent": "Fire"},
  {"name": "Other Personal Fire - Personal Articles Policy", "parent": "Fire"},
  {"name": "Other Personal Fire - Rental Dwelling Policy", "parent": "Fire"},
  {"name": "Other Personal Fire - Umbrella", "parent": "Fire"},
  {"name": "Tenant - Renters", "parent": "Fire"},
  {"name": "Commercial Fire - Business Insurance", "parent": "Commercial"},
  {"name": "Commercial Fire - Commercial Liability Umbrella Policy", "parent": "Commercial"},
  {"name": "Commercial Fire - Contractors", "parent": "Commercial"},
  {"name": "Hospital income", "parent": "Health"},
  {"name": "Medicare Supp/Medigap", "parent": "Health"},
  {"name": "Term Life", "parent": "Life"},
  {"name": "Universal Life", "parent": "Life"},
  {"name": "Whole Life", "parent": "Life"}
]'::jsonb
where id = 'a523642c-4a0a-479a-b2eb-e37864b9626f';
