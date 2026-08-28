// =============================================================================
// Plain type-only module — deliberately NOT marked "use server". See the
// identical note at the top of onboarding.types.ts for why: a "use server"
// file's entire export surface is treated as a Server Function reference
// boundary, which only ever wants async functions on it.
// =============================================================================

export interface VerifyWaitlistInviteResult {
  valid: boolean;
  // Only populated when valid: true.
  email?: string;
  firstName?: string;
  lastName?: string;
  agencyName?: string;
  // User-facing message for the "invalid" branch (missing token, no matching
  // row, or a row that exists but isn't status === 'approved' yet).
  error?: string;
}

export interface JoinWaitlistResult {
  success: boolean;
  // True when the email was already on the waitlist (a pre-existing row hit
  // the unique constraint) — the caller still shows the normal "you're on
  // the list" success state either way; this is exposed only in case a
  // caller ever wants to log/branch on it, never to change the user-facing copy.
  alreadyOnList?: boolean;
  error?: string;
}
