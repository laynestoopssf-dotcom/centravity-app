"use server";

import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "./supabaseAdmin";
import type { CoachingInsightPayload, CoachingInsightResult } from "./coaching.types";

// =============================================================================
// Server Action: Generate Coaching Insight ("Smart Manager AI")
// -----------------------------------------------------------------------------
// This was originally built against OpenAI, then swapped to the Gemini API's
// free tier on request. A full codebase + git-history audit (all commits,
// both branches, .env.local) turned up zero prior trace of a Gemini
// integration in this repo — no @google/generative-ai or @google/genai import
// anywhere, no GEMINI_API_KEY reference anywhere — so there was nothing to
// restore; this is a fresh implementation using @google/genai, the current
// Google-recommended SDK (the older @google/generative-ai package is
// deprecated/EOL). Everything else about this action — the auth boundary, the
// prompt construction from the producer's live What-If numbers, and the
// crash-proofing — is unchanged from the OpenAI version.
//
// SECURITY: same rule as every other Server Action in this app (see
// onboarding.ts / joinAgency.ts) — the caller's identity is re-derived from
// `accessToken` via supabaseAdmin.auth.getUser(), never trusted from the
// client. This is the only thing standing between this button and letting
// anyone with network access exhaust this agency's Gemini free-tier quota,
// since the prompt itself carries no other authorization check.
//
// LAZY GEMINI CLIENT — same load-bearing reason as supabaseAdmin.ts's lazy
// Supabase client: constructing `new GoogleGenAI(...)` at module load time
// with a missing key would throw before this action's own try/catch starts,
// which crosses the Server Action boundary uncaught and produces Next's
// generic, unhelpful "An error occurred in the Server Components render"
// message in production instead of a real, catchable error.
// =============================================================================

// gemini-2.5-flash returned a 404 ("no longer available to new users") -
// Google shut down the 2.x Flash line entirely. gemini-3.6-flash (GA as of
// July 21, 2026) was the next successor, but started returning 503s (model
// overloaded/at capacity) under this app's key - see
// app/api/ai/geminiClient.ts (shared by the Coaching Suite's two newer AI
// routes) for the fuller note. Pinned back to gemini-1.5-flash here too so
// this and the Coaching Suite don't drift onto two different models. If
// THIS one ever 404s (fully retired), check
// https://ai.google.dev/gemini-api/docs/changelog for a current id.
const GEMINI_MODEL = "gemini-1.5-flash";

let cachedGemini: GoogleGenAI | null = null;

function getGemini(): GoogleGenAI {
  if (cachedGemini) return cachedGemini;

  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.error("[coaching] missing GEMINI_API_KEY");
    throw new Error(
      "Server is misconfigured: missing Gemini credentials. Please contact support."
    );
  }

  cachedGemini = new GoogleGenAI({ apiKey });
  return cachedGemini;
}

function buildPrompt(payload: CoachingInsightPayload): string {
  const timeframeLabel = payload.mode === "ytd" ? "year-to-date trajectory" : "the last 30 days";
  const lines = payload.linesBreakdown
    ? Object.entries(payload.linesBreakdown)
        .filter(([, count]) => (count || 0) > 0)
        .map(([line, count]) => `${line}: ${count}`)
        .join(", ") || "no bound policies yet in this window"
    : "not provided";

  return `You are a sharp, encouraging insurance agency sales manager coaching one of your producers.

PRODUCER: ${payload.producerName} (${payload.role})
BASIS: ${timeframeLabel}
GOAL: an extra $${Math.round(payload.goalCommission).toLocaleString()} in commission

CURRENT ACTIVITY (this basis window):
- Touches: ${payload.currentTouches}
- Quotes: ${payload.currentQuotes}
- Bound apps: ${payload.currentApps}
- Premium written: $${Math.round(payload.currentPremium).toLocaleString()}
- Close rate: ${payload.closeRate}%
${payload.quoteRate != null ? `- Quote rate: ${payload.quoteRate}%\n` : ""}${payload.commissionPerApp != null ? `- Commission per app: $${Math.round(payload.commissionPerApp).toLocaleString()}\n` : ""}- Lines bound: ${lines}

WHAT IT TAKES TO HIT THE GOAL (already calculated, do not recompute):
- Touches needed: ${payload.requiredTouches}
- Quotes needed: ${payload.requiredQuotes}
- Apps needed: ${payload.requiredApps}

Write a short, specific, motivating coaching insight (3-5 sentences, no headers or bullet lists) that:
1. Names the single biggest lever between their current activity and the numbers needed to hit the goal (e.g. quote volume vs. close rate vs. touches).
2. Gives one concrete, actionable suggestion for this week.
3. Ends on an encouraging note grounded in their actual numbers above — no generic platitudes.`;
}

export async function generateCoachingInsight(
  payload: CoachingInsightPayload
): Promise<CoachingInsightResult> {
  try {
    if (!payload?.accessToken) {
      return { success: false, error: "Unauthorized: missing session." };
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(
      payload.accessToken
    );

    if (authError || !authUser?.user) {
      console.error("[coaching] failed to authenticate caller", authError);
      return { success: false, error: "Unauthorized: invalid session." };
    }

    if (!payload.producerName) {
      return { success: false, error: "Missing producer context — please try again." };
    }

    const gemini = getGemini();
    const prompt = buildPrompt(payload);

    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });

    const insight = response.text?.trim();

    if (!insight) {
      console.error("[coaching] Gemini returned no text", response);
      return { success: false, error: "The AI coach didn't return a usable response. Please try again." };
    }

    return { success: true, insight };
  } catch (err: unknown) {
    console.error("[coaching] generateCoachingInsight failed", err);
    const message = err instanceof Error ? err.message : "Unexpected server error generating the coaching insight.";
    return { success: false, error: message };
  }
}
