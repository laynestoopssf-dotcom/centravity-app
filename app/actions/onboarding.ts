"use server";

import { createClient } from "@supabase/supabase-js";
import type {
  Step1Payload,
  Step1Result,
  Step2Payload,
  Step2Result,
  Step3Payload,
  Step3Result,
  Step4Payload,
  Step4Result,
  Step5Payload,
  Step5Result,
  TeamMemberSaveResult,
  FetchOnboardingStatePayload,
  FetchOnboardingStateResult,
  OnboardingStateTeamMember,
  TeamMemberRole,
  YtdMatrixFields,
} from "./onboarding.types";

// =============================================================================
// Server Actions: Agency Onboarding ("save-as-you-go")
// -----------------------------------------------------------------------------
// Consumed by components/OnboardingWizard.tsx. Split into one action per wizard
// step (plus a hydration action) so a user who closes the browser mid-setup
// can come back and resume exactly where they left off, instead of losing
// everything if they don't reach the final "Complete Setup & Launch" click.
//
//   saveStep1Foundation  — upserts agencies/offices, links the owner's profile
//   saveStep2Roster      — upserts team members' profiles (creates auth users
//                           for brand-new rows only; bypasses email verification
//                           exactly as the old single-shot action did)
//   saveStep3YTD         — writes each team member's (+ the owner's) YTD
//                           starting line
//   saveStep4Baseline    — writes the agency's book size / retention baseline
//   saveStep5Goals       — writes production targets, base comp, and the VC
//                           rate; marks the whole flow complete
//   fetchOnboardingState — reads back whatever's been saved so far so the
//                           wizard can hydrate state and jump to the right step
//
// Runs entirely on the server so we can use the Supabase SERVICE ROLE key —
// required to create auth.users rows for team members
// (supabaseAdmin.auth.admin.createUser({ email_confirm: true, ... })) and to
// write agencies/offices/profiles before RLS would otherwise allow it.
//
// SECURITY: This file is a Server Function boundary — every export here is
// reachable via a direct POST request, not just from the wizard UI. None of
// these actions trust a client-supplied id: each one re-derives the caller's
// identity from `accessToken` (via supabaseAdmin.auth.getUser) and re-derives
// the caller's OWN agency/office from their profile row rather than trusting
// agencyId/officeId if a client ever sent them. Never import this module from
// a Client Component — only call the exported async functions.
//
// ARCHITECTURE NOTE (Steps 4 & 5): almost everything these two steps collect
// already has a live, actively-read column on public.offices — populated
// today via Settings → Office Goals (components/SettingsTab.tsx) and consumed
// by the Revenue/VC engine in app/dashboard/page.tsx. There's a deliberate
// prior rule in this codebase: book sizes (and friends) live on `offices`,
// never on `agencies`. So Steps 4/5 write into those SAME existing offices
// columns on the primary office created in Step 1, instead of minting a
// second, parallel, never-displayed set of columns — see
// scripts/add_onboarding_step4_5_columns.sql for the full field mapping and
// the couple of genuinely new columns it adds.
//
// IMPORTANT: This file (and any "use server" file) must export ONLY async
// functions. Types live in ./onboarding.types.ts (a plain module) and are
// imported here with `import type` so they're fully erased and never become
// part of this file's Server Function export surface. Likewise, this file
// intentionally does not import next/cache (revalidatePath/revalidateTag) —
// /dashboard is a fully client-rendered SPA view fetched via supabase-js, not
// Next's fetch/data cache, so there's nothing here for the Next cache to
// invalidate.
// =============================================================================

