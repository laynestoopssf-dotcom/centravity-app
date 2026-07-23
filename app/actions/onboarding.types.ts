// =============================================================================
// Plain type-only module — deliberately NOT marked "use server".
// -----------------------------------------------------------------------------
// A "use server" file's entire export surface is treated as a Server Function
// reference boundary — every export gets proxied so Client Components can
// invoke it as an RPC. That boundary is only meant for async functions.
// Keeping these interfaces in their own ordinary module (rather than exported
// alongside the step actions in onboarding.ts) guarantees they can never be
// mistaken for — or collide with — a server action/cache reference during
// the client/server bundle split. Import these types directly wherever needed;
// import the actions themselves from ./onboarding.ts.
// =============================================================================

export type TeamMemberRole = "Manager" | "Producer" | "Admin" | "Service & Retention";

// A single roster row as tracked by the wizard's client-side state.
// `authUserId` is the load-bearing field for "save-as-you-go" idempotency:
//   - null  -> this row has never been persisted; saveStep2Roster will create
//              a brand-new auth.users + profiles row for it.
//   - set   -> this row already has a real profiles row (id === authUserId);
//              saveStep2Roster will UPDATE that row in place, never re-create.
export interface OnboardingTeamMemberInput {
  id: string;
  authUserId: string | null;
  name: string;
  email: string;
  role: TeamMemberRole;
  tempPassword: string;
}

// The full Step 3 YTD Starting Line matrix — Apps + Premium for each of the
// four core lines. Shared by the owner's own line (Step3Payload.ownerYtd),
// each roster member's line (OnboardingTeamMemberYtdInput), and the hydrated
// read-back shapes (OnboardingStateTeamMember, OnboardingState.ownerYtd) so
// the field names are identical end-to-end — no relabeling needed when
// spreading server state straight into the wizard's local form state.
export interface YtdMatrixFields {
  ytdAutoApps?: number | "";
  ytdAutoPremium?: number | "";
  ytdFireApps?: number | "";
  ytdFirePremium?: number | "";
  ytdLifeApps?: number | "";
  ytdLifePremium?: number | "";
  ytdHealthApps?: number | "";
  ytdHealthPremium?: number | "";
}

export interface OnboardingTeamMemberYtdInput extends YtdMatrixFields {
  authUserId: string;
}

// ---- Step 1: Agency Setup ----
export interface Step1Payload {
  accessToken: string;
  agencyName: string;
  primaryOfficeLocation: string;
  ownerName: string;
}

export interface Step1Result {
  success: boolean;
  agencyId?: string;
  officeId?: string;
  ownerId?: string;
  error?: string;
}

// ---- Step 2: The Roster ----
export interface Step2Payload {
  accessToken: string;
  // Deliberately does NOT accept agencyId/officeId from the client — the server
  // re-derives both from the authenticated caller's own profile row (set during
  // Step 1) so a tampered payload can never write a roster into someone else's
  // agency.
  teamMembers: OnboardingTeamMemberInput[];
}

export interface TeamMemberSaveResult {
  // Echoes back whichever `id` the client sent for this row, so the UI can
  // match the result up to the right row even before authUserId is known.
  clientId: string;
  authUserId: string | null;
  email: string;
  success: boolean;
  error?: string;
}

export interface Step2Result {
  success: boolean;
  teamMembers: TeamMemberSaveResult[];
  error?: string;
}

// ---- Step 3: YTD Starting Line ----
export interface Step3Payload {
  accessToken: string;
  // The owner isn't part of the Step 2 roster array (they're linked directly in
  // Step 1), but they still get their own YTD starting line in the Step 3 grid —
  // tracked separately here rather than smuggled into `teamMembers`.
  ownerYtd?: YtdMatrixFields;
  teamMembers: OnboardingTeamMemberYtdInput[];
}

export interface Step3Result {
  success: boolean;
  failures?: { authUserId: string; error: string }[];
  error?: string;
}

// ---- Step 4: The Agency Baseline ----
// These map onto EXISTING public.offices columns (the primary office created
// in Step 1) — see the architecture note at the top of
// scripts/add_onboarding_step4_5_columns.sql for why. Field names here use the
// wizard's own vocabulary; app/actions/onboarding.ts is what translates them
// onto the underlying offices.* column names.
export interface Step4Payload {
  accessToken: string;
  bookSizeAutoPremium?: number | "";
  bookSizeAutoCount?: number | "";
  retentionRateAuto?: number | "";
  bookSizeFirePremium?: number | "";
  bookSizeFireCount?: number | "";
  retentionRateFire?: number | "";
  bookSizeLifePremium?: number | "";
  bookSizeLifeCount?: number | "";
  bookSizeHealthPremium?: number | "";
  bookSizeHealthCount?: number | "";
}

export interface Step4Result {
  success: boolean;
  error?: string;
}

// ---- Step 5: Goals & Compensation ----
export interface Step5Payload {
  accessToken: string;
  targetAuto?: number | "";
  targetFire?: number | "";
  targetLife?: number | "";
  targetHealth?: number | "";
  targetCommercial?: number | "";
  baseCompAuto?: number | "";
  baseCompFire?: number | "";
  baseCompLife?: number | "";
  baseCompHealth?: number | "";
  agencyVcTotal?: number | "";
}

export interface Step5Result {
  success: boolean;
  error?: string;
}

// ---- Resume / hydration ----
export interface FetchOnboardingStatePayload {
  accessToken: string;
}

export interface OnboardingStateTeamMember extends YtdMatrixFields {
  id: string;
  authUserId: string;
  name: string;
  email: string;
  role: TeamMemberRole;
  tempPassword: string;
}

export interface OnboardingState {
  // false only for a brand-new caller who has never saved Step 1 at all.
  found: boolean;
  agencyId: string | null;
  officeId: string | null;
  agencyName: string;
  primaryOfficeLocation: string;
  ownerName: string;
  ownerYtd: YtdMatrixFields;
  teamMembers: OnboardingStateTeamMember[];

  // Step 4 — mirrors Step4Payload, read back from offices.*
  bookSizeAutoPremium: number | "";
  bookSizeAutoCount: number | "";
  retentionRateAuto: number | "";
  bookSizeFirePremium: number | "";
  bookSizeFireCount: number | "";
  retentionRateFire: number | "";
  bookSizeLifePremium: number | "";
  bookSizeLifeCount: number | "";
  bookSizeHealthPremium: number | "";
  bookSizeHealthCount: number | "";

  // Step 5 — mirrors Step5Payload, read back from offices.*
  targetAuto: number | "";
  targetFire: number | "";
  targetLife: number | "";
  targetHealth: number | "";
  targetCommercial: number | "";
  baseCompAuto: number | "";
  baseCompFire: number | "";
  baseCompLife: number | "";
  baseCompHealth: number | "";
  agencyVcTotal: number | "";

  // Which step the wizard should resume on. Driven by profiles.onboarding_step
  // (see scripts/add_onboarding_step4_5_columns.sql) when present, with a
  // heuristic fallback for rows saved before that column existed:
  //   no agency yet                       -> 1
  //   agency exists, zero roster members  -> 2
  //   roster members exist                -> 3
  resumeStep: 1 | 2 | 3 | 4 | 5;
}

export interface FetchOnboardingStateResult {
  success: boolean;
  state?: OnboardingState;
  error?: string;
}
