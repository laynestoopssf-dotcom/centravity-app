-- =============================================================================
-- ADDITIVE MIGRATION — safe to run any number of times, never drops/deletes data.
-- Adds Stripe subscription-billing columns to `agencies`, backing the
-- Checkout Session + webhook flow in app/actions/billing.ts,
-- app/api/stripe/checkout/route.ts, and app/api/stripe/webhook/route.ts.
-- -----------------------------------------------------------------------------
-- SCHEMA NOTES:
--   * `stripe_customer_id`   — Stripe Customer id (cus_...). Created once, on
--     an agency's first checkout attempt, and reused on every later one so a
--     given agency never accumulates duplicate Stripe customers.
--   * `stripe_subscription_id` — Stripe Subscription id (sub_...). NULL until
--     checkout.session.completed fires; kept in sync afterward by
--     customer.subscription.updated/deleted webhook events.
--   * `subscription_status` — mirrors Stripe's own Subscription.status enum
--     (trialing / active / past_due / canceled / incomplete /
--     incomplete_expired / unpaid / paused) so app code never has to special
--     case a locally-invented status vocabulary. NULL means "never
--     subscribed" (a brand-new agency, pre-checkout) — distinct from
--     'canceled', which means they subscribed and later left.
--   * `plan_id` — the Stripe Price id (price_...) the agency is currently on.
--     Kept separate from subscription_status so a plan change
--     (upgrade/downgrade) can be read without joining out to Stripe.
--
-- A unique index on stripe_customer_id guards against ever accidentally
-- double-provisioning a Stripe customer for the same agencies row (e.g. a
-- double-submitted checkout-session request racing itself).
-- =============================================================================

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS stripe_customer_id text NULL,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text NULL,
  ADD COLUMN IF NOT EXISTS subscription_status text NULL,
  ADD COLUMN IF NOT EXISTS plan_id text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agencies_stripe_customer_id_key
  ON public.agencies (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
