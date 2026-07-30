"use server";

import { supabaseAdmin, splitName, isMissingColumnError } from "./supabaseAdmin";
import { sendTeamInviteEmail } from "./email";
import { isOwnerLevelRole } from "../../utils/roles";
import type {
  CreateTeamInvitePayload,
  CreateTeamInviteResult,
  ResendTeamInvitePayload,
  ResendTeamInviteResult,
  VerifyTeamInviteResult,
  AcceptTeamInvitePayload,
  AcceptTeamInviteResult,
  TeamInviteRole,
} from "./teamInvites.types";

// =============================================================================
// Server Actions: Team Member Invite system.
// -----------------------------------------------------------------------------
// See scripts/add_agency_invites_table.sql for the full schema/RLS rationale.
// This is a THIRD, additive way to get someone onto an agency's roster,
// alongside the two that already exist:
//   - Onboarding Step 2 (saveStep2Roster below in onboarding.ts) — owner sets
//     a temp password directly, during their own onboarding wizard only.
//   - "Join a Team" (joinAgency.ts) — self-serve, agency-id-as-code, always
//     lands as a plain 'producer'.
// This one is per-person: the owner/admin picks the email + role (+ office)
// up front, an email goes out via Resend, and the invitee sets their own
// password at app/accept-invite/page.tsx.
//
// SECURITY: same rule as every other file here — the caller's identity and
// role are always re-derived server-side from `accessToken`
// (supabaseAdmin.auth.getUser + a profiles lookup), never trusted from the
// client payload. createTeamInvite/resendTeamInviteEmail additionally
// require isOwnerLevelRole() on the caller's own profile — RLS in
// scripts/add_agency_invites_table.sql enforces the same boundary for
// anything that ever hits this table directly with the anon key instead.
// verifyTeamInvite/acceptTeamInvite are deliberately the two PUBLIC actions
// here (no accessToken — the invitee has no session yet), mirroring
// verifyWaitlistInvite's shape in app/actions/waitlist.ts exactly.
// =============================================================================

