"use server";

import { Type } from "@google/genai";
import { supabaseAdmin } from "./supabaseAdmin";
import { getGemini, GEMINI_MODEL } from "../api/ai/geminiClient";
import type {
  GenerateObjectionPivotsPayload,
  GenerateObjectionPivotsResult,
  ObjectionStrategy,
} from "./objectionSandbox.types";

// =============================================================================
// Server Action: "Objection Sandbox" (Coaching Suite Feature 5)
// -----------------------------------------------------------------------------
// A quick, stateless "what do I say RIGHT NOW" tool for a producer mid-call -
// unlike the Sparring Ring (a multi-turn roleplay) this is a single objection
// in, three ready-to-read scripts out, no transcript persisted anywhere.
// Implemented as a plain Server Action (not a /api/ai/* route like
// sparring/deal-autopsy) per the explicit request - it's the same shape as
// app/actions/coaching.ts's generateCoachingInsight, just backed by Gemini's
// structured-JSON mode instead of free text, reusing the exact lazy
// getGemini()/GEMINI_MODEL pair from app/api/ai/geminiClient.ts rather than a
// third copy of that lazy-construction boilerplate.
//
// SECURITY: same rule as every other Server Action in this app - the caller's
// identity is re-derived from `accessToken` via supabaseAdmin.auth.getUser(),
// never trusted from the client. This is the only auth check on this action;
// there's no row to own or agency to scope since nothing is persisted.
// =============================================================================

const MAX_OBJECTION_LENGTH = 1000;

// Verbatim, exactly as specified - do not reword.
const SYSTEM_PROMPT =
  "You are an elite State Farm insurance sales coach. The user will provide a customer objection. Provide three distinct, conversational scripts to overcome it: 1) An Empathetic pivot, 2) A Logical/Financial pivot, and 3) A Direct Closing question. Return the response in strictly formatted JSON containing an array of 'strategies' with 'type' and 'script' keys.";

export async function generateObjectionPivots(
  payload: GenerateObjectionPivotsPayload
): Promise<GenerateObjectionPivotsResult> {
  try {
    if (!payload?.accessToken) {
      return { success: false, error: "Unauthorized: missing session." };
    }

    const { data: authUser, error: authError } = await supabaseAdmin.auth.getUser(payload.accessToken);
    if (authError || !authUser?.user) {
      console.error("[objectionSandbox] failed to authenticate caller", authError);
      return { success: false, error: "Unauthorized: invalid session." };
    }

    const objectionText = (payload.objectionText || "").trim().slice(0, MAX_OBJECTION_LENGTH);
    if (!objectionText) {
      return { success: false, error: "Please describe the objection you just heard." };
    }

    const gemini = getGemini();
    const response = await gemini.models.generateContent({
      model: GEMINI_MODEL,
      contents: objectionText,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            strategies: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  script: { type: Type.STRING },
                },
                required: ["type", "script"],
              },
            },
          },
          required: ["strategies"],
        },
        temperature: 0.6,
      },
    });

    const raw = response.text?.trim();
    if (!raw) {
      console.error("[objectionSandbox] Gemini returned no text", response);
      return { success: false, error: "The AI coach didn't return a usable response. Please try again." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (parseErr) {
      console.error("[objectionSandbox] Gemini returned malformed JSON", raw, parseErr);
      return { success: false, error: "The AI coach returned an unusable response. Please try again." };
    }

    const rawStrategies =
      parsed && Array.isArray((parsed as Record<string, unknown>).strategies)
        ? ((parsed as Record<string, unknown>).strategies as unknown[])
        : null;

    const strategies: ObjectionStrategy[] = (rawStrategies || [])
      .filter(
        (s): s is Record<string, unknown> =>
          !!s &&
          typeof (s as Record<string, unknown>).type === "string" &&
          typeof (s as Record<string, unknown>).script === "string" &&
          (s as Record<string, string>).type.trim().length > 0 &&
          (s as Record<string, string>).script.trim().length > 0
      )
      .map((s) => ({ type: (s.type as string).trim(), script: (s.script as string).trim() }));

    if (strategies.length === 0) {
      console.error("[objectionSandbox] Gemini returned no usable strategies", parsed);
      return { success: false, error: "The AI coach didn't return any usable strategies. Please try again." };
    }

    return { success: true, strategies };
  } catch (err: unknown) {
    console.error("[objectionSandbox] generateObjectionPivots failed", err);
    const message = err instanceof Error ? err.message : "Unexpected server error generating strategies.";
    return { success: false, error: message };
  }
}
