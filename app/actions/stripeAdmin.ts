import "server-only";
import Stripe from "stripe";
import { supabaseAdmin } from "./supabaseAdmin";

// =============================================================================
// Shared Stripe billing core (server-only). Deliberately NOT marked
// "use server" — same reasoning as supabaseAdmin.ts/email.ts: this module
// exports plain helper functions and a client instance, imported by both
// app/actions/billing.ts (the Server Action the dashboard's Settings/Billing
// UI actually calls) and app/api/stripe/checkout/route.ts (a plain HTTP
// route wrapping the exact same core logic), so the checkout-session-creation
// rules live in exactly one place regardless of which caller triggers it.
//
// LAZY CLIENT — same load-bearing reason as every other admin client in this
// app (supabaseAdmin.ts, coaching.ts, email.ts): constructing eagerly at
// module load time means a missing STRIPE_SECRET_KEY throws before any
// caller's own try/catch has started, crossing the Server Action/Route
// Handler boundary uncaught.
// =============================================================================

let cachedStripe: Stripe | null = null;

function getStripe(): Stripe {
  if (cachedStripe) return cachedStripe;

  const secretKey = process.env.STRIPE_SECRET_KEY || "";
  if (!secretKey) {
    console.error("[stripe] missing STRIPE_SECRET_KEY");
    throw new Error("Billing is misconfigured: missing Stripe credentials. Please contact support.");
  }

  // No explicit apiVersion pin — let the installed SDK use the version it
  // shipped against (Stripe's own default behavior), rather than hardcoding
  // a version string here that could silently drift out of sync with
  // whatever `stripe` package version package.json ends up on after a
  // future `npm update`.
  cachedStripe = new Stripe(secretKey);
  return cachedStripe;
}

// A Price id isn't a secret (Stripe's own Checkout.js embeds these
// client-side all the time), so NEXT_PUBLIC_STRIPE_PRICE_ID is exactly as
// safe to read here as a server-only var would be — this just matches
// whatever name ended up configured in Vercel. STRIPE_PRICE_ID is checked
// second purely for back-compat with anyone who set the server-only name
// instead.
export function getDefaultPriceId(): string {
  const priceId = process.env.NEXT_PUBLIC_STRIPE_PRICE_ID || process.env.STRIPE_PRICE_ID || "";
  if (!priceId) {
    throw new Error("Billing is misconfigured: missing NEXT_PUBLIC_STRIPE_PRICE_ID.");
  }
  return priceId;
}

// Beta-vs-standard price split for the Beta Conversion Gate
// (app/api/stripe/create-checkout/route.ts, called from
// components/dashboard/BetaCompleteModal.tsx). `agencies.is_beta_user` is
// purely a pricing signal here — it does NOT gate access on its own; see
// utils/billing.ts's isBetaAccessLocked for the actual lockout condition.
// Kept as a hard error (not a silent fallback to getDefaultPriceId) so a
// missing env var surfaces immediately as a loud checkout failure instead of
// quietly charging every beta agency the standard rate.
export function getPriceIdForAgency(isBetaUser: boolean): string {
  const envVarName = isBetaUser ? "NEXT_PUBLIC_STRIPE_BETA_PRICE_ID" : "NEXT_PUBLIC_STRIPE_STANDARD_PRICE_ID";
  const priceId = process.env[envVarName] || "";
  if (!priceId) {
    throw new Error(`Billing is misconfigured: missing ${envVarName}.`);
  }
  return priceId;
}

// Builds default Checkout redirect URLs from NEXT_PUBLIC_APP_URL when a
// caller doesn't supply its own successUrl/cancelUrl — lets
// createCheckoutSession be called with nothing but an accessToken (e.g. from
// a future Settings/Billing button, or for a manual smoke test) without every
// caller having to independently compute the deployment's own origin.
export function resolveDefaultRedirectUrls(): { successUrl: string; cancelUrl: string } | null {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  if (!appUrl) return null;
  // /dashboard/settings is not a real route — Settings is a tab rendered
  // inside /dashboard itself (see components/SettingsTab.tsx), so redirect
  // there instead. The `checkout` query param is inert today (nothing reads
  // it yet) but is left in place for both the existing Settings/Billing flow
  // and the new Beta Conversion Gate to build a "welcome back" toast on top
  // of later without another redirect-URL change.
  return {
    successUrl: `${appUrl}/dashboard?checkout=success`,
    cancelUrl: `${appUrl}/dashboard?checkout=cancelled`,
  };
}

