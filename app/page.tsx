"use client";

import React, { useEffect, useRef, useState, FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "../utils/supabase";
import { joinAgencyWithInviteCode } from "./actions/joinAgency";

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
  // Every redirect on this page is a hard `window.location.href` navigation,
  // never next/navigation's router — see the mount effect below for why. No
  // Next router instance is needed as a result.
  const [mode, setMode] = useState<"signin" | "signup" | "join">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  // supabase.auth.signUp() fires its own SIGNED_IN event once the session is
  // established — same as signInWithPassword. Without this flag, that event
  // would race the explicit window.location.href navigation in handleSubmit's
  // signup branch against this listener's own redirect, since both fire
  // almost simultaneously. Set right before either auth call, so the listener
  // knows "this SIGNED_IN came from our own form submit, which already owns
  // routing for it" and should stay hands-off.
  const submittingRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    // Safety net: if getSession() below never resolves (a stalled network
    // request, a browser extension interfering, etc.) this page must never
    // trap the user on the spinner with zero way to interact — fall through
    // to rendering the form after a few seconds no matter what.
    const stuckTimer = setTimeout(() => {
      if (mounted) setCheckingSession(false);
    }, 4000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      clearTimeout(stuckTimer);
      if (session) {
        // Hard navigation, not router.replace(): /dashboard is gated by
        // proxy.ts, which re-validates the session server-side (getUser())
        // against real request cookies. A client-side SPA transition can
        // fire a beat before a just-written auth cookie is fully attached to
        // the next request, so proxy.ts bounces it back to "/" — which
        // immediately sees a session again via this same getSession() call
        // and retries, producing a rapid "/" <-> "/dashboard" loop that
        // looks exactly like an infinite spinner. A full navigation always
        // carries whatever cookies are actually in the jar at request time,
        // so there's no window for that race to exist in the first place.
        window.location.href = "/dashboard";
        return;
      }
      setCheckingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session && !submittingRef.current) {
        window.location.href = "/dashboard";
      }
    });

    return () => {
      mounted = false;
      clearTimeout(stuckTimer);
      subscription.unsubscribe();
    };
  }, []);

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

        // Hard navigation — see the mount effect's comment above for why
        // router.push()/router.replace() can race proxy.ts's server-side
        // cookie check and bounce back to "/", looking like a hung spinner.
        window.location.href = "/onboarding";
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) throw signInError;

      window.location.href = "/dashboard";
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

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    submittingRef.current = true;

    try {
      const trimmedInviteCode = inviteCode.trim();
      if (!trimmedInviteCode) {
        throw new Error("Please enter your agency's invite code.");
      }

      // Reuse an existing session if this is a retry after an earlier failed
      // invite code (e.g. a typo) — supabase.auth.signUp() would otherwise
      // error out on "already registered" for the account we already created
      // on the first attempt.
      const {
        data: { session: existingSession },
      } = await supabase.auth.getSession();
      let accessToken = existingSession?.access_token;

      if (!accessToken) {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        accessToken = signUpData.session?.access_token;
      }

      if (!accessToken) {
        throw new Error("Account created, but we couldn't establish your session. Please try signing in.");
      }

      const result = await joinAgencyWithInviteCode({
        accessToken,
        inviteCode: trimmedInviteCode,
        fullName: fullName.trim(),
      });

      if (!result.success) {
        throw new Error(result.error || "That invite code didn't work. Please double-check it and try again.");
      }

      // Hard navigation — see the mount effect's comment above.
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      // Failed — the account may already exist (created on this attempt or a
      // prior one) with a live session but no profile row yet, which is
      // exactly the same "not fully set up" shape /dashboard's own gatekeeper
      // already knows how to handle. Let the listener resume normal behavior
      // so nothing here fights that if the user navigates away instead of
      // retrying the code.
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
  const isJoin = mode === "join";

  const switchMode = (next: "signin" | "signup" | "join") => {
    setMode(next);
    setError("");
  };

  const tabs: { id: "signin" | "signup" | "join"; label: string }[] = [
    { id: "signin", label: "Sign In" },
    { id: "signup", label: "Create Agency" },
    { id: "join", label: "Join a Team" },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-800/90 p-8 shadow-2xl shadow-black/40">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">Centravity</h1>
          <p className="mt-2 text-sm text-slate-400">
            {isSignup
              ? "Create your agency's account"
              : isJoin
              ? "Join your agency's existing scoreboard"
              : "Sign in to your agency scoreboard"}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-1 rounded-lg bg-slate-900/80 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchMode(tab.id)}
              disabled={isLoading}
              className={`rounded-md px-2 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm ${
                mode === tab.id
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        {isJoin ? (
          <form onSubmit={handleJoinSubmit} className="space-y-5">
            <div>
              <label htmlFor="fullName" className="mb-1.5 block text-sm font-medium text-slate-300">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isLoading}
                className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
                placeholder="Jane Producer"
              />
            </div>

            <div>
              <label htmlFor="join-email" className="mb-1.5 block text-sm font-medium text-slate-300">
                Email
              </label>
              <input
                id="join-email"
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
              <label htmlFor="join-password" className="mb-1.5 block text-sm font-medium text-slate-300">
                Password
              </label>
              <input
                id="join-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="inviteCode" className="mb-1.5 block text-sm font-medium text-slate-300">
                Invite Code
              </label>
              <input
                id="inviteCode"
                type="text"
                required
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                disabled={isLoading}
                className="block w-full rounded-lg border border-slate-600 bg-slate-900/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/40 disabled:opacity-60 font-mono"
                placeholder="Ask your agency admin for this code"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Your agency admin can find this under Settings → Team.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Joining team…
                </>
              ) : (
                "Join Team"
              )}
            </button>
          </form>
        ) : (
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
        )}
      </div>
    </div>
  );
}
