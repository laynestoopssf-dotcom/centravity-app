"use client";

import { useState } from "react";
import { CreditCard, Loader2, LogOut } from "lucide-react";
import { supabase } from "../../utils/supabase";

// =============================================================================
// Full-screen, non-dismissable "Beta Complete" paywall.
// -----------------------------------------------------------------------------
// Rendered from app/dashboard/layout.tsx in place of every other route this
// layout wraps (sidebar, header, page content, AI chat widget — none of it)
// the moment utils/billing.ts's isBetaAccessLocked returns true for the
// signed-in user's agency. There is deliberately no close button and no
// click-outside-to-dismiss: unlike every other modal in this app, this one's
// entire purpose is to be un-skippable until the agency either subscribes or
// signs out.
//
// Only the agency OWNER can actually start a Stripe Checkout session — see
// app/actions/stripeAdmin.ts's resolveBillingContext, which hard-rejects any
// non-owner caller of /api/stripe/create-checkout — so a non-owner teammate
// sees a "ask your owner" message instead of a Subscribe button they'd only
// ever see fail.
// =============================================================================

export default function BetaCompleteModal({ isOwner }: { isOwner: boolean }) {
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubscribe = async () => {
    if (isStartingCheckout) return;
    setIsStartingCheckout(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        setError("Your session expired — please refresh and sign in again.");
        return;
      }

      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          // Built from window.location.origin (not left to the server's
          // NEXT_PUBLIC_APP_URL fallback) so this is correct on preview
          // deployments too — mirrors components/SettingsTab.tsx's
          // handleSubscribe.
          successUrl: `${window.location.origin}/dashboard?checkout=success`,
          cancelUrl: `${window.location.origin}/dashboard?checkout=cancelled`,
        }),
      });
      const result = await res.json().catch(() => null);

      if (!result?.success || !result?.url) {
        setError(result?.error || "Failed to start checkout. Please try again.");
        return;
      }

      // Full navigation to Stripe's own domain — not a Next.js route.
      window.location.href = result.url;
    } catch (err: unknown) {
      console.error("[BetaCompleteModal] handleSubscribe failed", err);
      setError(err instanceof Error ? err.message : "Failed to start checkout. Please try again.");
    } finally {
      setIsStartingCheckout(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <div className="fixed inset-0 z-[999] bg-gray-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
          <CreditCard size={26} />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Beta Access Has Ended</h2>

        {isOwner ? (
          <>
            <p className="text-sm text-gray-500 mb-6">
              Thanks for being one of our beta partners! Subscribe now to keep your dashboard, pipeline, and
              team exactly as you left them — nothing about your data changes.
            </p>
            {error && <p className="text-sm text-red-600 font-semibold mb-4">{error}</p>}
            <button
              onClick={handleSubscribe}
              disabled={isStartingCheckout}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {isStartingCheckout ? <Loader2 size={18} className="animate-spin" /> : <CreditCard size={18} />}
              {isStartingCheckout ? "Redirecting to Checkout..." : "Subscribe Now"}
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-500 mb-6">
            Your agency&apos;s beta access has ended. Ask your agency owner to subscribe to restore access for
            the whole team.
          </p>
        )}

        <button
          onClick={handleSignOut}
          className="mt-4 w-full flex items-center justify-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-600 transition-colors"
        >
          <LogOut size={14} /> Sign Out
        </button>
      </div>
    </div>
  );
}
