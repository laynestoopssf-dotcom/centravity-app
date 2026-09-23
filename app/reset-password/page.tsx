"use client";

import React, { useEffect, useState, FormEvent, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, AlertCircle, KeyRound } from "lucide-react";
import { supabase } from "../../utils/supabase";

// =============================================================================
// "/reset-password" — the password recovery "Token Catcher".
// -----------------------------------------------------------------------------
// Reached from the "Forgot your password?" link on "/" -> supabase.auth
// .resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` }).
// utils/supabase.ts's createBrowserClient hardcodes flowType: 'pkce' (that's
// @supabase/ssr's own default, not ours), so the recovery email's link lands
// here as `?code=...&type=recovery` in the URL *query string* — never a
// `#access_token=...` hash; that was the legacy implicit-flow shape and
// Supabase never sends it to a PKCE-flow client. The Supabase client
// auto-detects that `code` param and exchanges it for a real session on
// load, firing a `PASSWORD_RECOVERY` auth event as it does. This page's only
// job is to catch that event, show a "set a new password" form, and call
// supabase.auth.updateUser({ password }) — same call the legacy inline
// dashboard recovery flow already used (see app/dashboard/page.tsx's
// handleUpdatePassword) — then hand off to /dashboard.
//
// Deliberately its own route rather than reusing "/" or the dashboard's
// legacy inline auth: proxy.ts doesn't gate this path (see PROTECTED_PREFIXES
// and the /reset-password carve-out in proxy.ts's stale-session signOut()
// cleanup — that cleanup unconditionally deletes the PKCE code_verifier
// cookie this exchange needs, so it must never run on this route), so the
// exchange can complete before any auth-based redirect has a chance to race
// it, and "/" 's own onAuthStateChange listener (which hard-navigates any
// SIGNED_IN straight to /dashboard) never gets a chance to intercept a
// recovery session before the user has actually set a new password.
// =============================================================================

type CatcherStatus = "checking" | "invalid" | "ready" | "success";

function ResetPasswordCatcher() {
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<CatcherStatus>("checking");
  const [linkError, setLinkError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Supabase's own /auth/v1/verify hop rejects a truly expired or
    // already-used recovery token before it ever reaches us, redirecting
    // back here with `?error=access_denied&error_code=otp_expired&...` as
    // plain query params — PKCE links never carry anything in the hash, so
    // there's nothing to parse out of window.location.hash anymore.
    const errorDescription = searchParams.get("error_description");
    const hasUrlError = !!(searchParams.get("error") || searchParams.get("error_code") || errorDescription);
    const code = searchParams.get("code");

    if (hasUrlError) {
      setLinkError(errorDescription?.replace(/\+/g, " ") || "This password reset link is invalid or has expired.");
      setStatus("invalid");
      return;
    }

    if (!code) {
      // No `code` and no `error` param at all — there is nothing for the
      // Supabase client to exchange, so only an already-live session (e.g.
      // this tab already completed a recovery earlier) can save this load.
      // Resolve immediately instead of burning the 4s timeout below on a
      // page load that was never going to succeed.
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!mounted) return;
        if (session) {
          setStatus("ready");
        } else {
          setStatus("invalid");
          setLinkError("This password reset link is invalid, expired, or already used.");
        }
      });
      return () => {
        mounted = false;
      };
    }

    // A `code` IS present — let the Supabase client's own PKCE exchange run
    // automatically (see utils/supabase.ts's flowType: 'pkce' and
    // detectSessionInUrl) and just catch its result here. The exchange may
    // already have resolved by the time this effect runs, in which case the
    // PASSWORD_RECOVERY event fired before this listener existed to catch
    // it — so also check for an already-live session up front instead of
    // relying on the event alone.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && session) setStatus("ready");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    // Last-resort fallback for this branch only: a PKCE exchange can still
    // fail silently (the code was already single-use consumed, or its
    // code_verifier cookie is missing/mismatched) without ever throwing
    // anywhere this page can catch or firing any auth event at all. If
    // neither a live session nor PASSWORD_RECOVERY shows up in a reasonable
    // window, treat it as a dead link.
    const timer = setTimeout(() => {
      if (mounted) {
        setStatus((prev) => (prev === "checking" ? "invalid" : prev));
        setLinkError((prev) => prev || "This password reset link is invalid, expired, or already used.");
      }
    }, 4000);

    return () => {
      mounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, [searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError("");

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
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus("success");
      // Hard navigation — proxy.ts re-validates the session server-side from
      // request cookies; see the identical note in app/page.tsx.
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to update your password. Please try again.";
      setFormError(message);
      setIsSubmitting(false);
    }
  };

  if (status === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-label="Verifying your reset link" />
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
          <h1 className="text-xl font-bold text-white">Invalid or Expired Link</h1>
          <p className="mt-2 text-sm text-slate-400">{linkError}</p>
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

  if (status === "success") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-800/90 p-8 text-center shadow-2xl shadow-black/40">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <KeyRound className="h-6 w-6 text-emerald-400" aria-hidden />
          </div>
          <h1 className="text-xl font-bold text-white">Password Updated!</h1>
          <p className="mt-2 text-sm text-slate-400">Taking you to your dashboard…</p>
          <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin text-blue-500" aria-hidden />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-800/90 p-8 shadow-2xl shadow-black/40">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10">
            <KeyRound className="h-6 w-6 text-blue-400" aria-hidden />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Set a New Password</h1>
          <p className="mt-2 text-sm text-slate-400">Choose a new password for your account.</p>
        </div>

        {formError && (
          <div role="alert" className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-sm font-medium text-slate-300">
              New Password
            </label>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label htmlFor="reset-confirm-password" className="mb-1.5 block text-sm font-medium text-slate-300">
              Confirm New Password
            </label>
            <input
              id="reset-confirm-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={isSubmitting}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
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
                Updating…
              </>
            ) : (
              "Update Password"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// useSearchParams() opts this subtree into client-side rendering up to the
// nearest Suspense boundary (see Next's useSearchParams docs) — wrapping it
// here (rather than relying on the page being fully dynamic) is what Next
// requires so `next build` doesn't fail with "Missing Suspense boundary
// with useSearchParams".
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-900">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-label="Loading" />
        </div>
      }
    >
      <ResetPasswordCatcher />
    </Suspense>
  );
}
