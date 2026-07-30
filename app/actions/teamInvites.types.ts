// Mirrors agency_invites.role's check constraint (scripts/add_agency_invites_table.sql)
// and profiles.role's values minus 'owner' — see DEFAULT_ROLES in
// components/SettingsTab.tsx for the same four options presented elsewhere.
export type TeamInviteRole = "admin" | "manager" | "producer" | "service";

export interface CreateTeamInvitePayload {
  accessToken: string;
  email: string;
  firstName: string;
  lastName: string;
  role: TeamInviteRole;
  officeId?: string | null;
}

export interface CreateTeamInviteResult {
  success: boolean;
  error?: string;
  // True/false only when the DB write succeeded — lets the UI distinguish
  // "invite created, but the email failed to send" (still success: true,
  // emailSent: false — see sendTeamInviteEmail's own comment for why this
  // isn't fire-and-forget) from an outright failure to create the invite at
  // all.
  emailSent?: boolean;
}

export interface ResendTeamInvitePayload {
  accessToken: string;
  inviteId: string;
}

export interface ResendTeamInviteResult {
  success: boolean;
  error?: string;
}

export interface VerifyTeamInviteResult {
  valid: boolean;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: TeamInviteRole;
  agencyName?: string;
  error?: string;
}

export interface AcceptTeamInvitePayload {
  token: string;
  password: string;
  // Lets the invitee correct a typo the inviter made — never trusted for
  // WHICH agency/role/office they land in, only their own display name.
  firstName?: string;
  lastName?: string;
}

export interface AcceptTeamInviteResult {
  success: boolean;
  error?: string;
  email?: string;
}
