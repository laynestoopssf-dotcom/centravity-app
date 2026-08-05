// =============================================================================
// Browser-only "remember what I typed" cache for client identifiers.
// -----------------------------------------------------------------------------
// Once identifiers are blind-indexed (see utils/crypto.ts), Supabase - and
// every OTHER browser/device - can never show a readable identifier again.
// That breaks the "Bind from existing Household Quote?" picker in the Log
// Activity modal, which used to group/label quotes by their plaintext name
// so a producer could tell two households apart at a glance, and it breaks
// every other table (Pipeline, Ledger, Commission statement) that used to
// just render `policy.customer_name` directly.
//
// Deliberate, accepted trade-off: THIS device's own browser keeps a local
// (never transmitted, never synced) lookup of {key -> raw identifier typed},
// purely so the SAME producer, on the SAME browser, still sees a readable
// label wherever this app displays that policy. Anyone else - a teammate, a
// manager on a different machine, an auditor with DB access - only ever sees
// the hash. This is why the cache lives in `localStorage` and is never sent
// to Supabase or read by anything server-side.
//
// TWO parallel stores, both keyed off values this browser has directly seen:
//   - byId:   policy row id -> raw identifier. Written the moment a specific
//             row is inserted/updated, so it works even before a hash has
//             been computed (e.g. if the hashing RPC is slow/unavailable).
//   - byHash: client_identifier_hash -> raw identifier. The SAME identifier
//             always normalizes+hashes to the SAME value (see utils/crypto.ts),
//             so caching by hash means every row that shares an identifier -
//             not just the exact row this browser typed it for - resolves to
//             a readable label. This is what makes a Commission statement row
//             for a policy bound weeks ago (different row id, same household,
//             same hash) still show up correctly, and it's why
//             getCachedIdentifier() below always tries id first, then hash.
//
// Entries are pruned automatically after CACHE_TTL_MS so this doesn't grow
// forever - display only ever needs to resolve RECENTLY-typed identifiers on
// this device, not a permanent local archive of every name ever typed.
// =============================================================================

const STORAGE_KEY_BY_ID = "centravity_identifier_cache_v1";
const STORAGE_KEY_BY_HASH = "centravity_identifier_cache_by_hash_v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

interface CacheEntry {
  raw: string;
  ts: number;
}

type CacheShape = Record<string, CacheEntry>;

function readCache(storageKey: string): CacheShape {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(storageKey: string, cache: CacheShape) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(cache));
  } catch {
    // Storage full/unavailable (e.g. private browsing) - display just falls
    // back to hash-only labels, which is a degraded-but-safe experience, not
    // a broken one.
  }
}

function pruneExpired(cache: CacheShape): CacheShape {
  const now = Date.now();
  const next: CacheShape = {};
  for (const [key, entry] of Object.entries(cache)) {
    if (now - entry.ts < CACHE_TTL_MS) next[key] = entry;
  }
  return next;
}

function setEntry(storageKey: string, key: string | null | undefined, raw: string | null | undefined) {
  if (!key || !raw || !raw.trim()) return;
  const cache = pruneExpired(readCache(storageKey));
  cache[key] = { raw: raw.trim(), ts: Date.now() };
  writeCache(storageKey, cache);
}

function getEntry(storageKey: string, key: string | null | undefined): string | null {
  if (!key) return null;
  return readCache(storageKey)[key]?.raw || null;
}

/**
 * Remembers the raw identifier this browser just typed, keyed by BOTH the policy row id and
 * (if already known at call time - it usually is, since hashing happens up front) its
 * client_identifier_hash. Safe to call with either key missing; it just skips that store.
 */
export function cacheIdentifier(policyId: string | null | undefined, raw: string, hash?: string | null) {
  setEntry(STORAGE_KEY_BY_ID, policyId, raw);
  setEntry(STORAGE_KEY_BY_HASH, hash, raw);
}

/**
 * Looks up a previously-cached raw identifier. Tries the policy id first (most specific), then
 * falls back to the hash (works across every row that shares the same identifier, including ones
 * this exact browser never directly typed for - e.g. a policy bound today for a household first
 * quoted weeks ago under a different row id).
 */
export function getCachedIdentifier(policyId: string | null | undefined, hash?: string | null): string | null {
  return getEntry(STORAGE_KEY_BY_ID, policyId) || getEntry(STORAGE_KEY_BY_HASH, hash);
}

/** First cached hit across a list of candidate policy ids/hashes (e.g. every quote in one household group). */
export function getCachedIdentifierForAny(
  policyIds: (string | null | undefined)[],
  hashes?: (string | null | undefined)[]
): string | null {
  for (const id of policyIds) {
    const hit = getEntry(STORAGE_KEY_BY_ID, id);
    if (hit) return hit;
  }
  for (const hash of hashes || []) {
    const hit = getEntry(STORAGE_KEY_BY_HASH, hash);
    if (hit) return hit;
  }
  return null;
}

/**
 * Drops the by-id cache entry once it's no longer useful to keep around (e.g. a quote just got
 * bound/resolved with a blank identifier, meaning the producer explicitly cleared it). Deliberately
 * leaves the by-hash store alone - a hash is a stable value other rows may still want resolved, so
 * there's no single-row "this is done with" moment for it the way there is for a row id.
 */
export function forgetCachedIdentifier(policyId: string) {
  if (!policyId) return;
  const cache = readCache(STORAGE_KEY_BY_ID);
  if (cache[policyId]) {
    delete cache[policyId];
    writeCache(STORAGE_KEY_BY_ID, cache);
  }
}
