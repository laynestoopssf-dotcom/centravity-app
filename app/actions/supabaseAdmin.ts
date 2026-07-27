import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// =============================================================================
// Shared service-role Supabase client for Server Actions (server-only, bypasses RLS).
// -----------------------------------------------------------------------------
// Deliberately NOT marked "use server" — a "use server" file's entire export
// surface is treated as a Server Function reference boundary, which only ever
// wants async functions on it. This plain module just exports a client
// instance, imported by onboarding.ts, joinAgency.ts, and any future Server
// Action that needs admin access.
//
// `import "server-only"` (Next's own package for exactly this) turns any
// accidental client-side inclusion of this module into a hard BUILD ERROR
// instead of a silent runtime failure. This module touches
// SUPABASE_SERVICE_ROLE_KEY, a secret with zero NEXT_PUBLIC_ prefix — Next
// only ever inlines NEXT_PUBLIC_-prefixed vars into the client bundle, so if
// this module were ever pulled into client code, that read would silently
// resolve to undefined and getSupabaseAdmin() below would throw exactly the
// "missing Supabase service role credentials" error this file's own guard
// produces — which is indistinguishable, from the UI, from the variable
// genuinely being unset in the deployment. `server-only` converts that whole
// failure mode into a loud, immediate `next build` failure instead, so it's
// caught in CI rather than by a user submitting a form in production.
//
// NEXT_PUBLIC_SUPABASE_URL in .env.local has a `/rest/v1/` suffix baked in
// (see the identical auto-fixer in utils/supabase.ts, which strips it before
// constructing the anon client). createClient() expects the bare project URL
// and appends /auth/v1, /rest/v1, /realtime/v1 itself — passing a URL that
// already ends in /rest/v1 makes every admin auth call (e.g. auth.getUser(),
// auth.admin.createUser()) resolve to .../rest/v1/auth/v1/... instead of
// .../auth/v1/..., which 404s and surfaces as a generic, misleading
// "Unauthorized: invalid session." Normalize it the same way so this client
// is correct regardless of how the env var is formatted.
//
// LAZY INITIALIZATION — load-bearing, not a style choice: createClient() from
// @supabase/supabase-js throws SYNCHRONOUSLY if the url/key are empty. This
// used to be a plain top-level `const supabaseAdmin = createClient(...)`,
// which runs the instant this module is imported — BEFORE any calling
// action's own try/catch has started. A throw there crosses the Server
// Action boundary completely uncaught, which is exactly what produces
// Next's generic, unhelpful "An error occurred in the Server Components
// render" message in production instead of a real error surfaced to the UI.
// Wrapping it in a getter means the actual createClient() call happens
// lazily, on first use, from *inside* whichever action's try/catch is
// already running (e.g. joinAgency.ts / onboarding.ts) — so a missing/blank
// env var becomes a normal caught error and a clean { success: false, error }
// response instead of a hard server crash.
// =============================================================================
function normalizeSupabaseUrl(raw: string): string {
  let url = (raw || "").trim().replace(/['"]/g, "");
  url = url.replace(/\/rest\/v1\/?$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

let cachedClient: SupabaseClient | null = null;

function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) return cachedClient;

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !key) {
    // Log exactly which var is missing (never the key's value) — this is
    // the one piece a redacted-in-production client error can never show,
    // and it's the difference between "wrong env var scoping in Vercel" and
    // "some other bug" the next time this fires. Confirmed via `import
    // "server-only"` (see above) that this module is never reachable from a
    // client bundle, so a missing `key` here means the deployment's own
    // process.env genuinely doesn't have SUPABASE_SERVICE_ROLE_KEY set for
    // whichever environment (Production/Preview) served this request — most
    // commonly because the var was added/edited in Vercel's dashboard with
    // only some of the Production/Preview/Development checkboxes ticked, and
    // needs a fresh deployment to take effect even after it's fixed there.
    console.error(
      "[supabaseAdmin] missing service-role credentials:",
      `NEXT_PUBLIC_SUPABASE_URL ${url ? "present" : "MISSING"},`,
      `SUPABASE_SERVICE_ROLE_KEY ${key ? "present" : "MISSING"}`
    );
    // Thrown from inside a lazy getter (called from within a caller's own
    // try/catch), never from module-load time — see note above.
    throw new Error(
      "Server is misconfigured: missing Supabase service role credentials. Please contact support."
    );
  }

  cachedClient = createClient(url, key);
  return cachedClient;
}

// A Proxy so every existing call site (supabaseAdmin.from(...), .auth.getUser(...),
// etc., all over onboarding.ts and joinAgency.ts) keeps working completely
// unchanged, while the real client is only ever constructed lazily on first
// property access via getSupabaseAdmin() above.
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    // Pass `client` (not the proxy) as the receiver so any internal getters
    // on the real client resolve `this` correctly.
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

// Shared across every onboarding/join Server Action that needs to turn a
// free-text "Full Name" field into profiles.first_name / profiles.last_name.
export function splitName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return { first_name: "", last_name: "" };
  const parts = trimmed.split(/\s+/);
  const first_name = parts.shift() || "";
  const last_name = parts.join(" ");
  return { first_name, last_name };
}

// A column missing from the DB can surface two different ways depending on
// the code path: a raw Postgres error (42703 = "column does not exist") or a
// PostgREST-level error (PGRST204 = "Could not find the '<col>' column ... in
// the schema cache"). In practice PGRST204 is what actually shows up for
// .update()/.insert()/.upsert() calls through supabase-js. Treat both as
// "this column doesn't exist yet in this environment, degrade gracefully"
// rather than failing the whole write over one additive-migration column.
export function isMissingColumnError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}
