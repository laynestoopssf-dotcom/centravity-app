import { supabase } from "./supabase";

// =============================================================================
// Blind-index hashing for client/customer identifiers (OBA compliance).
// -----------------------------------------------------------------------------
// Centravity must never store a raw, human-readable client name in Supabase -
// AND the secret used to salt the hash must never reach the browser either.
// Every "Identifier" a producer types (see the Log Activity modal's
// `custIdentifier` field in app/dashboard/page.tsx) is sent to a Postgres RPC
// that hashes it server-side and returns only the resulting SHA-256 digest.
// What lands in `policies.client_identifier_hash` is a one-way hash - there is
// no decrypt path, by design.
//
// HARDENING NOTE (2026-08-05): this used to hash client-side with the Web
// Crypto API, salted with the agency's public `agency_id`. That was flagged as
// weak - `agency_id` isn't a secret (it appears in invite links, etc.), so
// anyone with DB access and an agency_id could offline-brute-force this app's
// own "First L." naming convention (a very small search space) against every
// hash in the table. Hashing has since moved into a SECURITY DEFINER Postgres
// function (see supabase/migrations/20260805010000_secure_pepper_hash_rpc.sql)
// that mixes in a random 256-bit pepper stored in Supabase Vault - readable
// only from inside that trusted function, never by any client, browser, or
// application code. The RPC also derives the caller's agency_id itself from
// their own JWT (auth.uid() -> profiles.agency_id) rather than trusting a
// client-supplied value, so a compromised client can't even pick which
// agency's salt to hash under.
//
// NORMALIZATION happens server-side inside the RPC (trim/lowercase/collapse
// whitespace) so "John D.", "john d.", and "  John D. " all still hash
// identically for later exact-match searches - see that migration for the
// exact formula.
// =============================================================================

/**
 * Logs a PostgREST/Postgres error (from the `error` field of an RPC response) with every
 * diagnostic field it carries, plus a plain-English guess at the cause for the failure modes
 * we've actually hit while building this - so a future "why is hashing failing" investigation
 * starts from a specific lead instead of a bare "RPC failed" with no detail.
 */
function logRpcError(label: string, error: { message?: string; code?: string; details?: string; hint?: string }) {
  console.error(`[${label}] RPC returned an error - client_identifier_hash will be NULL for this call.`, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
  });
  if (error?.code === "42883") {
    console.error(`[${label}] code 42883 = "function/operator does not exist". Most likely cause: pgcrypto's digest() lives in the "extensions" schema on this Supabase project, not "public", and the RPC's SET search_path doesn't include it. See supabase/migrations/20260805030000_fix_hash_rpc_search_path.sql.`);
  } else if (error?.code === "42P01" || error?.message?.toLowerCase().includes("vault.")) {
    console.error(`[${label}] code 42P01/references vault - the "vault" extension likely isn't enabled on this project (vault.secrets / vault.decrypted_secrets don't exist). Enable it under Database > Extensions in the Supabase dashboard, then re-run 20260805010000_secure_pepper_hash_rpc.sql.`);
  } else if (error?.code === "42501" || error?.message?.toLowerCase().includes("permission denied")) {
    console.error(`[${label}] code 42501/permission denied. Check the RPC's GRANT EXECUTE ... TO authenticated statement in the migration actually ran.`);
  } else if (error?.code === "PGRST202" || error?.message?.toLowerCase().includes("could not find function")) {
    console.error(`[${label}] PostgREST can't find this function at all. Confirm supabase/migrations/20260805010000_secure_pepper_hash_rpc.sql was actually run against this project (not just saved locally).`);
  } else if (error?.message?.includes("client_identifier_pepper")) {
    console.error(`[${label}] The Vault secret itself is missing/unreadable. Re-run the "generate the pepper" DO block in 20260805010000_secure_pepper_hash_rpc.sql (it's idempotent - only inserts if the named secret doesn't already exist).`);
  } else if (error?.message?.toLowerCase().includes("no agency found")) {
    console.error(`[${label}] auth.uid() resolved to a user with no matching public.profiles row (or profiles.agency_id is null for them) - the RPC intentionally refuses to hash without a real agency to salt with.`);
  }
}

/**
 * Hashes a plain-text identifier via the hash_client_identifier RPC. Returns
 * null for an empty/whitespace-only input (the field is optional) or if the
 * call fails for any reason - callers already treat a null hash as "no
 * identifier", so a transient RPC failure degrades to "logged with no
 * searchable identifier" rather than throwing away the whole submission.
 * Never throws - every failure path (network-level rejection included) is
 * caught here so a hashing hiccup can't take down an entire bind/quote submit.
 */
export async function hashIdentifier(raw: string): Promise<string | null> {
  if (!raw || !raw.trim()) return null;

  try {
    const { data, error } = await supabase.rpc("hash_client_identifier", { p_identifier: raw });
    if (error) {
      logRpcError("hashIdentifier", error);
      return null;
    }
    return data ?? null;
  } catch (err) {
    // A genuine thrown/rejected error (offline, DNS failure, etc.) rather than a normal
    // Postgres/PostgREST error response - those come back as `error` above, not a throw.
    console.error("[hashIdentifier] Unexpected exception calling the RPC (network-level, not a DB error) - client_identifier_hash will be NULL for this call:", err);
    return null;
  }
}

/**
 * Batch variant of hashIdentifier - one round trip for many identifiers
 * (used by CSV import, which can have hundreds/thousands of rows). Order of
 * the returned array matches the input array exactly, with null entries for
 * empty/whitespace-only inputs. Never throws, for the same reason as above.
 */
export async function hashIdentifiers(rawList: string[]): Promise<(string | null)[]> {
  if (rawList.length === 0) return [];

  try {
    const { data, error } = await supabase.rpc("hash_client_identifiers", { p_identifiers: rawList });
    if (error) {
      logRpcError("hashIdentifiers", error);
      return rawList.map(() => null);
    }
    return (data ?? rawList.map(() => null)) as (string | null)[];
  } catch (err) {
    console.error("[hashIdentifiers] Unexpected exception calling the RPC (network-level, not a DB error) - every client_identifier_hash in this batch will be NULL:", err);
    return rawList.map(() => null);
  }
}