const VALID_ROLES: TeamInviteRole[] = ["admin", "manager", "producer", "service"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireOwnerLevelCaller(
  accessToken: string
): Promise<{ ok: true; userId: string; agencyId: string; firstName: string; lastName: string } | { ok: false; error: string }> {
  if (!accessToken) return { ok: false, error: "Unauthorized: missing session." };

  const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !authUser?.user) {
    console.error("[teamInvites] failed to authenticate caller", authError);
    return { ok: false, error: "Unauthorized: invalid session." };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("agency_id, role, first_name, last_name")
    .eq("id", authUser.user.id)
    .maybeSingle();

  if (profileError || !profile?.agency_id) {
    console.error("[teamInvites] caller profile lookup failed", profileError);
    return { ok: false, error: "Could not verify your account. Please try again." };
  }

  if (!isOwnerLevelRole(profile.role)) {
    return { ok: false, error: "Only agency owners/admins can manage team invites." };
  }

  return {
    ok: true,
    userId: authUser.user.id,
    agencyId: profile.agency_id as string,
    firstName: (profile.first_name as string) || "",
    lastName: (profile.last_name as string) || "",
  };
}

export async function createTeamInvite(payload: CreateTeamInvitePayload): Promise<CreateTeamInviteResult> {
  try {
    const caller = await requireOwnerLevelCaller(payload?.accessToken);
    if (!caller.ok) return { success: false, error: caller.error };

    const email = (payload.email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return { success: false, error: "Please enter a valid email address." };
    }

    const role = VALID_ROLES.includes(payload.role) ? payload.role : "producer";
    const { first_name, last_name } = { first_name: (payload.firstName || "").trim(), last_name: (payload.lastName || "").trim() };

    // find_profile_by_email (scripts/add_agency_invites_table.sql) is the only
    // supported way to check auth.users by email — profiles has no email
    // column of its own, and auth.users isn't reachable over the normal
    // PostgREST API even for the service role. Any match (regardless of
    // agency) means this email already has a real Centravity account.
    const { data: existingProfile, error: lookupError } = await supabaseAdmin.rpc("find_profile_by_email", {
      p_email: email,
    });
    if (lookupError) {
      // Most likely cause: the migration in scripts/add_agency_invites_table.sql
      // hasn't been run against this Supabase project yet. Degrade to
      // skipping this check rather than blocking every invite outright —
      // the unique partial index + acceptTeamInvite's own createUser call
      // still catch a true duplicate later.
      console.error("[teamInvites] find_profile_by_email lookup failed (continuing without it)", lookupError);
    } else if (Array.isArray(existingProfile) && existingProfile.length > 0) {
      return { success: false, error: "This email is already associated with a Centravity account." };
    }

    const { data: existingInvite, error: existingInviteError } = await supabaseAdmin
      .from("agency_invites")
      .select("id")
      .eq("agency_id", caller.agencyId)
      .eq("status", "pending")
      .ilike("email", email)
      .maybeSingle();

    if (existingInviteError) {
      console.error("[teamInvites] existing-invite lookup failed", existingInviteError);
    } else if (existingInvite) {
      return { success: false, error: "An invite is already pending for this email address." };
    }

    const { data: agency, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .select("name")
      .eq("id", caller.agencyId)
      .maybeSingle();

    if (agencyError) {
      console.error("[teamInvites] agency lookup failed", agencyError);
    }

    const { data: invite, error: insertError } = await supabaseAdmin
      .from("agency_invites")
      .insert([
        {
          agency_id: caller.agencyId,
          office_id: payload.officeId || null,
          email,
          first_name: first_name || null,
          last_name: last_name || null,
          role,
          invited_by: caller.userId,
        },
      ])
      .select("invite_token")
      .single();

    if (insertError || !invite) {
      console.error("[teamInvites] invite insert failed", insertError);
      // The partial unique index (agency_id, lower(email)) where pending
      // surfaces as a 23505 here if the pre-check above raced with another
      // concurrent invite for the same address.
      if (insertError?.code === "23505") {
        return { success: false, error: "An invite is already pending for this email address." };
      }
      return { success: false, error: insertError?.message || "Failed to create invite." };
    }

    const inviterName = [caller.firstName, caller.lastName].filter(Boolean).join(" ").trim();
    const emailResult = await sendTeamInviteEmail({
      toEmail: email,
      inviterName,
      agencyName: (agency?.name as string) || "",
      role,
      inviteToken: invite.invite_token as string,
    });

    if (!emailResult.success) {
      console.error("[teamInvites] invite created but email failed to send", emailResult.error);
    }

    return { success: true, emailSent: emailResult.success };
  } catch (err: any) {
    console.error("[teamInvites] createTeamInvite unexpected error", err);
    return { success: false, error: err?.message || "Unexpected server error." };
  }
}

export async function resendTeamInviteEmail(payload: ResendTeamInvitePayload): Promise<ResendTeamInviteResult> {
  try {
    const caller = await requireOwnerLevelCaller(payload?.accessToken);
    if (!caller.ok) return { success: false, error: caller.error };

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("agency_invites")
      .select("email, role, invite_token, status, agency_id")
      .eq("id", payload.inviteId)
      .eq("agency_id", caller.agencyId)
      .maybeSingle();

    if (inviteError || !invite) {
      console.error("[teamInvites] resend lookup failed", inviteError);
      return { success: false, error: "Invite not found." };
    }
    if (invite.status !== "pending") {
      return { success: false, error: "This invite is no longer pending, so it can't be resent." };
    }

    const { data: agency } = await supabaseAdmin.from("agencies").select("name").eq("id", caller.agencyId).maybeSingle();
    const inviterName = [caller.firstName, caller.lastName].filter(Boolean).join(" ").trim();

    const emailResult = await sendTeamInviteEmail({
      toEmail: invite.email as string,
      inviterName,
      agencyName: (agency?.name as string) || "",
      role: invite.role as string,
      inviteToken: invite.invite_token as string,
    });

    if (!emailResult.success) {
      return { success: false, error: emailResult.error || "Failed to send invite email." };
    }

    await supabaseAdmin.from("agency_invites").update({ updated_at: new Date().toISOString() }).eq("id", payload.inviteId);

    return { success: true };
  } catch (err: any) {
    console.error("[teamInvites] resendTeamInviteEmail unexpected error", err);
    return { success: false, error: err?.message || "Unexpected server error." };
  }
}

// Public — no accessToken. Called from app/accept-invite/page.tsx the moment
// it loads, exactly like verifyWaitlistInvite (app/actions/waitlist.ts) is
// called from app/signup/page.tsx. Deliberately generic error messages so a
// guessed/expired token can't be used to enumerate valid invites.
export async function verifyTeamInvite(token: string): Promise<VerifyTeamInviteResult> {
  try {
    const trimmed = (token || "").trim();
    if (!trimmed) {
      return { valid: false, error: "This invite link is missing its token." };
    }

    const { data: invite, error } = await supabaseAdmin
      .from("agency_invites")
      .select("email, first_name, last_name, role, status, agency_id")
      .eq("invite_token", trimmed)
      .maybeSingle();

    if (error) {
      console.error("[teamInvites] invite lookup failed", error);
      return { valid: false, error: "Something went wrong validating your invite. Please try again." };
    }

    if (!invite || invite.status !== "pending" || !invite.email) {
      return { valid: false, error: "Invalid or expired invite link." };
    }

    const { data: agency } = await supabaseAdmin.from("agencies").select("name").eq("id", invite.agency_id).maybeSingle();

    return {
      valid: true,
      email: invite.email as string,
      firstName: (invite.first_name as string) || "",
      lastName: (invite.last_name as string) || "",
      role: invite.role as TeamInviteRole,
      agencyName: (agency?.name as string) || "",
    };
  } catch (err: any) {
    console.error("[teamInvites] verifyTeamInvite unexpected error", err);
    return { valid: false, error: err?.message || "Unexpected server error." };
  }
}

// Public — no accessToken (the invitee has no session yet). Creates the real
// auth.users + profiles row, same shape as joinAgencyWithInviteCode's own
// profile insert (see joinAgency.ts) — onboarding_completed: true for the
// same reason: this is an existing, already-live agency, not a new one, so
// there's no owner wizard for this person to ever run.
export async function acceptTeamInvite(payload: AcceptTeamInvitePayload): Promise<AcceptTeamInviteResult> {
  try {
    const token = (payload?.token || "").trim();
    if (!token) return { success: false, error: "This invite link is missing its token." };

    const password = payload.password || "";
    if (password.length < 6) {
      return { success: false, error: "Password must be at least 6 characters." };
    }

    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("agency_invites")
      .select("id, email, first_name, last_name, role, office_id, status, agency_id")
      .eq("invite_token", token)
      .maybeSingle();

    if (inviteError || !invite || invite.status !== "pending" || !invite.email) {
      console.error("[teamInvites] accept lookup failed", inviteError);
      return { success: false, error: "Invalid or expired invite link." };
    }

    const { first_name: fallbackFirst, last_name: fallbackLast } = splitName(
      [payload.firstName, payload.lastName].filter(Boolean).join(" ")
    );
    const first_name = (payload.firstName || "").trim() || (invite.first_name as string) || fallbackFirst || "New";
    const last_name = (payload.lastName || "").trim() || (invite.last_name as string) || fallbackLast || "Team Member";

    const { data: createdAuth, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email as string,
      password,
      email_confirm: true,
      user_metadata: { full_name: `${first_name} ${last_name}`.trim() },
    });

    if (createUserError || !createdAuth?.user) {
      console.error("[teamInvites] createUser failed", createUserError);
      const message = /already.*registered|already.*exists/i.test(createUserError?.message || "")
        ? "An account with this email already exists. Try logging in instead."
        : createUserError?.message || "Failed to create your account.";
      return { success: false, error: message };
    }

    const authUserId = createdAuth.user.id;

    // Fall back to the agency's first office if the inviter didn't pick one
    // (single-location agency, or they left it blank) — same "just take the
    // first one" convention joinAgencyWithInviteCode already uses.
    let officeId = (invite.office_id as string) || null;
    if (!officeId) {
      const { data: office } = await supabaseAdmin
        .from("offices")
        .select("id")
        .eq("agency_id", invite.agency_id)
        .limit(1)
        .maybeSingle();
      officeId = office?.id || null;
    }

    const baseProfileFields = {
      id: authUserId,
      agency_id: invite.agency_id,
      office_id: officeId,
      role: invite.role,
      first_name,
      last_name,
      is_archived: false,
      is_floater: false,
    };

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert([{ ...baseProfileFields, onboarding_completed: true }]);

    if (profileError && isMissingColumnError(profileError)) {
      const { error: retryError } = await supabaseAdmin.from("profiles").insert([baseProfileFields]);
      if (retryError) {
        console.error("[teamInvites] profile insert retry (no onboarding_completed) failed", retryError);
        return { success: false, error: retryError.message || "Failed to finish setting up your account." };
      }
    } else if (profileError) {
      console.error("[teamInvites] profile insert failed", profileError);
      return { success: false, error: profileError.message || "Failed to finish setting up your account." };
    }

    const { error: updateInviteError } = await supabaseAdmin
      .from("agency_invites")
      .update({ status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    if (updateInviteError) {
      // Best-effort — the account is already fully created and usable at
      // this point, so a failure here (e.g. a stale RLS/migration gap) must
      // never be surfaced as a failure to the person who just successfully
      // signed up.
      console.error("[teamInvites] failed to mark invite accepted (non-fatal)", updateInviteError);
    }

    return { success: true, email: invite.email as string };
  } catch (err: any) {
    console.error("[teamInvites] acceptTeamInvite unexpected error", err);
    return { success: false, error: err?.message || "Unexpected server error." };
  }
}
