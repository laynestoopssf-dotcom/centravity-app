"use server";

import { supabaseAdmin } from "./supabaseAdmin";
import type { SaveSparringSessionPayload, SaveSparringSessionResult } from "./sparring.types";

const MAX_SUMMARY_LENGTH = 2000;
const MAX_TRANSCRIPT_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 4000;

// =============================================================================
// Server Action: persist a completed Sparring Ring session
// -----------------------------------------------------------------------------
// Called from components/coaching/SparringRing.tsx's "Finish & Grade Session"
// button, AFTER POST /api/ai/sparring/grade has already returned a summary +
// score for the transcript — this action only ever writes what it's handed,
// it never calls Gemini itself. Kept as its own Server Action (rather than
// folding the insert into that route) so the AI call and the persistence step
// are two independently-retryable operations: if the insert below fails, the
// grade the producer already earned isn't lost, it's just shown without
// having been saved (see SparringRing's error handling).
//
// SECURITY: same rule as every other Server Action in this app (billing.ts,
// waitlist.ts, coaching.ts) — `user_id`/`agency_id` are RE-DERIVED here from
// the caller's own session via supabaseAdmin.auth.getUser(accessToken) +
// their profiles row, never trusted from the client payload. This is what
// makes it impossible for a producer to log a session under a teammate's
// name or into a different agency, even though the actual insert below uses
// the service-role client (which bypasses public.sparring_sessions' RLS
// entirely) — the manual checks here are what stand in for RLS on this path,
// exactly like deal-autopsy's route handler already does for deal_autopsies.
// =============================================================================
export async function saveSparringSession(
  payload: SaveSparringSessionPayload
): Promise<SaveSparringSessionResult> {
  try {
    if (!payload?.accessToken) {
      return { success: false, error: "Unauthorized: missing session." };
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(payload.accessToken);
    if (authError || !authUser?.user) {
      console.error("[sparring] failed to authenticate caller", authError);
      return { success: false, error: "Unauthorized: invalid session." };
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("agency_id")
      .eq("id", authUser.user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[sparring] failed to look up caller profile", profileError);
      return { success: false, error: profileError.message };
    }
    if (!profile?.agency_id) {
      return { success: false, error: "No agency found for this account yet." };
    }

    if (!Array.isArray(payload.transcript) || payload.transcript.length === 0) {
      return { success: false, error: "Nothing to save — the transcript is empty." };
    }

    const transcript = payload.transcript
      .filter(
        (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
      )
      .slice(-MAX_TRANSCRIPT_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH) }));

    if (transcript.length === 0) {
      return { success: false, error: "Nothing to save — the transcript is empty." };
    }

    const summary = typeof payload.summary === "string" ? payload.summary.trim().slice(0, MAX_SUMMARY_LENGTH) : "";
    if (!summary) {
      return { success: false, error: "Missing grading summary." };
    }

    // Clamp rather than reject on an out-of-range score - the grading route
    // already validates/clamps this to 1-10 before ever calling here, this
    // is just a second, independent guard against a malformed client payload.
    const score = Number.isFinite(payload.score) ? Math.min(10, Math.max(1, Math.round(payload.score))) : null;
    if (score === null) {
      return { success: false, error: "Missing or invalid score." };
    }

    const { error: insertError } = await supabaseAdmin.from("sparring_sessions").insert({
      agency_id: profile.agency_id,
      user_id: authUser.user.id,
      product_line: payload.productLine || null,
      transcript,
      summary,
      score,
    });

    if (insertError) {
      console.error("[sparring] saveSparringSession insert failed", insertError);
      return { success: false, error: "Failed to save this session. Please try again." };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("[sparring] saveSparringSession unexpected error", err);
    const message = err instanceof Error ? err.message : "Unexpected server error saving the session.";
    return { success: false, error: message };
  }
}
