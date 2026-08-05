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
 * Hashes a plain-text identifier via the hash_client_identifier RPC. Returns
 * null for an empty/whitespace-only input (the field is optional) or if the
 * call fails for any reason - callers already treat a null hash as "no
 * identifier", so a transient RPC failure degrades to "logged with no
 * searchable identifier" rather than throwing away the whole submission.
 */
export async function hashIdentifier(raw: string): Promise<string | null> {
  if (!raw || !raw.trim()) return null;

  const { data, error } = await supabase.rpc("hash_client_identifier", { p_identifier: raw });
  if (error) {
    console.error("[hashIdentifier] RPC failed:", error);
    return null;
  }
  return data ?? null;
}

/**
 * Batch variant of hashIdentifier - one round trip for many identifiers
 * (used by CSV import, which can have hundreds/thousands of rows). Order of
 * the returned array matches the input array exactly, with null entries for
 * empty/whitespace-only inputs.
 */
export async function hashIdentifiers(rawList: string[]): Promise<(string | null)[]> {
  if (rawList.length === 0) return [];

  const { data, error } = await supabase.rpc("hash_client_identifiers", { p_identifiers: rawList });
  if (error) {
    console.error("[hashIdentifiers] RPC failed:", error);
    return rawList.map(() => null);
  }
  return (data ?? rawList.map(() => null)) as (string | null)[];
}
