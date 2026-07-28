"use server";

import OpenAI from "openai";
import { supabaseAdmin } from "./supabaseAdmin";
import type { CoachingInsightPayload, CoachingInsightResult } from "./coaching.types";

// =============================================================================
// Server Action: Generate Coaching Insight ("Smart Manager AI")
// -----------------------------------------------------------------------------
// This is a NET-NEW implementation, not a restored one — the button, its
// isGeneratingAi/aiInsights state, and even the `openai` npm dependency were
// already wired up in app/dashboard/page.tsx and components/AgencyOverviewTab.tsx,
// but generateCoachingInsight itself was a literal empty stub
// (`async (member: any) => {}`) with no Server Action, no API route, and no
// OPENAI_API_KEY anywhere — `git log -S` on the stub's definition shows
// exactly one commit ("Initial app split"), so there's no prior working
// version to recover. This wires the whole path end to end for the first time.
//
// SECURITY: same rule as every other Server Action in this app (see
// onboarding.ts / joinAgency.ts) — the caller's identity is re-derived from
// `accessToken` via supabaseAdmin.auth.getUser(), never trusted from the
// client. This is the only thing standing between this button and letting
// anyone with network access spend this agency's OpenAI budget, since the
// prompt itself carries no other authorization check.
//
// LAZY OPENAI CLIENT — same load-bearing reason as supabaseAdmin.ts's lazy
// Supabase client: constructing `new OpenAI(...)` at module load time with a
// missing key would throw before this action's own try/catch starts, which
// crosses the Server Action boundary uncaught and produces Next's generic,
// unhelpful "An error occurred in the Server Components render" message in
// production instead of a real, catchable error.
// =============================================================================

let cachedOpenAI: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (cachedOpenAI) return cachedOpenAI;

  const apiKey = process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    console.error("[coaching] missing OPENAI_API_KEY");
    throw new Error(
      "Server is misconfigured: missing OpenAI credentials. Please contact support."
    );
  }

  cachedOpenAI = new OpenAI({ apiKey });
  return cachedOpenAI;
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

    const openai = getOpenAI();
    const prompt = buildPrompt(payload);

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
    });

    const insight = response.output_text?.trim();

    if (!insight) {
      console.error("[coaching] OpenAI returned no output_text", response);
      return { success: false, error: "The AI coach didn't return a usable response. Please try again." };
    }

    return { success: true, insight };
  } catch (err: unknown) {
    console.error("[coaching] generateCoachingInsight failed", err);
    const message = err instanceof Error ? err.message : "Unexpected server error generating the coaching insight.";
    return { success: false, error: message };
  }
}
