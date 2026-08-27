"use client";

import React, { useEffect, useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "../../utils/supabase";
import { verifyWaitlistInvite } from "../actions/waitlist";
import PasswordInput from "../../components/ui/PasswordInput";

// =============================================================================
// "/signup" — the waitlist invite "Token Catcher".
// -----------------------------------------------------------------------------
// An admin approving someone on the waitlist sends an email whose link points
// here with a `?token=...` (public.waitlist.invite_token — see
// app/actions/waitlist.ts for why that table's lookup has to happen
// server-side). This page:
//   1. Reads `token` from the URL.
//   2. Verifies it against the waitlist (must exist AND be status: 'approved').
//   3. Valid  -> shows a locked/pre-filled email + a password-only form, then
//      creates the real auth.users row (supabase.auth.signUp) and hands off
//      to /onboarding exactly like "/"'s own "Create Agency" tab does.
//   4. Invalid/missing -> a clean "Invalid or expired invite link" state with
//      a way back to the normal sign-in page.
//
// Deliberately its own route rather than folding into "/" — that page is
// reachable at any time with no token and already owns a 3-tab (Sign In /
// Create Agency / Join a Team) flow; a verified-invite flow has different
// pre-conditions (email is already known and trusted) and error states, so
// keeping it separate avoids overloading "/"'s mode switch with a fourth,
// token-gated variant.
// =============================================================================

type CatcherStatus = "checking" | "invalid" | "valid";

interface VerifiedInvite {
  email: string;
  firstName: string;
  lastName: string;
  agencyName: string;
}

function SignupCatcher() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();

  const [status, setStatus] = useState<CatcherStatus>("checking");
  const [invite, setInvite] = useState<VerifiedInvite | null>(null);
  const [inviteError, setInviteError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (!token) {
      setInviteError("This invite link is missing its token.");
      setStatus("invalid");
      return;
    }

    verifyWaitlistInvite(token).then((result) => {
      if (!mounted) return;
      if (!result.valid || !result.email) {
        setInviteError(result.error || "Invalid or expired invite link.");
        setStatus("invalid");
        return;
      }
      setInvite({
        email: result.email,
        firstName: result.firstName || "",
        lastName: result.lastName || "",
        agencyName: result.agencyName || "",
      });
      setStatus("valid");
    });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!invite) return;
    if (password.length < 6) {
      setFormError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      // Bare signUp, exactly like "/"'s "Create Agency" tab — only creates the
      // auth.users row. No agency/profile row exists yet; /onboarding's own
      // gatekeeper (app/dashboard/page.tsx fetchProfile / proxy.ts) already
      // knows how to treat "authenticated but no profile" as "run the wizard".
      const { error: signUpError } = await supabase.auth.signUp({
        email: invite.email,
        password,
      });
      if (signUpError) throw signUpError;

      // Hard navigation (not next/navigation's router) — proxy.ts re-validates
      // the session server-side from request cookies, and a client-side SPA
      // transition can race a just-written auth cookie, bouncing back to "/".
      // See the identical note in app/page.tsx's handleSubmit.
      //
      // The verified token rides along in the query string so /onboarding can
      // read it later if useful (e.g. prefilling agency/owner name from the
      // waitlist row, or marking it converted) — it doesn't consume it today,
      // this just keeps that door open without an extra round trip here.
      window.location.href = `/onboarding?token=${encodeURIComponent(token)}`;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Unable to create your account. Please try again.";
      setFormError(message);
      setIsSubmitting(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-label="Verifying your invite" />
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-800/90 p-8 text-center shadow-2xl shadow-black/40">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle className="h-6 w-6 text-red-400" aria-hidden />
          </div>
          <h1 className="text-xl font-bold text-white">Invalid or Expired Invite</h1>
          <p className="mt-2 text-sm text-slate-400">{inviteError}</p>
          <a
            href="/"
            className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500"
          >
            Return to Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-800/90 p-8 shadow-2xl shadow-black/40">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" aria-hidden />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">You're Approved!</h1>
          <p className="mt-2 text-sm text-slate-400">
            {invite?.agencyName
              ? `Set a password to finish setting up ${invite.agencyName}.`
              : "Set a password to finish creating your account."}
          </p>
        </div>

        {formError && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              value={invite?.email || ""}
              readOnly
              disabled
              className="block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3.5 py-2.5 text-sm text-slate-400 outline-none"
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-slate-300">
              Create a Password
            </label>
            <PasswordInput
              id="signup-password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
              iconClassName="text-slate-500 hover:text-slate-300"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="signup-confirm-password" className="mb-1.5 block text-sm font-medium text-slate-300">
              Confirm Password
            </label>
            <PasswordInput
              id="signup-confirm-password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 pr-10 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
              iconClassName="text-slate-500 hover:text-slate-300"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Creating account…
              </>
            ) : (
              "Create Account & Continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SignupPage() {
  // useSearchParams() requires a Suspense boundary in the App Router (it
  // otherwise forces the whole route into a client-side-only render with a
  // build warning) - the fallback below only ever flashes for a moment since
  // this route has no server data to wait on.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-label="Loading" />
        </div>
      }
    >
      <SignupCatcher />
    </Suspense>
  );
}
