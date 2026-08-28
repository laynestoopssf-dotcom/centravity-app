-- =============================================================================
-- ADDITIVE MIGRATION — safe to run any number of times, never drops/deletes data.
-- Adds the two beta-conversion columns to `agencies` that back the Beta
-- Conversion Gate (app/dashboard/layout.tsx's lockout check) and the
-- beta-vs-standard pricing split in app/actions/stripeAdmin.ts's
-- getPriceIdForAgency / app/api/stripe/create-checkout/route.ts.
--
-- These columns already exist on the live database (added out-of-band before
-- this migration file was written) — this file exists purely so the schema
-- is tracked in version control like every other column, and so a fresh
-- database (e.g. a new environment) ends up with the same shape. `IF NOT
-- EXISTS` makes it a no-op against the already-patched production database.
-- -----------------------------------------------------------------------------
-- SCHEMA NOTES:
--   * `is_beta_user` — true for agencies that were onboarded during the
--     closed beta. Used ONLY to pick which Stripe Price id a checkout
--     session should charge (NEXT_PUBLIC_STRIPE_BETA_PRICE_ID vs
--     NEXT_PUBLIC_STRIPE_STANDARD_PRICE_ID) — it does NOT by itself lock
--     anyone out. Defaults false so every pre-existing/new agency prices at
--     standard rate unless explicitly flagged.
--   * `beta_expires_at` — the date/time an agency's free beta period ends.
--     NULL means "no beta expiration set" (never locked out on this basis).
--     The lockout condition (see utils/billing.ts's isBetaAccessLocked) is
--     `beta_expires_at is in the past AND subscription_status <> 'active'`
--     — so simply setting this column on an agency, with no active paid
--     subscription yet, is what triggers the "Beta Complete" paywall.
--
-- See scripts/add_stripe_billing_columns.sql for the earlier, separately
-- applied stripe_customer_id / stripe_subscription_id / subscription_status
-- / plan_id columns these two build on top of.
-- =============================================================================

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS is_beta_user boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beta_expires_at timestamptz NULL;
