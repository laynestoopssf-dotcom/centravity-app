// Plain type-only module — deliberately NOT marked "use server", same reason
// as app/actions/onboarding.types.ts and app/actions/teamInvites.types.ts:
// a "use server" file's entire export surface is treated as a Server
// Function reference boundary, which only ever wants async functions on it.

export interface SetTeamMemberPasswordPayload {
  accessToken: string;
  // The target profile/auth.users id whose password is being reset. Never
  // trusted for WHICH agency it belongs to — setTeamMemberPassword
  // re-derives that server-side and rejects a cross-agency id outright.
  targetUserId: string;
  newPassword: string;
}

export interface SetTeamMemberPasswordResult {
  success: boolean;
  error?: string;
}
