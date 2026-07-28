import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { getStripe, agencyIdFromSubscription } from "../../../actions/stripeAdmin";
import { supabaseAdmin } from "../../../actions/supabaseAdmin";

// =============================================================================
// POST /api/stripe/webhook
// -----------------------------------------------------------------------------
// The one part of the Stripe integration that CANNOT be a Server Action: this
// needs the raw, byte-for-byte request body to verify the `stripe-signature`
// header (any JSON re-serialization — even parse-then-stringify — changes the
// bytes and invalidates the signature). Server Actions only ever hand you
// already-parsed arguments, never the raw request, so this has to be a plain
// Route Handler.
//
// `runtime = "nodejs"` (also this app's default already, but explicit here
// since it's load-bearing for this specific route): Stripe's signature
// verification needs Node's `crypto` module. constructEventAsync (rather
// than the sync constructEvent) works with either Node's crypto or
// SubtleCrypto, so this stays correct even if the runtime ever changes.
//
// SECURITY: this route has zero user session — by design, Stripe calls it
// directly, server-to-server, with no cookies. constructEventAsync is the
// ENTIRE authentication boundary here: it throws if the signature doesn't
// match STRIPE_WEBHOOK_SECRET, which is exactly what stops anyone else from
// POSTing a fake "subscription active" event at this URL.
// =============================================================================

export const runtime = "nodejs";

// Keeps `agencies.stripe_subscription_id` / `subscription_status` / `plan_id`
// in sync from whatever the current, authoritative Subscription object says —
// the single source of truth both checkout.session.completed (after
// retrieving the subscription it created) and customer.subscription.updated
// funnel through, so there's no separate, potentially-drifting copy of this
// sync logic per event type.
async function syncSubscriptionToAgency(subscription: Stripe.Subscription) {
  const agencyId = agencyIdFromSubscription(subscription);
  if (!agencyId) {
    console.error("[stripe:webhook] subscription has no agency_id metadata", subscription.id);
    return;
  }

  const planId = subscription.items.data[0]?.price?.id || null;

  const { error } = await supabaseAdmin
    .from("agencies")
    .update({
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      plan_id: planId,
    })
    .eq("id", agencyId);

  if (error) {
    console.error("[stripe:webhook] failed to sync subscription to agency", error);
  }
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

  if (!signature || !webhookSecret) {
    console.error("[stripe:webhook] missing signature header or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 400 });
  }

  // .text() (never .json()) — must stay the exact raw bytes Stripe signed.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err: unknown) {
    console.error("[stripe:webhook] signature verification failed", err);
    const message = err instanceof Error ? err.message : "Invalid signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const stripe = getStripe();
          const subscriptionId =
            typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await syncSubscriptionToAgency(subscription);
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        await syncSubscriptionToAgency(event.data.object as Stripe.Subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const agencyId = agencyIdFromSubscription(subscription);
        if (agencyId) {
          const { error } = await supabaseAdmin
            .from("agencies")
            .update({ subscription_status: "canceled" })
            .eq("id", agencyId);
          if (error) {
            console.error("[stripe:webhook] failed to mark subscription canceled", error);
          }
        }
        break;
      }

      default:
        // Deliberately silent for event types we don't act on yet (e.g.
        // invoice.* events) — Stripe retries on non-2xx, so an unhandled
        // type must still resolve 200, not be mistaken for a processing
        // failure.
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: unknown) {
    // A thrown error here DOES need a non-2xx response — this is a genuine
    // processing failure (e.g. the Supabase update itself failed), and
    // Stripe's automatic retry is exactly the right recovery mechanism for
    // it, unlike the signature-verification branch above which is a
    // permanent rejection.
    console.error("[stripe:webhook] handler failed", err);
    return NextResponse.json({ error: "Webhook handler failed." }, { status: 500 });
  }
}
