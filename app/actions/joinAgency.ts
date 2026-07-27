"use server";

import { supabaseAdmin, splitName, isMissingColumnError } from "./supabaseAdmin";
import type { JoinAgencyPayload, JoinAgencyResult } from "./joinAgency.types";

// =============================================================================
// Server Action: Join Existing Team (invite code)
// -----------------------------------------------------------------------------
// Consumed by app/page.tsx's "Join Existing Team" mode. Lets a brand-new
// signup skip the full OnboardingWizard entirely by attaching straight onto
// an existing agency instead of creating a new one.
//
// The "invite code" here is deliberately the SAME value already surfaced to
// owners today under Settings -> Team ("Agency Invite Code", see
// components/SettingsTab.tsx) — i.e. the agency's own id. There's no new
// invite_code column/migration needed: every agency that exists right now
// already has a working code its owner can copy and hand to a new hire.
//
// SECURITY: same rule as onboarding.ts — this file is a public Server
// Function boundary. The caller's identity is always re-derived from
// `accessToken` (supabaseAdmin.auth.getUser), never trusted from the client.
// The invite code is validated against a real row in `agencies` before this
// ever writes anything, so a wrong/garbage code can't attach a stranger's
// account to an agency that doesn't exist (or someone else's, since the
// lookup only ever matches an id that's actually present in `agencies`).
// =============================================================================
export async function joinAgencyWithInviteCode(
  payload: JoinAgencyPayload
): Promise<JoinAgencyResult> {
  try {
    if (!payload?.accessToken) {
      return { success: false, error: "Unauthorized: missing session." };
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(
      payload.accessToken
    );

    if (authError || !authUser?.user) {
      console.error("[joinAgency] failed to authenticate caller", authError);
      return { success: false, error: "Unauthorized: invalid session." };
    }

    const userId = authUser.user.id;
    const inviteCode = (payload.inviteCode || "").trim();

    if (!inviteCode) {
      return { success: false, error: "Please enter your agency's invite code." };
    }

    const { data: agency, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .select("id, name")
      .eq("id", inviteCode)
      .maybeSingle();

    // A code that isn't even a well-formed UUID makes Postgres reject the eq()
    // filter outright (22P02 — invalid input syntax for type uuid) instead of
    // just returning zero rows. Treat that exactly like "not found" rather
    // than leaking a raw Postgres error into the UI.
    if (agencyError && agencyError.code !== "22P02") {
      console.error("[joinAgency] agency lookup failed", agencyError);
      return { success: false, error: "Something went wrong validating that code. Please try again." };
    }

    if (!agency) {
      return {
        success: false,
        error: "That invite code doesn't match any agency. Double-check it with your agency admin.",
      };
    }

    // Land the new producer on the agency's existing primary office (same
    // "just take the first one" convention used for primaryOffice fallbacks
    // elsewhere — e.g. app/dashboard/cockpit/page.tsx) so their activity has
    // somewhere real to roll up into instead of a null office_id.
    const { data: office, error: officeError } = await supabaseAdmin
      .from("offices")
      .select("id")
      .eq("agency_id", agency.id)
      .limit(1)
      .maybeSingle();

    if (officeError) {
      console.error("[joinAgency] office lookup failed (non-fatal)", officeError);
    }

    // An agency with a real invite code but zero offices yet is an edge case
    // (e.g. the owner ran the legacy register_agency_owner RPC path, which
    // never creates one) — rather than leaving this producer's office_id
    // null, which several dashboard aggregations key off of, mint a minimal
    // one on the fly so they always land somewhere real.
    let officeId = office?.id || null;
    if (!officeId) {
      const { data: newOffice, error: createOfficeError } = await supabaseAdmin
        .from("offices")
        .insert([{ agency_id: agency.id, name: "Main Office" }])
        .select("id")
        .single();

      if (createOfficeError || !newOffice) {
        console.error("[joinAgency] fallback office creation failed (non-fatal)", createOfficeError);
      } else {
        officeId = newOffice.id as string;
      }
    }

    const { first_name, last_name } = splitName(payload.fullName);

    // Explicit role: 'producer' — joining via a valid invite code is treated
    // as a fully-vetted hire (the code itself IS the vetting), so there's no
    // separate "pending" status to bypass: this profile is immediately
    // active and can log activities the moment this upsert succeeds.
    // onboarding_completed: true skips them past the /dashboard gatekeeper's
    // OnboardingWizard redirect entirely — that wizard is an owner-only,
    // new-agency flow (see app/actions/onboarding.ts), not something a
    // producer joining an already-live agency should ever have to run.
    const baseProfileFields = {
      id: userId,
      agency_id: agency.id,
      office_id: officeId,
      role: "producer",
      first_name: first_name || "New",
      last_name: last_name || "Producer",
      is_archived: false,
      is_floater: false,
    };

    // onboarding_completed is an additive column (scripts/add_onboarding_completed_flag.sql)
    // that may not exist in every environment yet — retry without it rather than
    // failing the entire join over a metadata-only field the /dashboard gatekeeper
    // doesn't even require (it keys off agency_id, and only gates on
    // onboarding_completed for role === 'owner', never 'producer' — see
    // app/dashboard/page.tsx fetchProfile).
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({ ...baseProfileFields, onboarding_completed: true }, { onConflict: "id" });

    if (profileError && isMissingColumnError(profileError)) {
      const { error: retryError } = await supabaseAdmin
        .from("profiles")
        .upsert(baseProfileFields, { onConflict: "id" });

      if (retryError) {
        console.error("[joinAgency] profile upsert retry (no onboarding_completed) failed", retryError);
        return { success: false, error: retryError.message || "Failed to link your account to that agency." };
      }
    } else if (profileError) {
      console.error("[joinAgency] profile upsert failed", profileError);
      return { success: false, error: profileError.message || "Failed to link your account to that agency." };
    }

    return { success: true, agencyId: agency.id, agencyName: (agency.name as string) || "" };
  } catch (err: any) {
    console.error("[joinAgency] unexpected error", err);
    return { success: false, error: err?.message || "Unexpected server error." };
  }
}
