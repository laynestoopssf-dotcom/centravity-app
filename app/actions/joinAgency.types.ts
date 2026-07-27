// =============================================================================
// Plain type-only module — deliberately NOT marked "use server". See the
// identical note at the top of onboarding.types.ts for why: a "use server"
// file's entire export surface is treated as a Server Function reference
// boundary, which only ever wants async functions on it.
// =============================================================================

export interface JoinAgencyPayload {
  accessToken: string;
  // Same value an agency owner already sees under Settings -> Team ("Agency
  // Invite Code") and copies to share — see components/SettingsTab.tsx. It's
  // literally the agency's id, not a separate minted code, so any agency that
  // already exists today can be joined immediately with zero migration.
  inviteCode: string;
  fullName: string;
}

export interface JoinAgencyResult {
  success: boolean;
  agencyId?: string;
  agencyName?: string;
  error?: string;
}
