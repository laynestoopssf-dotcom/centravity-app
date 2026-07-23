"use client";

import React, { useEffect, useRef, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { supabase } from "../utils/supabase";

// =============================================================================
// "/" — standard login / signup page ONLY.
// -----------------------------------------------------------------------------
// This page never renders OnboardingWizard directly, and never decides on its
// own whether a user needs onboarding — it just gets them authenticated and
// hands off to /dashboard, which owns the "is this account fully set up?"
// gatekeeper check (see app/dashboard/page.tsx fetchProfile). If it isn't,
// /dashboard redirects to /onboarding itself. Keeping that decision in one
// place (the dashboard's gatekeeper) means both this page AND the dashboard's
// own legacy inline registration form funnel through the same check.
// =============================================================================

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  // supabase.auth.signUp() fires its own SIGNED_IN event once the session is
  // established — same as signInWithPassword. Without this flag, that event
  // would race the explicit router.push("/onboarding") in handleSubmit's signup
  // branch against this listener's router.replace("/dashboard"), since both
  // fire almost simultaneously. Set right before either auth call, so the
  // listener knows "this SIGNED_IN came from our own form submit, which already
  // owns routing for it" and should stay hands-off.
  const submittingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        router.replace("/dashboard");
        return;
      }
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && !submittingRef.current) {
        router.replace("/dashboard");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    submittingRef.current = true;

    try {
      if (mode === "signup") {
        // Deliberately bare: only creates the auth.users row. No agency, no
        // profile fields, and — critically — no `profiles` row at all yet either
        // (nothing here inserts one). Route straight to /onboarding instead of
        // /dashboard: fetchProfile's gatekeeper would otherwise have to correctly
        // interpret "0 rows" as "brand new, not an error", and there's no reason
        // to make it guess when we already know exactly why the row is missing.
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (signUpError) throw signUpError;

        router.push("/onboarding");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) throw signInError;

      router.replace("/dashboard");
    } catch (err: unknown) {
      // Failed — we're not navigating away, so let the listener resume normal
      // behavior for any future auth events (e.g. a stray session restore).
      submittingRef.current = false;
      const message =
        err instanceof Error ? err.message : "Unable to continue. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" aria-label="Loading" />
      </div>
    );
  }

  const isSignup = mode === "signup";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-800/90 p-8 shadow-2xl shadow-black/40">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">Centravity</h1>
          <p className="mt-2 text-sm text-slate-400">
            {isSignup ? "Create your agency's account" : "Sign in to your agency scoreboard"}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
              placeholder="you@agency.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={isSignup ? 6 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                {isSignup ? "Creating account…" : "Signing in…"}
              </>
            ) : isSignup ? (
              "Create Account"
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          {isSignup ? (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signin");
                  setError("");
                }}
                className="font-medium text-blue-400 hover:text-blue-300"
              >
                Sign in
              </button>
            </>
          ) : (
            <>
              Setting up a new agency?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError("");
                }}
                className="font-medium text-blue-400 hover:text-blue-300"
              >
                Create an account
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
