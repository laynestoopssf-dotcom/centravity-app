import { NextResponse, type NextRequest } from "next/server";
import { Type } from "@google/genai";
import { supabaseAdmin } from "../../../../actions/supabaseAdmin";
import { getGemini, GEMINI_MODEL } from "../../geminiClient";

// =============================================================================
// POST /api/ai/sparring/grade — "Finish & Grade Session".
// -----------------------------------------------------------------------------
// Sibling of /api/ai/sparring (the in-character prospect turns) rather than a
// mode flag on that same route, since this call is a fundamentally different
// shape: one-shot, structured JSON output instead of a free-text in-character
// reply, and it grades the WHOLE transcript at once rather than continuing it.
//
// Same auth pattern as every other /api/ai/* route: accessToken verified via
// supabaseAdmin.auth.getUser(), never trusted from the client. This route
// deliberately does NOT write to sparring_sessions itself - it only returns
// the grade; components/coaching/SparringRing.tsx calls
// app/actions/sparring.ts's saveSparringSession afterward to persist it, so
// the AI call and the DB write stay two independently-retryable steps.
// =============================================================================

export const runtime = "nodejs";

const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 4000;

// Verbatim, exactly as specified - do not reword or add context (e.g.
// product line) into this string, even though the /api/ai/sparring route's
// own system prompt does that for its persona. This one call's whole job is
// to reproduce this exact grading instruction against the transcript.
const GRADE_SYSTEM_PROMPT =
  "Review this sales roleplay transcript. Provide a 2-sentence summary of how the agent handled objections, and assign a score from 1-10 based on their closing ability. Return the response in strictly formatted JSON with 'summary' (text) and 'score' (integer) keys.";

interface RawIncomingMessage {
  role?: string;
  content?: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "The Sparring Ring isn't set up yet — ask your agency owner to add a Gemini API key." },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => null);
    const accessToken: string | undefined = body?.accessToken;
    const rawMessages: RawIncomingMessage[] = Array.isArray(body?.messages) ? body.messages : [];

    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized: missing session." }, { status: 401 });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
    if (authError || !authData?.user) {
      return NextResponse.json({ error: "Unauthorized: invalid session." }, { status: 401 });
    }

    const sanitizedMessages = rawMessages
      .filter(
        (m): m is Required<RawIncomingMessage> =>
          !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0
      )
      .slice(-MAX_MESSAGES)
      .map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content.slice(0, MAX_MESSAGE_LENGTH) }],
      }));

    // At least one producer turn is required to grade anything meaningful -
    // an empty or opener-only transcript has no closing ability to assess yet.
    if (sanitizedMessages.filter((m) => m.role === "user").length === 0) {
      return NextResponse.json(
        { error: "Respond to at least one objection before grading this session." },
        { status: 400 }
      );
    }

    const gemini = getGemini();
    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: sanitizedMessages,
      config: {
        systemInstruction: GRADE_SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            score: { type: Type.INTEGER },
          },
          required: ["summary", "score"],
        },
        temperature: 0.4,
      },
    });

    const raw = response.text?.trim();
    if (!raw) {
      console.error("[api/ai/sparring/grade] Gemini returned no text", response);
      return NextResponse.json({ error: "The grader didn't respond. Please try again." }, { status: 502 });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error("[api/ai/sparring/grade] Gemini returned malformed JSON", raw, parseErr);
      return NextResponse.json({ error: "The grader returned an unusable response. Please try again." }, { status: 502 });
    }

    const summary =
      parsed && typeof (parsed as Record<string, unknown>).summary === "string"
        ? (parsed as Record<string, string>).summary.trim()
        : "";
    const rawScore = parsed ? (parsed as Record<string, unknown>).score : undefined;
    const score =
      typeof rawScore === "number" && Number.isFinite(rawScore) ? Math.min(10, Math.max(1, Math.round(rawScore))) : null;

    if (!summary || score === null) {
      console.error("[api/ai/sparring/grade] Gemini returned an incomplete grade", parsed);
      return NextResponse.json({ error: "The grader returned an incomplete response. Please try again." }, { status: 502 });
    }

    return NextResponse.json({ success: true, summary, score });
  } catch (err: unknown) {
    console.error("[api/ai/sparring/grade] failed", err);
    const message = err instanceof Error ? err.message : "Something went wrong. Please try again in a moment.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
