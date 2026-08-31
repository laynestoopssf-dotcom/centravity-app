// =============================================================================
// Plain type-only module — deliberately NOT marked "use server". See the
// identical note at the top of waitlist.types.ts / onboarding.types.ts for
// why: a "use server" file's entire export surface is treated as a Server
// Function reference boundary, which only ever wants async functions on it.
// =============================================================================

export interface SparringTranscriptMessage {
  role: "user" | "assistant";
  content: string;
}

export interface SaveSparringSessionPayload {
  accessToken: string;
  // The full turn-by-turn transcript, stored verbatim as jsonb — this is the
  // permanent record of the session, independent of whatever grading summary
  // was produced from it.
  transcript: SparringTranscriptMessage[];
  productLine?: string;
  summary: string;
  // Must be an integer 1-10 (see app/api/ai/sparring/grade/route.ts, which is
  // the only intended source of this value — it already clamps/validates
  // before the client ever sees it, but this action re-validates
  // server-side too, same "never trust the client" rule as every other
  // Server Action in this app).
  score: number;
}

export interface SaveSparringSessionResult {
  success: boolean;
  error?: string;
}
