import { NextResponse, type NextRequest } from "next/server";
import {
  resolveBillingContext,
  createCheckoutSessionForAgency,
  getPriceIdForAgency,
  resolveDefaultRedirectUrls,
} from "../../../actions/stripeAdmin";

// =============================================================================
// POST /api/stripe/create-checkout
// -----------------------------------------------------------------------------
// The beta-aware sibling of /api/stripe/checkout — same
// resolveBillingContext + createCheckoutSessionForAgency core (so the
// "only the agency owner can start checkout for their own agency" rule
// still lives in exactly one place), but picks the Price id from the
// agency's own `is_beta_user` flag via getPriceIdForAgency instead of
// always charging the single legacy NEXT_PUBLIC_STRIPE_PRICE_ID.
//
// This is the route the Beta Conversion Gate's paywall modal
// (components/dashboard/BetaCompleteModal.tsx, rendered from
// app/dashboard/layout.tsx once utils/billing.ts's isBetaAccessLocked
// returns true) calls to send a locked-out owner to Stripe Checkout.
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
      priceId: getPriceIdForAgency(context.isBetaUser),
      successUrl,
      cancelUrl,
    });

    return NextResponse.json({ success: true, url });
  } catch (err: unknown) {
    console.error("[api/stripe/create-checkout] failed", err);
    const message = err instanceof Error ? err.message : "Unexpected error starting checkout.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
