// Shared lazy Gemini client for the Coaching Suite's two AI route handlers
// (deal-autopsy, sparring). Same lazy-construction reasoning as
// app/actions/coaching.ts's getGemini() and supabaseAdmin.ts's lazy client -
// constructing `new GoogleGenAI(...)` at module load time with a missing key
// would throw before either route's own try/catch starts.
import { GoogleGenAI } from "@google/genai";

// Model id history here has been trial-and-error based on stale/incorrect assumptions
// twice in a row (gemini-3.6-flash -> 503 "overloaded"; gemini-1.5-flash -> 404 "not
// found", it never existed for this key/API version at all) - so this one was verified
// against the LIVE API instead of guessed: `GET v1beta/models?key=...` was queried
// directly against this project's real GEMINI_API_KEY, gemini-flash-lite-latest was
// confirmed present there AND a real generateContent call against it returned 200 (it
// currently resolves to gemini-3.5-flash-lite server-side). It's a Google-maintained
// alias, not a dated snapshot - it always points at whatever the current Flash-Lite
// build is, so it can't 404 the way a hardcoded dated model id eventually will, and
// being the "lite" tier makes it the least likely of the Flash-family models to hit a
// 503 capacity error under this app's key. If it ever does 404, this key's model
// access has changed - re-run `curl v1beta/models?key=$GEMINI_API_KEY` rather than
// guessing another id.
export const GEMINI_MODEL = "gemini-flash-lite-latest";

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
