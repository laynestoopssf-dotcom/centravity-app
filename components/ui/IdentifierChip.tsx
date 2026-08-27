"use client";

import React, { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { getCachedIdentifier, cacheIdentifier } from "../../utils/identifierCache";
import { decryptIdentifier } from "../../utils/e2ee";

// =============================================================================
// Replaces every bare `{displayIdentifier(...)}` plaintext render across the
// Pipeline, Ledger, Commission, and Life tabs. The client identifier is
// already never stored server-side as plaintext for SEARCH purposes (see
// utils/crypto.ts's blind hash/trigram indexing) - nothing renders by default
// except a small icon tied to the policy's hash/id, and the actual name only
// ever appears if THIS user deliberately clicks to reveal it (e.g. to confirm
// which row they're editing) - never permanently on-screen for a shared
// monitor, screenshot, or screen share to pick up.
//
// TWO independent sources feed a reveal, tried in this order:
//   1. This browser's own local cache (utils/identifierCache.ts) - instant,
//      no network call, works even offline. Populated whenever THIS browser
//      itself logged/edited the identifier.
//   2. `ciphertext`/`iv`/`agencyId` (utils/e2ee.ts) - decrypted on demand,
//      lazily, only the first time this specific chip is revealed. This is
//      what makes a teammate's policy - one this browser never typed the
//      identifier for - actually show the real name for an authorized
//      cross-team viewer (Owner/Manager/etc.), instead of forever showing a
//      placeholder. See the migration header comment in
//      supabase/migrations/20260827040000_add_agency_encryption_keys.sql for
//      the (deliberate, discussed) trade-off this involves.
// A successful decrypt is written straight into the SAME local cache as (1),
// so re-revealing (or any other row sharing the same hash) is instant after
// the first decrypt.
//
// If NEITHER source resolves anything (row logged before either feature
// existed, or this browser lacks decrypt access), reveal shows a clearly
// fake, clearly-labeled placeholder - never the raw one-way hash, and never
// nothing.
// =============================================================================

export default function IdentifierChip({
  policyId,
  hash,
  ciphertext,
  iv,
  agencyId,
  className = "",
}: {
  policyId: string;
  hash?: string | null;
  ciphertext?: string | null;
  iv?: string | null;
  agencyId?: string | null;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [decrypting, setDecrypting] = useState(false);
  // Read fresh on every render (deliberately not memoized) so a decrypt that just wrote into the
  // cache below is picked up on the very next render without a separate piece of local state to
  // keep in sync with it.
  const cached = getCachedIdentifier(policyId, hash);
  const canDecrypt = !cached && !!ciphertext && !!iv && !!agencyId;
  const revealedText = cached ?? "Secure Customer (cross-team)";

  const handleClick = async (e: React.MouseEvent) => {
    // Never lets a reveal click bubble into a surrounding row's own click handler (e.g. an
    // expand/collapse toggle) - this is purely a local show/hide, not a row action.
    e.stopPropagation();
    if (revealed) {
      setRevealed(false);
      return;
    }
    if (canDecrypt) {
      setDecrypting(true);
      const plaintext = await decryptIdentifier(ciphertext, iv, agencyId);
      setDecrypting(false);
      // Decrypt failures (RLS denied the key, network hiccup, etc.) simply leave nothing
      // cached - revealedText's placeholder fallback covers that on the render right after this.
      if (plaintext) cacheIdentifier(policyId, plaintext, hash);
    }
    setRevealed(true);
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={decrypting}
        title={
          revealed
            ? "Hide identifier"
            : cached
            ? "Reveal identifier (visible to you only)"
            : canDecrypt
            ? "Decrypt and reveal this identifier (visible to you only)"
            : "No decryptable copy available for this row - reveal shows a placeholder instead"
        }
        aria-label={revealed ? "Hide identifier" : "Reveal identifier"}
        className="inline-flex items-center justify-center text-gray-300 hover:text-blue-500 focus:text-blue-500 outline-none transition-colors shrink-0 disabled:cursor-wait"
      >
        {decrypting ? <Loader2 size={14} className="animate-spin" /> : revealed ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      {revealed && <span className={`font-bold ${cached ? "" : "italic text-gray-400"}`}>{revealedText}</span>}
      {!revealed && !cached && <span className="text-gray-300">—</span>}
    </span>
  );
}
