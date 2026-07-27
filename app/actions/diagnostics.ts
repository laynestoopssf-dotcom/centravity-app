"use server";

import { createClient } from "@supabase/supabase-js";

// =============================================================================
// Server Action: Service-Role Row Verification
// -----------------------------------------------------------------------------
// Purpose: give a DEFINITIVE, RLS-bypassing answer to "did these exact rows
// actually get written?" — used by app/dashboard/page.tsx's submitLogActivity
// after a bulk insert reports success but a client-side (RLS-scoped) re-select
// of the same ids comes back short.
//
// Why this has to run on the server: a client-side re-select of "the ids I
// just inserted" is still subject to that table's SELECT RLS policy, which can
// differ from its INSERT policy. If SELECT is more restrictive, a fully
// successful multi-row insert can *report back* fewer rows than were actually
// written — a false "silent collapse" signal. The service role key bypasses
// RLS entirely, so this is the only way to get ground truth on whether rows
// really don't exist (a genuine server-side trigger/rule dropped them) versus
// they exist but this session's SELECT policy just can't see all of them.
//
// SECURITY: never trust a client-supplied ownerId — re-derive it from
// accessToken via supabaseAdmin.auth.getUser, then scope the verification
// query to rows owned by that exact user so this can't be used to probe for
// the existence of other users' or agencies' row ids.
// =============================================================================

function normalizeSupabaseUrl(raw: string): string {
  let url = (raw || "").trim().replace(/['"]/g, "");
  url = url.replace(/\/rest\/v1\/?$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

const supabaseAdmin = createClient(
  normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type VerifyRowsResult =
  | { ok: true; requested: number; foundIds: string[] }
  | { ok: false; error: string };

const VERIFIABLE_TABLES = ["activities", "policies"] as const;
type VerifiableTable = (typeof VERIFIABLE_TABLES)[number];

export async function verifyRowsExist(
  accessToken: string | undefined,
  table: VerifiableTable,
  ids: string[]
): Promise<VerifyRowsResult> {
  if (!accessToken) return { ok: false, error: "Unauthorized: missing session." };
  if (!VERIFIABLE_TABLES.includes(table)) return { ok: false, error: "Unsupported table." };
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, requested: 0, foundIds: [] };

  const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !authUser?.user) {
    console.error("[diagnostics] verifyRowsExist: failed to authenticate caller", authError);
    return { ok: false, error: "Unauthorized: invalid session." };
  }

  // Scoped to this caller's own rows only — bypasses RLS via the service role
  // key, but still can't be used to fish for other users' data.
  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id")
    .in("id", ids)
    .eq("user_id", authUser.user.id);

  if (error) {
    console.error(`[diagnostics] verifyRowsExist: service-role query against ${table} failed`, error);
    return { ok: false, error: error.message };
  }

  return { ok: true, requested: ids.length, foundIds: (data || []).map((r) => r.id as string) };
}
