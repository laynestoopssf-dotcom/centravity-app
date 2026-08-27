import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "../../../actions/supabaseAdmin";
import { getGemini, GEMINI_MODEL } from "../geminiClient";

// =============================================================================
// POST /api/ai/deal-autopsy — Coaching Suite Feature 2 ("Deal Autopsies").
// -----------------------------------------------------------------------------
// A producer types the objection they hit on a Quoted deal they've already
// tagged "Send to Coaching" (components/DashboardTab.tsx inserts the
// deal_autopsies row client-side, RLS-gated to producer_id = auth.uid()).
// This route: (1) re-verifies the caller owns that autopsy row server-side
// (never trusts a client-supplied producer_id), (2) asks Gemini for a senior
// agent's exact talk-path back to value, (3) persists both the objection and
// the AI response onto the row so re-opening it later doesn't re-spend a
// Gemini call, (4) returns the updated row.
//
// Same auth pattern as app/api/chat/route.ts: accessToken verified via
// supabaseAdmin.auth.getUser(), never trusted from the request body.
// =============================================================================

export const runtime = "nodejs";

const MAX_OBJECTION_LENGTH = 1000;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "AI Coaching isn't set up yet — ask your agency owner to add a Gemini API key." },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const accessToken: string | undefined = body?.accessToken;
    const autopsyId: string | undefined = body?.autopsyId;
    const objectionText: string = typeof body?.objectionText === "string" ? body.objectionText.trim() : "";

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized: missing session." }, { status: 401 });
    }
    if (!autopsyId) {
      return NextResponse.json({ error: "Missing autopsy record." }, { status: 400 });
    }
    if (!objectionText) {
      return NextResponse.json({ error: "Please describe the objection you received." }, { status: 400 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized: invalid session." }, { status: 401 });
    }

    const { data: autopsy, error: autopsyError } = await supabaseAdmin
      .from("deal_autopsies")
      .select("id, producer_id, policy_id, policies(product_line, premium_amount)")
      .eq("id", autopsyId)
      .maybeSingle();

    if (autopsyError || !autopsy) {
      return NextResponse.json({ error: "Coaching record not found." }, { status: 404 });
    }
    // Only the producer who tagged this deal may fill in the objection - a manager
    // reviews the result, they don't write it on the producer's behalf.
    if (autopsy.producer_id !== authData.user.id) {
      return NextResponse.json({ error: "Unauthorized: this isn't your deal." }, { status: 403 });
    }

    const policy = Array.isArray(autopsy.policies) ? autopsy.policies[0] : autopsy.policies;
    const productLine = policy?.product_line || "this line";
    const premium = policy?.premium_amount;

    const prompt = `You are a sharp, senior insurance agent mentoring a producer right after they lost momentum on a live deal.

PRODUCT LINE: ${productLine}
${premium ? `QUOTED PREMIUM: $${Math.round(Number(premium)).toLocaleString()}\n` : ""}OBJECTION THE PRODUCER RECEIVED: "${objectionText.slice(0, MAX_OBJECTION_LENGTH)}"

Give the producer the EXACT talk-path (word-for-word phrasing they can say out loud) to acknowledge this specific objection and pivot the conversation back to the value of the policy. Keep it to 3-5 sentences of actual spoken dialogue (you may include one short internal note in parentheses about tone/timing, but the bulk must be usable verbatim). No headers, no bullet lists, no generic sales platitudes — ground it in the specific objection above.`;

    const gemini = getGemini();
    const response = await gemini.models.generateContent({ model: GEMINI_MODEL, contents: prompt });
    const talkPath = response.text?.trim();

    if (!talkPath) {
      console.error("[api/ai/deal-autopsy] Gemini returned no text", response);
      return NextResponse.json({ error: "The AI coach didn't return a usable response. Please try again." }, { status: 502 });
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("deal_autopsies")
      .update({ objection_text: objectionText, ai_talk_path: talkPath, status: "reviewed", updated_at: new Date().toISOString() })
      .eq("id", autopsyId)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error("[api/ai/deal-autopsy] failed to persist result", updateError);
      return NextResponse.json({ error: "Generated a response but failed to save it. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ success: true, autopsy: updated });
  } catch (err: unknown) {
    console.error("[api/ai/deal-autopsy] failed", err);
    const message = err instanceof Error ? err.message : "Something went wrong. Please try again in a moment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
