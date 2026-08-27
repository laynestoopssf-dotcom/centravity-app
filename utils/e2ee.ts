import { supabase } from "./supabase";

// =============================================================================
// Client-side AES-256-GCM encryption for client identifiers, layered ON TOP OF
// (never instead of) the blind hash/trigram system in utils/crypto.ts.
// -----------------------------------------------------------------------------
// The hash/trigram columns can only ever answer "does this match a search
// term?" - they have no decrypt path, by design, so an Owner/Manager who
// never personally typed a teammate's customer identifier could never see
// the real name again, only a placeholder (see components/ui/IdentifierChip.tsx).
// This module adds a real, reversible layer: every identifier is also
// encrypted client-side with a single AES-256 key shared by the whole agency
// (see supabase/migrations/20260827040000_add_agency_encryption_keys.sql) and
// stored as `policies.client_identifier_ciphertext`/`client_identifier_iv`.
// Any authorized member of that agency's browser can fetch the same key and
// decrypt it locally.
//
// READ THE MIGRATION'S HEADER COMMENT before assuming this is "zero-knowledge"
// - the key is RLS-gated, not secret-derived, so it is NOT a substitute for
// the hash/trigram columns' true one-way guarantee. It is a display
// convenience for authorized cross-team viewing, nothing more.
//
// Encryption/decryption never throws - every failure path degrades to "no
// ciphertext"/"can't decrypt this row" (IdentifierChip.tsx falls back to its
// placeholder), exactly like a hashing RPC failure degrades in utils/crypto.ts.
// Search is completely unaffected either way, since it never reads these
// columns - see components/DashboardTab.tsx's matchesIdentifierSearch.
// =============================================================================

export type EncryptedPayload = { ciphertext: string | null; iv: string | null };
const EMPTY_ENCRYPTED: EncryptedPayload = { ciphertext: null, iv: null };

function hasWebCrypto(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle;
}

function bytesToBase64(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// One imported CryptoKey per agency, cached for the life of this page session so encrypting/
// decrypting many rows (e.g. every row of a rendered Pipeline table) doesn't re-fetch and
// re-import the same key over and over. A key that fails to resolve is evicted rather than
// cached as a permanent failure, so a transient network hiccup can't disable encryption/
// decryption for the rest of the session.
const keyCache = new Map<string, Promise<CryptoKey | null>>();

async function fetchAndImportAgencyKey(agencyId: string): Promise<CryptoKey | null> {
  try {
    let { data, error } = await supabase
      .from("agency_encryption_keys")
      .select("encryption_key")
      .eq("agency_id", agencyId)
      .maybeSingle();

    if (!data?.encryption_key) {
      // Covers a brand-new agency whose key row hasn't landed yet (a race with the
      // auto-provisioning trigger, or an agency created before that migration existed and
      // somehow missed the one-time backfill) - cheap no-op once the row already exists.
      await supabase.rpc("ensure_my_agency_encryption_key");
      const retry = await supabase
        .from("agency_encryption_keys")
        .select("encryption_key")
        .eq("agency_id", agencyId)
        .maybeSingle();
      data = retry.data;
      error = retry.error;
    }

    if (error || !data?.encryption_key) {
      console.error("[e2ee] Could not fetch this agency's encryption key - identifiers will show the placeholder instead of decrypting:", error);
      return null;
    }

    return await crypto.subtle.importKey("raw", base64ToBytes(data.encryption_key) as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch (err) {
    console.error("[e2ee] Unexpected exception fetching/importing the agency encryption key:", err);
    return null;
  }
}

async function getAgencyKey(agencyId: string | null | undefined): Promise<CryptoKey | null> {
  if (!agencyId || !hasWebCrypto()) return null;
  if (!keyCache.has(agencyId)) {
    keyCache.set(agencyId, fetchAndImportAgencyKey(agencyId));
  }
  const key = await keyCache.get(agencyId)!;
  if (!key) keyCache.delete(agencyId);
  return key;
}

/** Drops any cached key(s), e.g. on sign-out, so a subsequent sign-in as a different agency's user can't reuse a stale CryptoKey. */
export function clearAgencyKeyCache(agencyId?: string) {
  if (agencyId) keyCache.delete(agencyId);
  else keyCache.clear();
}

/**
 * Encrypts one identifier for a given agency. Returns { ciphertext: null, iv: null } for an
 * empty/whitespace-only input, a missing agencyId, an environment without Web Crypto, or any
 * failure fetching/using the key - callers already treat a null ciphertext as "no encrypted
 * copy available", exactly like a null hash from utils/crypto.ts.
 */
export async function encryptIdentifierForAgency(raw: string, agencyId: string | null | undefined): Promise<EncryptedPayload> {
  if (!raw || !raw.trim() || !agencyId || !hasWebCrypto()) return EMPTY_ENCRYPTED;

  try {
    const key = await getAgencyKey(agencyId);
    if (!key) return EMPTY_ENCRYPTED;
    // A fresh random 12-byte nonce every call - AES-GCM's confidentiality guarantee breaks if a
    // nonce is ever reused with the same key, even for identical plaintext.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(raw.trim()));
    return { ciphertext: bytesToBase64(ciphertextBuf), iv: bytesToBase64(iv) };
  } catch (err) {
    console.error("[e2ee] encryptIdentifierForAgency failed - this row will have no ciphertext (hash/trigram search is unaffected):", err);
    return EMPTY_ENCRYPTED;
  }
}

/** Batch variant, for CSV/"Historical Logger" import - fetches the agency key once, not once per row. */
export async function encryptIdentifiersForAgency(rawList: string[], agencyId: string | null | undefined): Promise<EncryptedPayload[]> {
  if (rawList.length === 0) return [];
  if (!agencyId || !hasWebCrypto()) return rawList.map(() => EMPTY_ENCRYPTED);

  const key = await getAgencyKey(agencyId);
  if (!key) return rawList.map(() => EMPTY_ENCRYPTED);

  return Promise.all(
    rawList.map(async (raw) => {
      if (!raw || !raw.trim()) return EMPTY_ENCRYPTED;
      try {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(raw.trim()));
        return { ciphertext: bytesToBase64(ciphertextBuf), iv: bytesToBase64(iv) };
      } catch (err) {
        console.error("[e2ee] encryptIdentifiersForAgency failed for one row in the batch - it will have no ciphertext:", err);
        return EMPTY_ENCRYPTED;
      }
    })
  );
}

/**
 * Decrypts a stored ciphertext/iv pair back to plaintext for display. Returns null (never
 * throws) for a missing ciphertext/iv/agencyId, an environment without Web Crypto, a key this
 * browser isn't authorized to read (RLS denies the select entirely), or a decrypt failure (e.g.
 * data encrypted under a since-rotated key, which this app never actually does, but defensively
 * handled anyway). Callers (IdentifierChip.tsx) fall back to a placeholder on null.
 */
export async function decryptIdentifier(
  ciphertext: string | null | undefined,
  iv: string | null | undefined,
  agencyId: string | null | undefined
): Promise<string | null> {
  if (!ciphertext || !iv || !agencyId || !hasWebCrypto()) return null;

  try {
    const key = await getAgencyKey(agencyId);
    if (!key) return null;
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) as BufferSource }, key, base64ToBytes(ciphertext) as BufferSource);
    return new TextDecoder().decode(plainBuf);
  } catch (err) {
    console.error("[e2ee] decryptIdentifier failed - falling back to the placeholder:", err);
    return null;
  }
}
