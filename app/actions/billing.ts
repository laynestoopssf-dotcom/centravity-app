"use server";

import {
  resolveBillingContext,
  createCheckoutSessionForAgency,
  getPriceIdForAgency,
  resolveDefaultRedirectUrls,
} from "./stripeAdmin";

export interface CreateCheckoutSessionPayload {
  accessToken: string;
  // Optional absolute URLs to send Stripe's own redirect to. If omitted,
  // falls back to NEXT_PUBLIC_APP_URL (see resolveDefaultRedirectUrls) — pass
  // these explicitly only when a caller wants Stripe to land the owner
  // somewhere other than the default post-checkout Settings page (e.g. a
  // client built from window.location.origin for a preview-deploy-accurate
  // domain).
  successUrl?: string;
  cancelUrl?: string;
}

export interface CreateCheckoutSessionResult {
  success: boolean;
  url?: string;
  error?: string;
}

// Called from the dashboard's Settings/Billing UI when an owner clicks
// "Subscribe" / "Upgrade". Never touches the Stripe secret key from the
// client — this Server Action is the only thing that does, same boundary
// as every other privileged action in this app.
export async function createCheckoutSession(
  payload: CreateCheckoutSessionPayload
): Promise<CreateCheckoutSessionResult> {
  try {
    const context = await resolveBillingContext(payload.accessToken);
    if (!context.ok) return { success: false, error: context.error };

    const defaults = resolveDefaultRedirectUrls();
    const successUrl = payload.successUrl || defaults?.successUrl;
    const cancelUrl = payload.cancelUrl || defaults?.cancelUrl;

    if (!successUrl || !cancelUrl) {
      return {
        success: false,
        error: "Missing redirect URLs and NEXT_PUBLIC_APP_URL is not configured.",
      };
    }

    const { url } = await createCheckoutSessionForAgency({
      agencyId: context.agencyId,
      agencyName: context.agencyName,
      email: context.email,
      existingCustomerId: context.stripeCustomerId,
      // Same beta-vs-standard pricing split as the Beta Conversion Gate's
      // /api/stripe/create-checkout — the Settings/Billing "Subscribe"
      // button and the paywall modal must never charge two different
      // prices for the same agency depending on which UI they clicked.
      priceId: getPriceIdForAgency(context.isBetaUser),
      successUrl,
      cancelUrl,
    });

    return { success: true, url };
  } catch (err: unknown) {
    console.error("[billing] createCheckoutSession failed", err);
    const message = err instanceof Error ? err.message : "Unexpected error starting checkout.";
    return { success: false, error: message };
  }
}
