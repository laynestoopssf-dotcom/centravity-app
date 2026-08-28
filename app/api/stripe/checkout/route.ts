import { NextResponse, type NextRequest } from "next/server";
import {
  resolveBillingContext,
  createCheckoutSessionForAgency,
  getPriceIdForAgency,
  resolveDefaultRedirectUrls,
} from "../../../actions/stripeAdmin";

// =============================================================================
// POST /api/stripe/checkout
// -----------------------------------------------------------------------------
// A plain HTTP wrapper around the exact same createCheckoutSessionForAgency
// core used by app/actions/billing.ts's Server Action (that Server Action is
// the primary path the dashboard's own Settings/Billing UI actually calls —
// this route exists for any future non-Server-Action caller, e.g. a mobile
// client or an external integration that can't invoke a Next.js Server
// Action directly). Both paths funnel through stripeAdmin.ts's
// resolveBillingContext, so the "only the agency owner can start checkout for
// their own agency" rule lives in exactly one place.
//
// Not a webhook — no signature verification needed here since the caller is
// authenticating as a real logged-in user via their own Supabase access
// token, not Stripe. Contrast with /api/stripe/webhook, which is the
// opposite: no user session at all, verified purely by Stripe's signature.
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const accessToken: string | undefined = body?.accessToken;

    const context = await resolveBillingContext(accessToken);
    if (!context.ok) {
      return NextResponse.json({ success: false, error: context.error }, { status: 401 });
    }

    const defaults = resolveDefaultRedirectUrls();
    const successUrl: string | undefined = body?.successUrl || defaults?.successUrl;
    const cancelUrl: string | undefined = body?.cancelUrl || defaults?.cancelUrl;

    if (!successUrl || !cancelUrl) {
      return NextResponse.json(
        { success: false, error: "Missing successUrl/cancelUrl and NEXT_PUBLIC_APP_URL is not configured." },
        { status: 400 }
      );
    }

    const { url } = await createCheckoutSessionForAgency({
      agencyId: context.agencyId,
      agencyName: context.agencyName,
      email: context.email,
      existingCustomerId: context.stripeCustomerId,
      // Beta-vs-standard pricing split — see app/api/stripe/create-checkout's
      // header comment; this legacy route now shares the exact same pricing
      // rule so it can never charge a different price than that one.
      priceId: getPriceIdForAgency(context.isBetaUser),
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({ success: true, url });
  } catch (err: unknown) {
    console.error("[api/stripe/checkout] failed", err);
    const message = err instanceof Error ? err.message : "Unexpected error starting checkout.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
