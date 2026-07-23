"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "../../utils/supabase";
import OnboardingWizard from "../../components/OnboardingWizard";

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
// =============================================================================

export default function OnboardingPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ready">("checking");

  useEffect(() => {
    let mounted = true;

    const checkAccess = async (session: any) => {
      if (!session?.user?.id) {
        router.replace("/");
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
        router.replace("/dashboard");
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
        router.replace("/");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

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
  return <OnboardingWizard onSuccess={() => router.replace("/dashboard/reveal")} />;
}
