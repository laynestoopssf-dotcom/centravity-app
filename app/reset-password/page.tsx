"use client";

import React, { useEffect, useState, FormEvent } from "react";
import { Loader2, AlertCircle, KeyRound } from "lucide-react";
import { supabase } from "../../utils/supabase";

// =============================================================================
// "/reset-password" — the password recovery "Token Catcher".
// -----------------------------------------------------------------------------
// Reached from the "Forgot your password?" link on "/" -> supabase.auth
// .resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` }).
// The recovery email's link lands here with the session tokens in the URL
// *hash* (`#access_token=...&type=recovery`), which @supabase/ssr's
// createBrowserClient auto-detects and exchanges into a real session on
// load, firing a `PASSWORD_RECOVERY` auth event as it does. This page's only
// job is to catch that event, show a "set a new password" form, and call
// supabase.auth.updateUser({ password }) — same call the legacy inline
// dashboard recovery flow already used (see app/dashboard/page.tsx's
// handleUpdatePassword) — then hand off to /dashboard.
//
// Deliberately its own route rather than reusing "/" or the dashboard's
// legacy inline auth: proxy.ts doesn't gate this path (see PROTECTED_PREFIXES
// in proxy.ts), so the hash can be processed before any auth-based redirect
// has a chance to race it, and "/" 's own onAuthStateChange listener (which
// hard-navigates any SIGNED_IN straight to /dashboard) never gets a chance to
// intercept a recovery session before the user has actually set a new
// password.
// =============================================================================

type CatcherStatus = "checking" | "invalid" | "ready" | "success";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<CatcherStatus>("checking");
  const [linkError, setLinkError] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Supabase surfaces an expired/already-used recovery link as
    // `#error=access_denied&error_code=otp_expired&...` instead of a normal
    // session — no PASSWORD_RECOVERY event will ever fire for this case.
    const hash = window.location.hash;
    if (hash.includes("error=")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      setLinkError(params.get("error_description")?.replace(/\+/g, " ") || "This password reset link is invalid or has expired.");
      setStatus("invalid");
      return;
    }

    // The hash may already have been processed (and the session established)
    // by the time this effect runs, in which case the PASSWORD_RECOVERY event
    // fired before this listener existed to catch it — so also check for an
    // already-live session up front instead of relying on the event alone.
    const isRecoveryLink = hash.includes("type=recovery");
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted && isRecoveryLink && session) setStatus("ready");
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });

    // Neither the hash-based session check nor a PASSWORD_RECOVERY event ever
    // resolved (e.g. someone navigated here directly with no token at all) —
    // don't leave the user staring at a spinner forever.
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
  }, []);

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
