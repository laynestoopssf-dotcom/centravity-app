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

const PROTECTED_PREFIXES = ["/dashboard", "/onboarding"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let response = NextResponse.next({ request });

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

  // Auth Check — getUser() actually validates the JWT against Supabase's Auth
  // server rather than trusting a locally-decoded cookie, which is why this
  // (not getSession()) is the correct call to make here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const routeIsProtected = isProtectedPath(pathname);

  if (!user) {
    if (routeIsProtected) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  // Only the two gated routes need the extra `profiles` round-trip — every
  // other request (including the login/marketing page for an already-signed-in
  // user) just gets the refreshed session cookies and moves on, per Next's
  // guidance to keep Proxy's DB usage to a minimum since it runs on every
  // navigation, including prefetches.
  if (!routeIsProtected) {
    return response;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, onboarding_completed, onboarding_step")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    // Fail open — don't turn a transient DB blip into a redirect loop. The
    // client-side gatekeepers (dashboard/onboarding pages) still run as a
    // second line of defense.
    console.error("[Proxy] profile lookup failed", profileError);
    return response;
  }

  const needsOnboarding =
    !profile || (profile.role === "owner" && typeof profile.onboarding_step === "number" && !profile.onboarding_completed);

  if (pathname.startsWith("/dashboard") && needsOnboarding) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  if (pathname.startsWith("/onboarding") && !needsOnboarding) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|manifest.json).*)"],
};
