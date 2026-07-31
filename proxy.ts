import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./utils/supabaseEnv";

// =============================================================================
// Beta onboarding routing interceptor.
// -----------------------------------------------------------------------------
// NOTE: this file is named `proxy.ts`, not `middleware.ts`. Next.js 16 renamed
// the `middleware` file convention to `proxy` (same file-based hook, same
// execution model — it still runs before routes render — just a different
// filename/export name). `middleware.ts` is deprecated in this Next.js version
// and won't be picked up. See node_modules/next/dist/docs/01-app/03-api-reference/
// 03-file-conventions/proxy.md.
//
// RUNTIME NOTE: the user's original ask was to "optimize this for the Edge
// runtime." As of Next.js 16, Proxy always runs on the Node.js runtime — the
// `runtime` route-segment config isn't available in proxy files at all
// (setting it throws a build error). There's no Edge opt-in anymore for this
// file convention, so this intentionally runs on Node.js — which is actually
// friendlier for the Supabase JS client than the old Edge runtime was.
//
// WHY THIS ONLY WORKS BECAUSE OF utils/supabase.ts's createBrowserClient
// SWITCH: this proxy reads the Supabase session from cookies. Before this
// change, utils/supabase.ts used a plain @supabase/supabase-js createClient(),
// which only persists sessions to localStorage — invisible to any server-side
// code, proxy included. Cookies are now the source of truth for auth state;
// see that file's comments for the one-time re-login this migration causes
// for anyone with a pre-existing localStorage-only session.
//
// GATE LOGIC — mirrors (and centralizes) the two existing client-side checks
// this app already had in app/dashboard/page.tsx (fetchProfile's onboarding
// gatekeeper) and app/onboarding/page.tsx (the wizard's own guard), rather
// than inventing a new source of truth: the completion flag lives on
// `profiles.onboarding_completed` (set at the end of Step 5 —
// see app/actions/onboarding.ts saveStep5Goals), scoped to `role === 'owner'`
// only, since team members never run the wizard themselves and have no
// onboarding of their own to complete. (The task description suggested
// checking `agencies.office_id` / an `agencies`-level flag — this app's actual
// source of truth is the owner's own `profiles` row, so that's what's used
// here to stay consistent with the rest of the app instead of introducing a
// second, divergent definition of "onboarded.")
//
// A profile row that doesn't exist yet at all (a beta invite Layne just sent
// via Supabase Auth — that only creates the auth.users row, no profiles row)
// is treated the same as "incomplete": send them to /onboarding so they can
// run the wizard as the owner of their brand-new agency, same as
// app/dashboard/page.tsx's fetchProfile already does for a missing row.
//
// Both existing client-side checks are left in place as defense-in-depth —
// Next's own guidance is that Proxy should do "optimistic" auth checks and
// not be the sole authorization boundary (see the "Optimistic checks with
// Proxy" section of the authentication guide linked above).
// =============================================================================

