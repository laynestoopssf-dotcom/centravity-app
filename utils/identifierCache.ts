// =============================================================================
// Browser-only "remember what I typed" cache for client identifiers.
// -----------------------------------------------------------------------------
// Once identifiers are blind-indexed (see utils/crypto.ts), Supabase - and
// every OTHER browser/device - can never show a readable identifier again.
// That breaks the "Bind from existing Household Quote?" picker in the Log
// Activity modal, which used to group/label quotes by their plaintext name
// so a producer could tell two households apart at a glance.
//
// Deliberate, accepted trade-off: THIS device's own browser keeps a local
// (never transmitted, never synced) lookup of {policyId -> raw identifier
// typed}, purely so the SAME producer, quoting and later binding from the
// SAME browser, still sees a readable label in that one picker. Anyone else
// - a teammate, a manager on a different machine, an auditor with DB access
// - only ever sees the hash. This is why the cache lives in `localStorage`
// and is keyed by policy id, not in any state that could sync across
// devices or reach Supabase.
//
// Entries are pruned automatically after CACHE_TTL_MS so this doesn't grow
// forever - the picker only ever needs to resolve RECENTLY quoted, still-
// pending households, not a permanent local archive of every name ever typed.
// =============================================================================

const STORAGE_KEY = "centravity_identifier_cache_v1";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

interface CacheEntry {
  raw: string;
  ts: number;
}

type CacheShape = Record<string, CacheEntry>;

function readCache(): CacheShape {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache: CacheShape) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full/unavailable (e.g. private browsing) - the picker just falls
    // back to hash-only labels, which is a degraded-but-safe experience, not
    // a broken one.
  }
}

function pruneExpired(cache: CacheShape): CacheShape {
  const now = Date.now();
  const next: CacheShape = {};
  for (const [id, entry] of Object.entries(cache)) {
    if (now - entry.ts < CACHE_TTL_MS) next[id] = entry;
  }
  return next;
}

/** Remembers the raw identifier this browser just typed for a given policy row id. */
export function cacheIdentifier(policyId: string, raw: string) {
  if (!policyId || !raw || !raw.trim()) return;
  const cache = pruneExpired(readCache());
  cache[policyId] = { raw: raw.trim(), ts: Date.now() };
  writeCache(cache);
}

/** Looks up a previously-cached raw identifier for a policy row id, if this browser ever typed one. */
export function getCachedIdentifier(policyId: string | null | undefined): string | null {
  if (!policyId) return null;
  const cache = readCache();
  return cache[policyId]?.raw || null;
}

/** First cached hit across a list of candidate policy ids (e.g. every quote id in one household group). */
export function getCachedIdentifierForAny(policyIds: (string | null | undefined)[]): string | null {
  for (const id of policyIds) {
    const hit = getCachedIdentifier(id);
    if (hit) return hit;
  }
  return null;
}

/** Drops a cache entry once it's no longer useful to keep around (e.g. a quote just got bound/resolved). */
export function forgetCachedIdentifier(policyId: string) {
  if (!policyId) return;
  const cache = readCache();
  if (cache[policyId]) {
    delete cache[policyId];
    writeCache(cache);
  }
}
