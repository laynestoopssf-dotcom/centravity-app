"use client";

import React, { useEffect, useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "../../utils/supabase";
import { verifyTeamInvite, acceptTeamInvite } from "../actions/teamInvites";
import PasswordInput from "../../components/ui/PasswordInput";

// =============================================================================
// "/accept-invite" — the Team Member Invite "Token Catcher".
// -----------------------------------------------------------------------------
// An owner/admin inviting someone from Settings -> Team (see
// components/SettingsTab.tsx's Invite Team Member modal ->
// app/actions/teamInvites.ts createTeamInvite) triggers an email whose CTA
// points here with a `?token=...` (public.agency_invites.invite_token). This
// page:
//   1. Reads `token` from the URL.
//   2. Verifies it against agency_invites (must exist AND be status: 'pending').
//   3. Valid   -> shows a locked/pre-filled email, editable name, and a
//      password-only form. Submitting calls acceptTeamInvite(), which does
//      ALL the account creation server-side (auth.users + profiles, already
//      carrying the role/office the inviter picked) — unlike "/signup",
//      which only does a bare auth.signUp() and lets /onboarding build the
//      profile afterward. There's no wizard step for an invited team member
//      to run, so this signs them in and drops them straight on /dashboard.
//   4. Invalid/missing -> a clean "Invalid or expired invite link" state with
//      a way back to the normal sign-in page.
//
// Deliberately its own route, separate from "/signup" (the waitlist-owner
// catcher) — different table, different post-accept destination (straight to
// /dashboard, not /onboarding), and a different account-creation mechanism
// (server-side admin.createUser vs. client-side auth.signUp).
// =============================================================================

type CatcherStatus = "checking" | "invalid" | "valid";

interface VerifiedInvite {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  agencyName: string;
}

const ROLE_LABELS: Record<string, string> = { admin: "Admin", manager: "Manager", producer: "Producer", service: "Service & Retention", bookkeeper: "Bookkeeper" };

function AcceptInviteCatcher() {
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();

  const [status, setStatus] = useState<CatcherStatus>("checking");
  const [invite, setInvite] = useState<VerifiedInvite | null>(null);
  const [inviteError, setInviteError] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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

    verifyTeamInvite(token).then((result) => {
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
        role: result.role || "producer",
        agencyName: result.agencyName || "",
      });
      setFirstName(result.firstName || "");
      setLastName(result.lastName || "");
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
      const result = await acceptTeamInvite({ token, password, firstName: firstName.trim(), lastName: lastName.trim() });
      if (!result.success) throw new Error(result.error || "Unable to create your account. Please try again.");

      // acceptTeamInvite already created the real auth.users + profiles rows
      // server-side (via the admin API) — this client only needs to sign in
      // as that brand-new user to get a real session/cookies before landing
      // on /dashboard.
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: invite.email, password });
      if (signInError) throw signInError;

      // Hard navigation (not next/navigation's router) — proxy.ts re-validates
      // the session server-side from request cookies, and a client-side SPA
      // transition can race a just-written auth cookie. See the identical
      // note in app/signup/page.tsx and app/page.tsx's handleSubmit.
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to create your account. Please try again.";
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
          <h1 className="text-3xl font-bold tracking-tight text-white">You're Invited!</h1>
          <p className="mt-2 text-sm text-slate-400">
            {invite?.agencyName
              ? `Set a password to join ${invite.agencyName} as a ${ROLE_LABELS[invite.role] || invite.role}.`
              : "Set a password to finish creating your account."}
          </p>
        </div>

        {formError && (
          <div role="alert" className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="accept-invite-email" className="mb-1.5 block text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              id="accept-invite-email"
              type="email"
              value={invite?.email || ""}
              readOnly
              disabled
              className="block w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3.5 py-2.5 text-sm text-slate-400 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="accept-invite-first-name" className="mb-1.5 block text-sm font-medium text-slate-300">
                First Name
              </label>
              <input
                id="accept-invite-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isSubmitting}
                className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
              />
            </div>
            <div>
              <label htmlFor="accept-invite-last-name" className="mb-1.5 block text-sm font-medium text-slate-300">
                Last Name
              </label>
              <input
                id="accept-invite-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isSubmitting}
                className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
              />
            </div>
          </div>

          <div>
            <label htmlFor="accept-invite-password" className="mb-1.5 block text-sm font-medium text-slate-300">
              Create a Password
            </label>
            <PasswordInput
              id="accept-invite-password"
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
            <label htmlFor="accept-invite-confirm-password" className="mb-1.5 block text-sm font-medium text-slate-300">
              Confirm Password
            </label>
            <PasswordInput
              id="accept-invite-confirm-password"
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
              "Accept Invite & Continue"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  // useSearchParams() requires a Suspense boundary in the App Router — see
  // the identical note in app/signup/page.tsx.
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-label="Loading" />
        </div>
      }
    >
      <AcceptInviteCatcher />
    </Suspense>
  );
}
