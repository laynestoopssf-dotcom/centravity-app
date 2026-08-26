"use client";

import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { getCachedIdentifier } from "../../utils/identifierCache";

// =============================================================================
// Replaces every bare `{displayIdentifier(...)}` plaintext render across the
// Pipeline, Ledger, Commission, and Life tabs. The client identifier is
// already never stored server-side as plaintext (see utils/crypto.ts's blind
// indexing) - this browser's own localStorage cache (utils/identifierCache.ts)
// was the ONLY remaining place it ever showed up unmasked, sitting in the open
// on every row of every table. That's scrubbed now: nothing renders by
// default except a small icon tied to the policy's hash/id, and the actual
// name only ever appears if THIS user deliberately clicks to reveal it (e.g.
// to confirm which row they're editing) - never permanently on-screen for a
// shared monitor, screenshot, or screen share to pick up.
// =============================================================================

export default function IdentifierChip({
  policyId,
  hash,
  className = "",
}: {
  policyId: string;
  hash?: string | null;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const cached = getCachedIdentifier(policyId, hash);

  if (!cached) {
    return <span className={`text-gray-300 ${className}`}>—</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          // Never lets a reveal click bubble into a surrounding row's own click
          // handler (e.g. an expand/collapse toggle) - this is purely a local
          // show/hide, not a row action.
          e.stopPropagation();
          setRevealed((v) => !v);
        }}
        title={revealed ? "Hide identifier" : "Reveal identifier (visible to you only)"}
        aria-label={revealed ? "Hide identifier" : "Reveal identifier"}
        className="inline-flex items-center justify-center text-gray-300 hover:text-blue-500 focus:text-blue-500 outline-none transition-colors shrink-0"
      >
        {revealed ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      {revealed && <span className="font-bold">{cached}</span>}
    </span>
  );
}
