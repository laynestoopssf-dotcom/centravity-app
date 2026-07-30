"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "../../utils/supabase";
import OnboardingWizard from "../../components/OnboardingWizard";
import { verifyWaitlistInvite } from "../actions/waitlist";

// =============================================================================
// Protected route: /onboarding
// -----------------------------------------------------------------------------
// Two guards run before the wizard ever renders:
//   1. No session at all → bounce to "/" (login). You must be authenticated to
//      set up an agency.
//   2. Session exists AND onboarding_completed is true → bounce straight to
//      "/dashboard". Deliberately NOT keyed off agency_id: with the 5-step
//      save-as-you-go wizard, agency_id gets set as early as Step 1, long
//      before setup is actually done. Keying this guard off agency_id would
//      bounce anyone who'd saved Step 1 (or later) straight to a half-set-up
//      dashboard instead of letting them resume the wizard — defeating the
//      entire point of "close the browser and come back later". This is the
//      mirror image of the /dashboard gatekeeper check (app/dashboard/page.tsx),
//      so a fully-onboarded user can never land back on the wizard by
//      navigating here directly, while a mid-setup user always can.
//
// All three redirects below use hard `window.location.href` navigation, never
// next/navigation's router — same reasoning as app/page.tsx's mount effect:
// an SPA transition here would race proxy.ts's own server-side re-validation
// of this exact same onboarding_completed gate, which is exactly the kind of
// "/onboarding" <-> "/dashboard" (or "/") ping-pong this guard exists to
// prevent, not cause. This file used to be the one remaining spot still doing
// router.replace() for an auth-boundary-crossing redirect after that fix
// shipped for "/" — inconsistent, and a live instance of the same race.
// =============================================================================

// The "/signup" invite catcher (app/signup/page.tsx) forwards its verified
// `?token=` here after account creation so the wizard can pre-fill the owner
// name + agency name it already collected on the waitlist, instead of making
// someone retype what they already told an admin. Purely a convenience: if
// the token is missing/expired/already burned by the time this runs, this
// just fails silently and the wizard renders with its normal blank fields —
// verifyWaitlistInvite() is the same read used by "/signup" itself, so it's
// still status:'approved'-gated and never exposes the waitlist table itself.
function OnboardingGate() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();

  const [status, setStatus] = useState<"checking" | "ready">("checking");
  const [prefill, setPrefill] = useState<{ ownerName: string; agencyName: string } | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkAccess = async (session: any) => {
      if (!session?.user?.id) {
        window.location.href = "/";
        return;
      }

      const { data: existingProfile, error } = await supabase
        .from("profiles")
        .select("onboarding_completed")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        // Fail open into the wizard rather than trapping the user on a blank
        // screen — each step action's own auth check (see app/actions/onboarding.ts)
        // is the real gate, and the wizard's own hydration call will sort out
        // which step to resume on regardless.
        console.error("[Onboarding] profile lookup failed", error);
        setStatus("ready");
        return;
      }

      // `onboarding_completed` only exists once scripts/add_onboarding_completed_flag.sql
      // has run; until then this is always undefined/false, which just means
      // "show the wizard" — never incorrectly bounces an already-done user to
      // the wizard, since the worst case is showing it to someone who doesn't
      // need it (harmless), not hiding it from someone who does.
      if (existingProfile?.onboarding_completed) {
        window.location.href = "/dashboard";
        return;
      }

      setStatus("ready");
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      checkAccess(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        window.location.href = "/";
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Independent of the session guard above — this only ever fills in blank
  // form fields, so it's safe to resolve on its own timeline and doesn't need
  // to block the "checking" -> "ready" transition.
  useEffect(() => {
    let mounted = true;
    if (!token) return;

    verifyWaitlistInvite(token).then((result) => {
      if (!mounted || !result.valid) return;
      const ownerName = [result.firstName, result.lastName].filter(Boolean).join(" ").trim();
      setPrefill({ ownerName, agencyName: result.agencyName || "" });
    });

    return () => {
      mounted = false;
    };
  }, [token]);

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" aria-label="Loading" />
      </div>
    );
  }

  // Land on the one-time "Reveal" page first (Agency Health overview) instead of jumping
  // straight to the full dashboard — see app/dashboard/reveal/page.tsx. Its own CTA button
  // is what actually sends the user on to "/dashboard" from there.
  return (
    <OnboardingWizard
      initialOwnerName={prefill?.ownerName}
      initialAgencyName={prefill?.agencyName}
      inviteToken={token || undefined}
      onSuccess={() => {
        window.location.href = "/dashboard/reveal";
      }}
    />
  );
}

export default function OnboardingPage() {
  // useSearchParams() requires a Suspense boundary in the App Router — see the
  // identical note in app/signup/page.tsx.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" aria-label="Loading" />
        </div>
      }
    >
      <OnboardingGate />
    </Suspense>
  );
}