// /logger (the pop-out Quick Actions window - see app/logger/page.tsx) is gated the same as
// /dashboard/onboarding: it's only ever reached via a window.open() from an already-authenticated
// dashboard session, and it directly triggers real activity-logging actions in that opener via
// postMessage, so it must never render for a signed-out visitor.
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/logger"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

  // Wraps NextResponse.redirect() so any cookies already written onto
  // `response` below (via setAll(), e.g. a rotated/refreshed auth token from
  // supabase.auth.getUser() further down) survive the redirect instead of
  // being silently dropped.
  //
  // THIS WAS THE ROOT CAUSE of a persistent "/" <-> "/dashboard" redirect
  // loop: a request arriving with an expiring access token makes getUser()
  // refresh it — Supabase refresh tokens are single-use/rotating, so the OLD
  // one is invalidated server-side the instant the NEW one is issued. A bare
  // `NextResponse.redirect(...)` is a brand-new response object with no
  // memory of that refreshed cookie, so the browser never actually receives
  // the replacement token and is left holding one that's already been burned.
  // The very next request then fails authentication outright — not a
  // one-off hiccup, but a self-sustaining loop, since every single pass
  // through this exact path burns the current refresh token without ever
  // successfully delivering its replacement back to the browser.
  function redirectTo(destination: string): NextResponse {
    const redirectResponse = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // TEMPORARY DIAGNOSTIC LOGGING — every branch below logs a single
  // "[MIDDLEWARE TRACE]" line with the full decision state at that point, so
  // a persistent redirect loop shows up unambiguously in Vercel's function
  // logs as a rapidly repeating pattern instead of us having to guess at it
  // from client-side symptoms alone. Safe to strip once the live loop is
  // confirmed fixed — it's on every request, so it's chatty by design.
  const trace = (fields: Record<string, unknown>) => {
    console.log("[MIDDLEWARE TRACE]", JSON.stringify({ path: pathname, ...fields }));
  };

  try {
    // Auth Check — getUser() actually validates the JWT against Supabase's Auth
    // server rather than trusting a locally-decoded cookie, which is why this
    // (not getSession()) is the correct call to make here.
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    const routeIsProtected = isProtectedPath(pathname);

    if (!user) {
      const destination = routeIsProtected ? "/" : "(none — pass through)";

      // authError present (as opposed to simply no cookie at all) means the
      // browser IS holding a session — it's just permanently invalid (e.g.
      // "User from sub claim in JWT does not exist": a valid, correctly
      // signed token for a user that's since been deleted from auth.users,
      // most likely a leftover from earlier test-account cleanup). That
      // token will never become valid again no matter how many times it's
      // resent, so it must be actively cleared here.
      //
      // THIS WAS THE ROOT CAUSE of the persistent "/" <-> "/dashboard" loop
      // surviving the earlier hard-navigation and cookie-preservation fixes:
      // /dashboard's getUser() (server-side, actually validates against
      // Supabase) correctly rejects the dead session every time and bounces
      // to "/" — but "/"'s own client-side getSession() only ever decodes
      // the cookie locally, never revalidating it against the server, so it
      // still "sees" that same dead session and immediately fires
      // window.location.href back to "/dashboard". Neither hard navigation
      // nor redirect-cookie-preservation touches this, because the session
      // itself — not the navigation method — is the problem: nothing was
      // ever clearing the broken cookie, so it just gets resent forever.
      // signOut() is specifically built to handle this: per
      // @supabase/auth-js's GoTrueClient._signOut, a 401/403/404 from the
      // remote revocation call is explicitly ignored ("user might not exist
      // anymore") and the local cookie is cleared regardless — exactly this
      // scenario. { scope: "local" } skips trying to revoke a token that's
      // already meaningless server-side and only clears this browser's copy.
      if (authError) {
        await supabase.auth.signOut({ scope: "local" });
      }

      trace({
        hasSession: false,
        authError: authError?.message || null,
        authErrorStatus: (authError as { status?: number } | null)?.status ?? null,
        clearedStaleCookie: !!authError,
        routeIsProtected,
        redirectingTo: destination,
      });
      if (routeIsProtected) {
        return redirectTo("/");
      }
      return response;
    }

    // Only the two gated routes need the extra `profiles` round-trip — every
    // other request (including the login/marketing page for an already-signed-in
    // user) just gets the refreshed session cookies and moves on, per Next's
    // guidance to keep Proxy's DB usage to a minimum since it runs on every
    // navigation, including prefetches.
    if (!routeIsProtected) {
      trace({ hasSession: true, userId: user.id, routeIsProtected: false, redirectingTo: "(none — pass through)" });
      return response;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, onboarding_completed, onboarding_step, agency_id, office_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      // Fail open — don't turn a transient DB blip into a redirect loop. The
      // client-side gatekeepers (dashboard/onboarding pages) still run as a
      // second line of defense.
      console.error("[Proxy] profile lookup failed", profileError);
      trace({ hasSession: true, userId: user.id, hasProfile: null, profileError: profileError.message, redirectingTo: "(none — fail open)" });
      return response;
    }

    // NOTE: this intentionally does NOT check office_id — a producer with a
    // profiles row but a null office_id (e.g. joinAgency's fallback office
    // creation failing) is still considered fully onboarded here. Gating on
    // office_id too would send producers into the owner-only wizard they have
    // no way to complete, trading a data-completeness bug for an unescapable
    // redirect loop, which is strictly worse.
    const needsOnboarding =
      !profile || (profile.role === "owner" && typeof profile.onboarding_step === "number" && !profile.onboarding_completed);

    if (pathname.startsWith("/dashboard") && needsOnboarding) {
      trace({
        hasSession: true,
        userId: user.id,
        hasProfile: !!profile,
        role: profile?.role ?? null,
        agencyId: profile?.agency_id ?? null,
        officeId: profile?.office_id ?? null,
        onboardingCompleted: profile?.onboarding_completed ?? null,
        needsOnboarding: true,
        redirectingTo: "/onboarding",
      });
      return redirectTo("/onboarding");
    }

    if (pathname.startsWith("/onboarding") && !needsOnboarding) {
      trace({
        hasSession: true,
        userId: user.id,
        hasProfile: !!profile,
        role: profile?.role ?? null,
        onboardingCompleted: profile?.onboarding_completed ?? null,
        needsOnboarding: false,
        redirectingTo: "/dashboard",
      });
      return redirectTo("/dashboard");
    }

    trace({
      hasSession: true,
      userId: user.id,
      hasProfile: !!profile,
      role: profile?.role ?? null,
      needsOnboarding,
      redirectingTo: "(none — pass through)",
    });
    return response;
  } catch (err) {
    // Fail open, same rationale as the profileError branch above: an
    // unexpected throw here (e.g. the fetch to Supabase's Auth server itself
    // failing) must never turn into a hard proxy crash — or worse, a
    // redirect that a client-side retry then hits again and again, which is
    // its own flavor of the exact loop this file exists to prevent.
    console.error("[Proxy] unexpected error", err);
    trace({ unexpectedError: err instanceof Error ? err.message : String(err), redirectingTo: "(none — fail open)" });
    return response;
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon-.*\\.png|apple-icon.*\\.png|sitemap.xml|robots.txt|manifest.json).*)",
  ],
};