// --- Supabase Service Role client (server-only, bypasses RLS) ---
// NEXT_PUBLIC_SUPABASE_URL in .env.local has a `/rest/v1/` suffix baked in
// (see the identical auto-fixer in utils/supabase.ts, which strips it before
// constructing the anon client). createClient() expects the bare project URL
// and appends /auth/v1, /rest/v1, /realtime/v1 itself — passing a URL that
// already ends in /rest/v1 makes every admin auth call (e.g. auth.getUser(),
// auth.admin.createUser()) resolve to .../rest/v1/auth/v1/... instead of
// .../auth/v1/..., which 404s and surfaces as a generic, misleading
// "Unauthorized: invalid session." Normalize it the same way so this client
// is correct regardless of how the env var is formatted.
function normalizeSupabaseUrl(raw: string): string {
  let url = (raw || "").trim().replace(/['"]/g, "");
  url = url.replace(/\/rest\/v1\/?$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

const supabaseAdmin = createClient(
  normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!),
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Maps the wizard's display-cased roles to the lowercase role ids used
// throughout profiles.role / DEFAULT_ROLES in components/SettingsTab.tsx.
const ROLE_ID_MAP: Record<TeamMemberRole, string> = {
  Manager: "manager",
  Producer: "producer",
  Admin: "admin",
  "Service & Retention": "service",
};

const ROLE_DISPLAY_MAP: Record<string, TeamMemberRole> = {
  manager: "Manager",
  producer: "Producer",
  admin: "Admin",
  service: "Service & Retention",
};

function splitName(fullName: string): { first_name: string; last_name: string } {
  const trimmed = (fullName || "").trim();
  if (!trimmed) return { first_name: "", last_name: "" };
  const parts = trimmed.split(/\s+/);
  const first_name = parts.shift() || "";
  const last_name = parts.join(" ");
  return { first_name, last_name };
}

function toFiniteNumber(v: number | "" | null | undefined): number {
  if (v === "" || v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Flattens a Step 3 YTD matrix (Apps + Premium x Auto/Fire/Life/Health) into
// the 8 starting_ytd_* columns on profiles (see
// scripts/add_onboarding_step3_ytd_matrix.sql), plus the original blended
// starting_ytd_premium / starting_ytd_bound_apps pair — nothing else in the
// app reads those two today, but they're kept as a free accurate rollup
// (sum of the 4 lines) rather than dropped, in case something wants a single
// blended number later without re-summing the matrix itself.
function ytdMatrixToRow(matrix: YtdMatrixFields | undefined) {
  const autoApps = toFiniteNumber(matrix?.ytdAutoApps);
  const autoPremium = toFiniteNumber(matrix?.ytdAutoPremium);
  const fireApps = toFiniteNumber(matrix?.ytdFireApps);
  const firePremium = toFiniteNumber(matrix?.ytdFirePremium);
  const lifeApps = toFiniteNumber(matrix?.ytdLifeApps);
  const lifePremium = toFiniteNumber(matrix?.ytdLifePremium);
  const healthApps = toFiniteNumber(matrix?.ytdHealthApps);
  const healthPremium = toFiniteNumber(matrix?.ytdHealthPremium);

  return {
    starting_ytd_auto_apps: autoApps,
    starting_ytd_auto_premium: autoPremium,
    starting_ytd_fire_apps: fireApps,
    starting_ytd_fire_premium: firePremium,
    starting_ytd_life_apps: lifeApps,
    starting_ytd_life_premium: lifePremium,
    starting_ytd_health_apps: healthApps,
    starting_ytd_health_premium: healthPremium,
    starting_ytd_premium: autoPremium + firePremium + lifePremium + healthPremium,
    starting_ytd_bound_apps: autoApps + fireApps + lifeApps + healthApps,
  };
}

function numberOrEmpty(v: unknown): number | "" {
  return typeof v === "number" && Number.isFinite(v) ? v : "";
}

// A column missing from the DB can surface two different ways depending on
// the code path: a raw Postgres error (42703 = "column does not exist") or a
// PostgREST-level error (PGRST204 = "Could not find the '<col>' column ... in
// the schema cache"). In practice PGRST204 is what actually shows up for
// .update()/.insert() calls through supabase-js — 42703 alone was never
// enough to catch a genuinely-missing additive-migration column, it would
// fall through and get reported as a hard failure instead of degrading
// gracefully. Treat both as "this column doesn't exist yet, skip it."
function isMissingColumnError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

// Inverse of ytdMatrixToRow — reads a profiles row's 8 starting_ytd_* columns
// back into the wire shape the wizard hydrates from.
function rowToYtdMatrix(row: Record<string, unknown> | null | undefined): YtdMatrixFields {
  return {
    ytdAutoApps: numberOrEmpty(row?.starting_ytd_auto_apps),
    ytdAutoPremium: numberOrEmpty(row?.starting_ytd_auto_premium),
    ytdFireApps: numberOrEmpty(row?.starting_ytd_fire_apps),
    ytdFirePremium: numberOrEmpty(row?.starting_ytd_fire_premium),
    ytdLifeApps: numberOrEmpty(row?.starting_ytd_life_apps),
    ytdLifePremium: numberOrEmpty(row?.starting_ytd_life_premium),
    ytdHealthApps: numberOrEmpty(row?.starting_ytd_health_apps),
    ytdHealthPremium: numberOrEmpty(row?.starting_ytd_health_premium),
  };
}

// ---- Shared auth/context helpers ----

async function authenticateCaller(
  accessToken: string | undefined
): Promise<{ ok: true; ownerId: string } | { ok: false; error: string }> {
  if (!accessToken) return { ok: false, error: "Unauthorized: missing session." };

  const { data: authUser, error } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !authUser?.user) {
    console.error("[onboarding] failed to authenticate caller", error);
    return { ok: false, error: "Unauthorized: invalid session." };
  }

  return { ok: true, ownerId: authUser.user.id };
}

// Re-derives the caller's own agency/office from their profile row — never
// trust a client-supplied agencyId/officeId.
async function getCallerAgencyContext(
  ownerId: string
): Promise<{ agencyId: string; officeId: string | null } | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("agency_id, office_id")
    .eq("id", ownerId)
    .maybeSingle();

  if (error || !data?.agency_id) return null;
  return { agencyId: data.agency_id as string, officeId: (data.office_id as string) || null };
}

// Advances the owner's "resume here next time" pointer — never regresses it,
// so re-saving an earlier step after already being further along doesn't
// bounce a returning user backwards. Tolerant of profiles.onboarding_step not
// existing yet (see scripts/add_onboarding_step4_5_columns.sql): this is a
// UX nicety for resuming, never something that should block an actual save.
async function advanceOnboardingStep(ownerId: string, nextStep: number): Promise<void> {
  const { data: current, error: readError } = await supabaseAdmin
    .from("profiles")
    .select("onboarding_step")
    .eq("id", ownerId)
    .maybeSingle();

  if (readError && !isMissingColumnError(readError)) {
    console.error("[onboarding] failed to read onboarding_step", readError);
  }

  const currentStep = typeof current?.onboarding_step === "number" ? current.onboarding_step : 1;
  if (nextStep <= currentStep) return;

  const { error: writeError } = await supabaseAdmin
    .from("profiles")
    .update({ onboarding_step: nextStep })
    .eq("id", ownerId);

  if (writeError && !isMissingColumnError(writeError)) {
    console.error("[onboarding] failed to advance onboarding_step", writeError);
  }
}

// =============================================================================
// Step 1 — Agency Setup
// =============================================================================
export async function saveStep1Foundation(payload: Step1Payload): Promise<Step1Result> {
  try {
    const auth = await authenticateCaller(payload.accessToken);
    if (!auth.ok) return { success: false, error: auth.error };
    const ownerId = auth.ownerId;

    if (!payload.agencyName?.trim()) {
      return { success: false, ownerId, error: "Agency name is required." };
    }

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from("profiles")
      .select("agency_id, office_id")
      .eq("id", ownerId)
      .maybeSingle();

    if (existingProfileError) {
      console.error("[onboarding:step1] failed to check existing profile", existingProfileError);
      return { success: false, ownerId, error: existingProfileError.message };
    }

    let agencyId = (existingProfile?.agency_id as string) || undefined;
    let officeId = (existingProfile?.office_id as string) || undefined;
    const { first_name: ownerFirst, last_name: ownerLast } = splitName(payload.ownerName);

    const upsertOwner = (fields: Record<string, unknown>) =>
      supabaseAdmin.from("profiles").upsert(
        {
          id: ownerId,
          role: "owner",
          is_archived: false,
          is_floater: false,
          first_name: ownerFirst || "Agency",
          last_name: ownerLast || "Owner",
          ...fields,
        },
        { onConflict: "id" }
      );

    if (agencyId) {
      // Re-saving Step 1 (Save Progress / Next clicked again, or coming back
      // after a reload) — update the existing agency in place. Never insert a
      // second one.
      const { error: agencyUpdateError } = await supabaseAdmin
        .from("agencies")
        .update({ name: payload.agencyName.trim() })
        .eq("id", agencyId);

      if (agencyUpdateError) {
        console.error("[onboarding:step1] agency update failed", agencyUpdateError);
        return { success: false, ownerId, agencyId, officeId, error: agencyUpdateError.message };
      }
    } else {
      const { data: agency, error: agencyError } = await supabaseAdmin
        .from("agencies")
        .insert([{ name: payload.agencyName.trim() }])
        .select()
        .single();

      if (agencyError || !agency) {
        console.error("[onboarding:step1] agency insert failed", agencyError);
        return { success: false, ownerId, error: agencyError?.message || "Failed to create agency." };
      }
      agencyId = agency.id as string;

      // Checkpoint immediately: link the owner to the new agency before
      // touching offices. Without this, a retry after a mid-step failure (e.g.
      // the office insert below fails) would find no agency_id on the owner's
      // profile and mint a second, orphaned agency row on the next attempt.
      const { error: checkpointError } = await upsertOwner({ agency_id: agencyId });
      if (checkpointError) {
        console.error("[onboarding:step1] owner->agency checkpoint failed", checkpointError);
        return { success: false, ownerId, agencyId, error: checkpointError.message };
      }
    }

    if (officeId) {
      const { error: officeUpdateError } = await supabaseAdmin
        .from("offices")
        .update({ name: payload.primaryOfficeLocation?.trim() || "Main Office" })
        .eq("id", officeId);

      if (officeUpdateError) {
        console.error("[onboarding:step1] office update failed", officeUpdateError);
        return { success: false, ownerId, agencyId, officeId, error: officeUpdateError.message };
      }
    } else {
      const { data: office, error: officeError } = await supabaseAdmin
        .from("offices")
        .insert([
          { agency_id: agencyId, name: payload.primaryOfficeLocation?.trim() || "Main Office" },
        ])
        .select()
        .single();

      if (officeError || !office) {
        console.error("[onboarding:step1] office insert failed", officeError);
        return {
          success: false,
          ownerId,
          agencyId,
          error: officeError?.message || "Failed to create primary office.",
        };
      }
      officeId = office.id as string;
    }

    const { error: ownerProfileError } = await upsertOwner({
      agency_id: agencyId,
      office_id: officeId,
    });

    if (ownerProfileError) {
      console.error("[onboarding:step1] owner profile link failed", ownerProfileError);
      return {
        success: false,
        agencyId,
        officeId,
        ownerId,
        error: `Agency saved, but failed to link owner profile: ${ownerProfileError.message}`,
      };
    }

    await advanceOnboardingStep(ownerId, 2);

    return { success: true, agencyId, officeId, ownerId };
  } catch (err: any) {
    console.error("[onboarding:step1] unexpected error", err);
    return { success: false, error: err?.message || "Unexpected server error." };
  }
}

// =============================================================================
// Step 2 — The Roster
// =============================================================================
export async function saveStep2Roster(payload: Step2Payload): Promise<Step2Result> {
  const results: TeamMemberSaveResult[] = [];

  try {
    const auth = await authenticateCaller(payload.accessToken);
    if (!auth.ok) return { success: false, teamMembers: results, error: auth.error };

    const context = await getCallerAgencyContext(auth.ownerId);
    if (!context || !context.officeId) {
      return {
        success: false,
        teamMembers: results,
        error: "Finish Step 1 (Agency Setup) before adding your roster.",
      };
    }
    const { agencyId, officeId } = context;

    for (const member of payload.teamMembers || []) {
      const clientId = member.id;
      const name = member.name?.trim();
      const email = member.email?.trim().toLowerCase();

      if (!name || !email) {
        results.push({
          clientId,
          authUserId: member.authUserId || null,
          email: email || "(missing email)",
          success: false,
          error: "Missing name or email — skipped.",
        });
        continue;
      }

      const { first_name, last_name } = splitName(name);
      const role = ROLE_ID_MAP[member.role] || "producer";

      if (member.authUserId) {
        // Already created in a previous save — update in place, scoped to the
        // caller's own agency so a tampered authUserId can never touch another
        // agency's profile row. Never re-create the auth account.
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({ first_name, last_name, role })
          .eq("id", member.authUserId)
          .eq("agency_id", agencyId);

        if (updateError) {
          console.error(`[onboarding:step2] profile update failed for ${email}`, updateError);
          results.push({ clientId, authUserId: member.authUserId, email, success: false, error: updateError.message });
          continue;
        }

        results.push({ clientId, authUserId: member.authUserId, email, success: true });
        continue;
      }

      // Brand new roster row — create the auth account first (bypassing email
      // verification exactly as before), then the profile row.
      const { data: createdAuth, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: member.tempPassword || undefined,
        email_confirm: true,
        user_metadata: { full_name: name },
      });

      if (createUserError || !createdAuth?.user) {
        console.error(`[onboarding:step2] createUser failed for ${email}`, createUserError);
        results.push({
          clientId,
          authUserId: null,
          email,
          success: false,
          error: createUserError?.message || "Auth account creation failed.",
        });
        continue;
      }

      const authUserId = createdAuth.user.id;

      const { error: profileInsertError } = await supabaseAdmin.from("profiles").insert([
        {
          id: authUserId,
          agency_id: agencyId,
          office_id: officeId,
          first_name,
          last_name,
          role,
          is_archived: false,
          is_floater: false,
        },
      ]);

      if (profileInsertError) {
        console.error(`[onboarding:step2] profile insert failed for ${email}`, profileInsertError);
        // Roll back the orphaned auth user so a retry doesn't collide on a duplicate email.
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        results.push({ clientId, authUserId: null, email, success: false, error: profileInsertError.message });
        continue;
      }

      results.push({ clientId, authUserId, email, success: true });
    }

    const anyFailures = results.some((m) => !m.success);

    if (!anyFailures) {
      await advanceOnboardingStep(auth.ownerId, 3);
    }

    return {
      success: !anyFailures,
      teamMembers: results,
      error: anyFailures ? "One or more team members failed to save — see details below." : undefined,
    };
  } catch (err: any) {
    console.error("[onboarding:step2] unexpected error", err);
    return { success: false, teamMembers: results, error: err?.message || "Unexpected server error." };
  }
}

// =============================================================================
// Step 3 — YTD Starting Line
// =============================================================================
export async function saveStep3YTD(payload: Step3Payload): Promise<Step3Result> {
  const failures: { authUserId: string; error: string }[] = [];

  try {
    const auth = await authenticateCaller(payload.accessToken);
    if (!auth.ok) return { success: false, error: auth.error };

    const context = await getCallerAgencyContext(auth.ownerId);
    if (!context) {
      return { success: false, error: "Finish Step 1 (Agency Setup) first." };
    }
    const { agencyId } = context;

    const touchedIds: string[] = [];

    // The owner isn't part of the Step 2 roster array (they're linked directly
    // in Step 1), but the YTD grid still shows — and can save — their own line.
    if (payload.ownerYtd) {
      const { error: ownerYtdError } = await supabaseAdmin
        .from("profiles")
        .update(ytdMatrixToRow(payload.ownerYtd))
        .eq("id", auth.ownerId);

      if (ownerYtdError && isMissingColumnError(ownerYtdError)) {
        console.warn(
          "[onboarding:step3] YTD matrix columns missing on profiles — run scripts/add_onboarding_step3_ytd_matrix.sql. Skipping owner YTD.",
          ownerYtdError.message
        );
      } else if (ownerYtdError) {
        console.error("[onboarding:step3] owner YTD update failed", ownerYtdError);
        failures.push({ authUserId: auth.ownerId, error: ownerYtdError.message });
      } else {
        touchedIds.push(auth.ownerId);
      }
    }

    for (const member of payload.teamMembers || []) {
      if (!member.authUserId) continue; // unsaved roster row — nothing to attach YTD to yet

      const { error: updateError } = await supabaseAdmin
        .from("profiles")
        .update(ytdMatrixToRow(member))
        .eq("id", member.authUserId)
        .eq("agency_id", agencyId);

      if (updateError && isMissingColumnError(updateError)) {
        console.warn(
          `[onboarding:step3] YTD matrix columns missing on profiles — run scripts/add_onboarding_step3_ytd_matrix.sql. Skipping for ${member.authUserId}.`,
          updateError.message
        );
        continue;
      }

      if (updateError) {
        console.error(`[onboarding:step3] YTD update failed for ${member.authUserId}`, updateError);
        failures.push({ authUserId: member.authUserId, error: updateError.message });
        continue;
      }

      touchedIds.push(member.authUserId);
    }

    // Roster members' own onboarding_completed flag flips here — they don't
    // participate in Steps 4/5 at all, those are owner-only agency settings.
    // Metadata only (see scripts/add_onboarding_completed_flag.sql).
    const memberIdsToComplete = touchedIds.filter((id) => id !== auth.ownerId);
    if (memberIdsToComplete.length > 0) {
      const { error: completeError } = await supabaseAdmin
        .from("profiles")
        .update({ onboarding_completed: true })
        .in("id", memberIdsToComplete);

      if (completeError && !isMissingColumnError(completeError)) {
        console.error("[onboarding:step3] failed to flip onboarding_completed for team members", completeError);
      }
    }

    if (failures.length === 0) {
      await advanceOnboardingStep(auth.ownerId, 4);
    }

    return {
      success: failures.length === 0,
      failures: failures.length ? failures : undefined,
      error: failures.length ? "Some team members' YTD data failed to save." : undefined,
    };
  } catch (err: any) {
    console.error("[onboarding:step3] unexpected error", err);
    return { success: false, error: err?.message || "Unexpected server error." };
  }
}

// =============================================================================
// Step 4 — The Agency Baseline
// -----------------------------------------------------------------------------
// Writes book size (premium + policy count) and retention/lapse rate onto the
// primary office created in Step 1 — see the architecture note at the top of
// this file / scripts/add_onboarding_step4_5_columns.sql for why these map
// onto EXISTING offices.* columns instead of new agencies.* ones.
// =============================================================================
export async function saveStep4Baseline(payload: Step4Payload): Promise<Step4Result> {
  try {
    const auth = await authenticateCaller(payload.accessToken);
    if (!auth.ok) return { success: false, error: auth.error };

    const context = await getCallerAgencyContext(auth.ownerId);
    if (!context || !context.officeId) {
      return { success: false, error: "Finish Step 1 (Agency Setup) first." };
    }

    // Auto/Fire premium + count + retention, and Life/Health premium, all map
    // onto columns that have existed since the original Settings tab shipped —
    // safe to write unconditionally.
    const coreFields = {
      book_size_auto: toFiniteNumber(payload.bookSizeAutoPremium),
      prior_pif_auto: toFiniteNumber(payload.bookSizeAutoCount),
      ytd_lapse_cancel_auto: toFiniteNumber(payload.retentionRateAuto),
      book_size_fire: toFiniteNumber(payload.bookSizeFirePremium),
      prior_pif_fire: toFiniteNumber(payload.bookSizeFireCount),
      ytd_lapse_cancel_fire: toFiniteNumber(payload.retentionRateFire),
      book_size_life: toFiniteNumber(payload.bookSizeLifePremium),
      book_size_health: toFiniteNumber(payload.bookSizeHealthPremium),
    };

    const { error: updateError } = await supabaseAdmin
      .from("offices")
      .update(coreFields)
      .eq("id", context.officeId);

    if (updateError) {
      console.error("[onboarding:step4] office baseline update failed", updateError);
      return { success: false, error: updateError.message };
    }

    // Life/Health policy counts are a newer, additive pair of columns (see
    // scripts/add_onboarding_step4_5_columns.sql) — tolerate them not
    // existing yet rather than failing the whole baseline save over it.
    const { error: extraCountsError } = await supabaseAdmin
      .from("offices")
      .update({
        prior_pif_life: toFiniteNumber(payload.bookSizeLifeCount),
        prior_pif_health: toFiniteNumber(payload.bookSizeHealthCount),
      })
      .eq("id", context.officeId);

    if (extraCountsError && !isMissingColumnError(extraCountsError)) {
      console.error("[onboarding:step4] life/health policy count update failed", extraCountsError);
      return { success: false, error: extraCountsError.message };
    } else if (extraCountsError) {
      console.warn(
        "[onboarding:step4] prior_pif_life/prior_pif_health missing — run scripts/add_onboarding_step4_5_columns.sql. Skipping for now."
      );
    }

    await advanceOnboardingStep(auth.ownerId, 5);

    return { success: true };
  } catch (err: any) {
    console.error("[onboarding:step4] unexpected error", err);
    return { success: false, error: err?.message || "Unexpected server error." };
  }
}

// =============================================================================
// Step 5 — Goals & Compensation (final step)
// -----------------------------------------------------------------------------
// Same architecture note as Step 4: writes onto EXISTING offices.* columns.
// The VC rate additionally gets written to agencies.current_vc_rate too, since
// that's the agency-level fallback default already read throughout the
// Revenue/VC engine (`office?.current_vc_rate ?? agencySettings?.current_vc_rate`)
// for any office that doesn't have its own explicit rate set.
// =============================================================================
export async function saveStep5Goals(payload: Step5Payload): Promise<Step5Result> {
  try {
    const auth = await authenticateCaller(payload.accessToken);
    if (!auth.ok) return { success: false, error: auth.error };

    const context = await getCallerAgencyContext(auth.ownerId);
    if (!context || !context.officeId) {
      return { success: false, error: "Finish Step 1 (Agency Setup) first." };
    }

    const officeFields = {
      annual_target_auto_apps: toFiniteNumber(payload.targetAuto),
      annual_target_fire_apps: toFiniteNumber(payload.targetFire),
      annual_target_life_apps: toFiniteNumber(payload.targetLife),
      annual_target_health_apps: toFiniteNumber(payload.targetHealth),
      annual_target_commercial_apps: toFiniteNumber(payload.targetCommercial),
      base_comm_auto: toFiniteNumber(payload.baseCompAuto),
      base_comm_fire: toFiniteNumber(payload.baseCompFire),
      base_comm_life: toFiniteNumber(payload.baseCompLife),
      base_comm_health: toFiniteNumber(payload.baseCompHealth),
      current_vc_rate: toFiniteNumber(payload.agencyVcTotal),
    };

    const { error: officeError } = await supabaseAdmin
      .from("offices")
      .update(officeFields)
      .eq("id", context.officeId);

    if (officeError) {
      console.error("[onboarding:step5] office goals update failed", officeError);
      return { success: false, error: officeError.message };
    }

    const { error: agencyError } = await supabaseAdmin
      .from("agencies")
      .update({ current_vc_rate: toFiniteNumber(payload.agencyVcTotal) })
      .eq("id", context.agencyId);

    if (agencyError) {
      // Non-fatal: the office-level rate above is what's actually used for
      // this agency's only office right now; the agency-level value is only a
      // fallback default for future offices.
      console.error("[onboarding:step5] agency VC default update failed", agencyError);
    }

    await advanceOnboardingStep(auth.ownerId, 6);

    // Final step of the entire wizard — mark the owner's onboarding fully
    // complete. Metadata only (see scripts/add_onboarding_completed_flag.sql);
    // the /dashboard gatekeeper keys off agency_id, not this flag, so a
    // missing/failed write here never blocks the owner from reaching their
    // dashboard. app/onboarding/page.tsx's own redirect guard DOES key off
    // this flag, though — see that file for why.
    const { error: completeError } = await supabaseAdmin
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", auth.ownerId);

    if (completeError && !isMissingColumnError(completeError)) {
      console.error("[onboarding:step5] failed to flip onboarding_completed", completeError);
    }

    return { success: true };
  } catch (err: any) {
    console.error("[onboarding:step5] unexpected error", err);
    return { success: false, error: err?.message || "Unexpected server error." };
  }
}

// =============================================================================
// Hydration — fetch whatever's already been saved so the wizard can resume
// -----------------------------------------------------------------------------
// Accepts an accessToken (not a raw userId) for the same reason every other
// action here does: this file is a public Server Function boundary, and the
// caller's identity must always be re-derived server-side, never trusted from
// the client. Functionally this still "fetches state for the given user" —
// the user in question is just identified by their session token instead of
// a spoofable id.
// =============================================================================
export async function fetchOnboardingState(
  payload: FetchOnboardingStatePayload
): Promise<FetchOnboardingStateResult> {
  try {
    const auth = await authenticateCaller(payload?.accessToken);
    if (!auth.ok) return { success: false, error: auth.error };
    const ownerId = auth.ownerId;

    const { data: ownerProfile, error: ownerProfileError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("id", ownerId)
      .maybeSingle();

    if (ownerProfileError) {
      console.error("[onboarding:fetchState] owner profile lookup failed", ownerProfileError);
      return { success: false, error: ownerProfileError.message };
    }

    const ownerYtd = rowToYtdMatrix(ownerProfile);

    const emptyBaselineAndGoals = {
      bookSizeAutoPremium: "" as number | "",
      bookSizeAutoCount: "" as number | "",
      retentionRateAuto: "" as number | "",
      bookSizeFirePremium: "" as number | "",
      bookSizeFireCount: "" as number | "",
      retentionRateFire: "" as number | "",
      bookSizeLifePremium: "" as number | "",
      bookSizeLifeCount: "" as number | "",
      bookSizeHealthPremium: "" as number | "",
      bookSizeHealthCount: "" as number | "",
      targetAuto: "" as number | "",
      targetFire: "" as number | "",
      targetLife: "" as number | "",
      targetHealth: "" as number | "",
      targetCommercial: "" as number | "",
      baseCompAuto: "" as number | "",
      baseCompFire: "" as number | "",
      baseCompLife: "" as number | "",
      baseCompHealth: "" as number | "",
      agencyVcTotal: "" as number | "",
    };

    // Brand new — never even saved Step 1 yet.
    if (!ownerProfile || !ownerProfile.agency_id) {
      return {
        success: true,
        state: {
          found: false,
          agencyId: null,
          officeId: (ownerProfile?.office_id as string) || null,
          agencyName: "",
          primaryOfficeLocation: "",
          ownerName: [ownerProfile?.first_name, ownerProfile?.last_name].filter(Boolean).join(" "),
          ownerYtd,
          teamMembers: [],
          ...emptyBaselineAndGoals,
          resumeStep: 1,
        },
      };
    }

    const agencyId = ownerProfile.agency_id as string;
    const officeId = (ownerProfile.office_id as string) || null;

    const { data: agency, error: agencyError } = await supabaseAdmin
      .from("agencies")
      .select("name")
      .eq("id", agencyId)
      .maybeSingle();

    if (agencyError) {
      console.error("[onboarding:fetchState] agency lookup failed", agencyError);
    }

    let officeName = "";
    let baselineAndGoals = { ...emptyBaselineAndGoals };
    if (officeId) {
      const { data: office, error: officeError } = await supabaseAdmin
        .from("offices")
        .select("*")
        .eq("id", officeId)
        .maybeSingle();

      if (officeError) console.error("[onboarding:fetchState] office lookup failed", officeError);

      officeName = office?.name || "";
      baselineAndGoals = {
        bookSizeAutoPremium: numberOrEmpty(office?.book_size_auto),
        bookSizeAutoCount: numberOrEmpty(office?.prior_pif_auto),
        retentionRateAuto: numberOrEmpty(office?.ytd_lapse_cancel_auto),
        bookSizeFirePremium: numberOrEmpty(office?.book_size_fire),
        bookSizeFireCount: numberOrEmpty(office?.prior_pif_fire),
        retentionRateFire: numberOrEmpty(office?.ytd_lapse_cancel_fire),
        bookSizeLifePremium: numberOrEmpty(office?.book_size_life),
        bookSizeLifeCount: numberOrEmpty(office?.prior_pif_life),
        bookSizeHealthPremium: numberOrEmpty(office?.book_size_health),
        bookSizeHealthCount: numberOrEmpty(office?.prior_pif_health),
        targetAuto: numberOrEmpty(office?.annual_target_auto_apps),
        targetFire: numberOrEmpty(office?.annual_target_fire_apps),
        targetLife: numberOrEmpty(office?.annual_target_life_apps),
        targetHealth: numberOrEmpty(office?.annual_target_health_apps),
        targetCommercial: numberOrEmpty(office?.annual_target_commercial_apps),
        baseCompAuto: numberOrEmpty(office?.base_comm_auto),
        baseCompFire: numberOrEmpty(office?.base_comm_fire),
        baseCompLife: numberOrEmpty(office?.base_comm_life),
        baseCompHealth: numberOrEmpty(office?.base_comm_health),
        agencyVcTotal: numberOrEmpty(office?.current_vc_rate),
      };
    }

    // Every other non-archived profile on this agency is a roster member the
    // owner added in Step 2.
    const { data: teamRows, error: teamError } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("agency_id", agencyId)
      .eq("is_archived", false)
      .neq("id", ownerId);

    if (teamError) {
      console.error("[onboarding:fetchState] team lookup failed", teamError);
      return { success: false, error: teamError.message };
    }

    // Each member's email lives on auth.users, not profiles — look each one up.
    const teamMembers: OnboardingStateTeamMember[] = await Promise.all(
      (teamRows || []).map(async (row) => {
        let email = "";
        try {
          const { data: authRow } = await supabaseAdmin.auth.admin.getUserById(row.id);
          email = authRow?.user?.email || "";
        } catch (lookupErr) {
          console.error(`[onboarding:fetchState] auth lookup failed for ${row.id}`, lookupErr);
        }

        return {
          id: row.id,
          authUserId: row.id,
          name: [row.first_name, row.last_name].filter(Boolean).join(" ").trim(),
          email,
          role: ROLE_DISPLAY_MAP[row.role as string] || "Producer",
          tempPassword: "",
          ...rowToYtdMatrix(row),
        };
      })
    );

    // Resume-step: prefer the explicit pointer (profiles.onboarding_step) once
    // that migration has run. Fall back to a coarse heuristic for rows saved
    // before it existed — agency exists but no roster yet -> Step 2; roster
    // exists -> Step 3 (can't distinguish 3/4/5 without the explicit pointer,
    // so land on the earliest of the "later" steps rather than guessing wrong
    // and skipping something unsaved).
    const rawStep = ownerProfile.onboarding_step;
    let resumeStep: 1 | 2 | 3 | 4 | 5;
    if (typeof rawStep === "number" && rawStep >= 1) {
      resumeStep = Math.min(Math.max(Math.round(rawStep), 1), 5) as 1 | 2 | 3 | 4 | 5;
    } else {
      resumeStep = teamMembers.length === 0 ? 2 : 3;
    }

    return {
      success: true,
      state: {
        found: true,
        agencyId,
        officeId,
        agencyName: agency?.name || "",
        primaryOfficeLocation: officeName,
        ownerName: [ownerProfile.first_name, ownerProfile.last_name].filter(Boolean).join(" ").trim(),
        ownerYtd,
        teamMembers,
        ...baselineAndGoals,
        resumeStep,
      },
    };
  } catch (err: any) {
    console.error("[onboarding:fetchState] unexpected error", err);
    return { success: false, error: err?.message || "Unexpected server error." };
  }
}
