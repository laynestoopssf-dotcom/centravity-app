"use server";

import { supabaseAdmin } from "./supabaseAdmin";
import { isOwnerLevelRole } from "../../utils/roles";
import type { SetTeamMemberPasswordPayload, SetTeamMemberPasswordResult } from "./adminAuth.types";

// =============================================================================
// Server Actions: Owner/Admin-triggered account management.
// -----------------------------------------------------------------------------
// Currently just one action — resetting a team member's password to a new
// temp value from Settings -> Manage Historical Data (see
// components/dashboard/HistoricalYtdEditor.tsx) — but split into its own
// file rather than bolted onto onboarding.ts/teamInvites.ts, since this is
// conceptually "manage an existing account's auth", not onboarding or
// invites.
//
// `supabaseAdmin` (./supabaseAdmin.ts) IS the service-role client the spec
// asked for — it's already exactly "a Supabase client initialized with
// SUPABASE_SERVICE_ROLE_KEY", constructed once via a lazy getter (so a
// missing env var surfaces as a clean { success: false, error } instead of
// crashing the whole Server Function at module-load time — see that file's
// own comment for why). Every other admin-only action in this codebase
// (onboarding.ts, teamInvites.ts) reuses the same shared instance rather
// than constructing a second one inline; doing the same here avoids a
// second, slightly-different copy of that lazy-init dance drifting out of
// sync with the original.
//
// SECURITY: mirrors requireOwnerLevelCaller in app/actions/teamInvites.ts
// exactly — the caller's identity and role are always re-derived
// server-side from `accessToken` (supabaseAdmin.auth.getUser + a profiles
// lookup), never trusted from the client payload. On top of that tier check,
// this action ALSO re-derives the TARGET's agency_id server-side and hard-
// rejects any id that doesn't match the caller's own agency — without that
// check, isOwnerLevelRole alone would let any agency's owner/admin reset the
// password of literally any user id on the platform, not just their own
// team. Errors are deliberately the same generic "Team member not found."
// whether the id doesn't exist at all or exists on a different agency, so
// this can never be used to enumerate other agencies' user ids.
// =============================================================================

async function requireOwnerLevelCaller(
  accessToken: string
): Promise<{ ok: true; agencyId: string } | { ok: false; error: string }> {
  if (!accessToken) return { ok: false, error: "Unauthorized: missing session." };

  const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !authUser?.user) {
    console.error("[adminAuth] failed to authenticate caller", authError);
    return { ok: false, error: "Unauthorized: invalid session." };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("agency_id, role")
    .eq("id", authUser.user.id)
    .maybeSingle();

  if (profileError || !profile?.agency_id) {
    console.error("[adminAuth] caller profile lookup failed", profileError);
    return { ok: false, error: "Could not verify your account. Please try again." };
  }

  if (!isOwnerLevelRole(profile.role as string)) {
    return { ok: false, error: "Only agency owners/admins can reset a team member's password." };
  }

  return { ok: true, agencyId: profile.agency_id as string };
}

export async function setTeamMemberPassword(
  payload: SetTeamMemberPasswordPayload
): Promise<SetTeamMemberPasswordResult> {
  try {
    const caller = await requireOwnerLevelCaller(payload?.accessToken);
    if (!caller.ok) return { success: false, error: caller.error };

    const targetUserId = (payload?.targetUserId || "").trim();
    if (!targetUserId) {
      return { success: false, error: "Missing team member id." };
    }

    const newPassword = payload?.newPassword || "";
    if (newPassword.length < 6) {
      return { success: false, error: "Password must be at least 6 characters." };
    }

    const { data: targetProfile, error: targetProfileError } = await supabaseAdmin
      .from("profiles")
      .select("agency_id")
      .eq("id", targetUserId)
      .maybeSingle();

    if (targetProfileError || !targetProfile) {
      console.error("[adminAuth] target profile lookup failed", targetProfileError);
      return { success: false, error: "Team member not found." };
    }

    if (targetProfile.agency_id !== caller.agencyId) {
      // Deliberately the exact same message as "doesn't exist at all" above
      // — see the file-level SECURITY note for why.
      console.warn(
        `[adminAuth] rejected cross-agency password reset attempt (caller agency ${caller.agencyId}, target ${targetUserId})`
      );
      return { success: false, error: "Team member not found." };
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    });

    if (updateError) {
      console.error("[adminAuth] updateUserById failed", updateError);
      return { success: false, error: updateError.message || "Failed to update password." };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("[adminAuth] setTeamMemberPassword unexpected error", err);
    const message = err instanceof Error ? err.message : "Unexpected server error.";
    return { success: false, error: message };
  }
}
