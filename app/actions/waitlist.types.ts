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
