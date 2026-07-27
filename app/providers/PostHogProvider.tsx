"use client";

import type { ReactNode } from "react";
import { PostHogProvider as PHProvider } from "posthog-js/react";

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

// Product analytics + session replay for the whole app (Cockpit, Settings, Reveal, etc.).
// `posthog-js/react`'s <PostHogProvider apiKey={...}> initializes posthog.init() for us,
// client-side only, inside its own effect (guarded against double-init across Fast Refresh /
// remounts) — no manual posthog.init() call or useEffect needed here.
export default function PostHogProvider({ children }: { children: ReactNode }) {
  // Analytics is optional infra: never block rendering (e.g. local dev without the env var, or
  // a misconfigured deploy) — just skip instrumentation entirely.
  if (!POSTHOG_KEY) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[PostHog] NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN is not set — analytics disabled.");
    }
    return <>{children}</>;
  }

  return (
    <PHProvider
      apiKey={POSTHOG_KEY}
      options={{
        api_host: POSTHOG_HOST,
        // 'history_change' captures the initial load AND every client-side route change —
        // Next.js App Router navigation (<Link>, router.push) uses the History API under the
        // hood, so every route (Dashboard, Cockpit, Settings, Reveal, ...) is tracked
        // automatically without a manual usePathname/useSearchParams listener.
        capture_pageview: "history_change",
        capture_pageleave: true,
        // Session Replay — recorded for every session by default; revisit sampling/input
        // masking in PostHog → Project Settings → Session Replay if this gets noisy or costly.
        disable_session_recording: false,
        person_profiles: "identified_only",
      }}
    >
      {children}
    </PHProvider>
  );
}
