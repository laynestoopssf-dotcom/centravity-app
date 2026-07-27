import { createClient } from "@supabase/supabase-js";

// =============================================================================
// Shared service-role Supabase client for Server Actions (server-only, bypasses RLS).
// -----------------------------------------------------------------------------
// Deliberately NOT marked "use server" — a "use server" file's entire export
// surface is treated as a Server Function reference boundary, which only ever
// wants async functions on it. This plain module just exports a client
// instance, imported by onboarding.ts, joinAgency.ts, and any future Server
// Action that needs admin access.
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
// =============================================================================
function normalizeSupabaseUrl(raw: string): string {
  let url = (raw || "").trim().replace(/['"]/g, "");
  url = url.replace(/\/rest\/v1\/?$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

export const supabaseAdmin = createClient(
  normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
