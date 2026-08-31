// Plain type-only module - deliberately NOT marked "use server" (same reason
// as sparring.types.ts / waitlist.types.ts: a "use server" file's entire
// export surface must be async functions, not types).

export interface ObjectionStrategy {
  // Free-form label from the model (expected to land close to "Empathetic",
  // "Logical/Financial", "Direct Closing" per the fixed system prompt, but
  // never strictly validated against that list - see
  // components/coaching/ObjectionSandboxPanel.tsx's iconForStrategyType for
  // how the UI tolerates wording drift instead of assuming an exact match).
  type: string;
  script: string;
}

export interface GenerateObjectionPivotsPayload {
  accessToken: string;
  objectionText: string;
}

export interface GenerateObjectionPivotsResult {
  success: boolean;
  strategies?: ObjectionStrategy[];
  error?: string;
}