export interface BillingContext {
  ok: true;
  ownerId: string;
  email: string | null;
  agencyId: string;
  agencyName: string;
  stripeCustomerId: string | null;
  isBetaUser: boolean;
}

export type BillingContextResult = BillingContext | { ok: false; error: string };

// Re-derives the caller's identity + agency from their own session, mirroring
// the same "never trust a client-supplied id" rule as onboarding.ts's
// authenticateCaller/getCallerAgencyContext. Shared by both the Server Action
// and the plain HTTP route so a client can never request a checkout session
// (or, more importantly, a plan change) on behalf of an agency it doesn't
// actually own.
export async function resolveBillingContext(
  accessToken: string | undefined
): Promise<BillingContextResult> {
  if (!accessToken) return { ok: false, error: "Unauthorized: missing session." };

  const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !authUser?.user) {
    console.error("[stripe] failed to authenticate caller", authError);
    return { ok: false, error: "Unauthorized: invalid session." };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("agency_id, role")
    .eq("id", authUser.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[stripe] failed to look up caller profile", profileError);
    return { ok: false, error: profileError.message };
  }

  if (!profile?.agency_id) {
    return { ok: false, error: "No agency found for this account yet — finish onboarding first." };
  }

  // Billing is deliberately owner-only — a producer or manager hitting this
  // (e.g. by guessing the route) must never be able to change the agency's
  // subscription.
  if (profile.role !== "owner") {
    return { ok: false, error: "Only the agency owner can manage billing." };
  }

  const { data: agency, error: agencyError } = await supabaseAdmin
    .from("agencies")
    .select("id, name, stripe_customer_id, is_beta_user")
    .eq("id", profile.agency_id)
    .maybeSingle();

  if (agencyError || !agency) {
    console.error("[stripe] failed to look up agency", agencyError);
    return { ok: false, error: agencyError?.message || "Agency not found." };
  }

  return {
    ok: true,
    ownerId: authUser.user.id,
    email: authUser.user.email ?? null,
    agencyId: agency.id as string,
    agencyName: (agency.name as string) || "your agency",
    stripeCustomerId: (agency.stripe_customer_id as string) || null,
    isBetaUser: Boolean(agency.is_beta_user),
  };
}

// Creates a Stripe Customer on first checkout attempt only — every later
// call reuses the id already persisted on `agencies.stripe_customer_id`
// (see scripts/add_stripe_billing_columns.sql's unique index, which backs
// this up at the database level too).
export async function ensureStripeCustomer({
  agencyId,
  agencyName,
  email,
  existingCustomerId,
}: {
  agencyId: string;
  agencyName: string;
  email: string | null;
  existingCustomerId: string | null;
}): Promise<string> {
  if (existingCustomerId) return existingCustomerId;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: agencyName,
    email: email || undefined,
    metadata: { agency_id: agencyId },
  });

  const { error } = await supabaseAdmin
    .from("agencies")
    .update({ stripe_customer_id: customer.id })
    .eq("id", agencyId);

  if (error) {
    // Not fatal to checkout itself — the customer already exists in Stripe
    // regardless of whether this write lands. Logged loudly because a
    // persistent failure here means every future checkout attempt will
    // mint a brand-new duplicate Stripe customer for the same agency.
    console.error("[stripe] failed to persist stripe_customer_id", error);
  }

  return customer.id;
}

export async function createCheckoutSessionForAgency({
  agencyId,
  agencyName,
  email,
  existingCustomerId,
  priceId,
  successUrl,
  cancelUrl,
}: {
  agencyId: string;
  agencyName: string;
  email: string | null;
  existingCustomerId: string | null;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripe();
  const customerId = await ensureStripeCustomer({ agencyId, agencyName, email, existingCustomerId });

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: { metadata: { agency_id: agencyId } },
    metadata: { agency_id: agencyId },
  });

  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL.");
  }

  return { url: session.url };
}

// Shared by the webhook route to resolve which agencies row a given
// customer.subscription.* event belongs to — every subscription this app
// creates carries agency_id in its metadata (see createCheckoutSessionForAgency
// above), so this never has to fall back to matching on customer id alone.
export function agencyIdFromSubscription(subscription: Stripe.Subscription): string | null {
  return (subscription.metadata?.agency_id as string) || null;
}

export { getStripe };
