// Shared lazy Gemini client for the Coaching Suite's two AI route handlers
// (deal-autopsy, sparring). Same lazy-construction reasoning as
// app/actions/coaching.ts's getGemini() and supabaseAdmin.ts's lazy client -
// constructing `new GoogleGenAI(...)` at module load time with a missing key
// would throw before either route's own try/catch starts.
import { GoogleGenAI } from "@google/genai";

// Keep in sync with app/actions/coaching.ts's GEMINI_MODEL. Pinned to
// gemini-1.5-flash (down from gemini-3.6-flash) after the newer Flash tier
// started returning 503s (model overloaded/at capacity) under this app's key -
// an older, lower-demand model trades that capacity risk for whatever gap
// exists between it and the newest tier's quality/latency. If this model id
// itself ever comes back 404 (fully retired, the same failure mode that
// pushed this app off gemini-2.5-flash originally), check
// https://ai.google.dev/gemini-api/docs/changelog for a current id before
// assuming it's a bug here.
export const GEMINI_MODEL = "gemini-1.5-flash";

let cachedGemini: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (cachedGemini) return cachedGemini;

  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    console.error("[api/ai] missing GEMINI_API_KEY");
    throw new Error("Server is misconfigured: missing Gemini credentials. Please contact support.");
  }

  cachedGemini = new GoogleGenAI({ apiKey });
  return cachedGemini;
}
