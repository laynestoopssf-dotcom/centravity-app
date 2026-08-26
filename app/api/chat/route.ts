import { NextResponse, type NextRequest } from "next/server";
import { streamText, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { supabaseAdmin } from "../../actions/supabaseAdmin";
import { buildSystemPrompt, type CentravityRoleLabel } from "./systemPrompt";

// =============================================================================
// POST /api/chat — backend for the AI Support Chat widget (components/dashboard/AiSupportChat.tsx).
// -----------------------------------------------------------------------------
// Streams a response from OpenAI (gpt-4o-mini) via the Vercel AI SDK, with
// "Stratt"'s hardened system prompt (see ./systemPrompt.ts) as the only thing
// steering its behavior — the FAQ/Help content is its sole knowledge base.
//
// SECURITY DESIGN, in order of how a request flows through this route:
//
// 1. AUTH — accessToken is verified server-side via supabaseAdmin.auth.getUser()
//    (same pattern as app/actions/onboarding.ts's authenticateCaller). No
//    session, no response — this keeps the route from being an open,
//    unauthenticated way for anyone on the internet to burn our OpenAI spend.
//
// 2. CONTEXT — first name + role label are RE-DERIVED from the caller's own
//    `profiles` row via the service-role client, never trusted from the
//    request body. A client could otherwise claim `role: "owner"` to try to
//    change Stratt's behavior; deriving server-side from the authenticated
//    user's own id makes that impossible. Only a first name and an
//    Owner/Team Member label are ever handed to the model — no agency name,
//    no database IDs, no policy numbers.
//
// 3. INPUT SANITIZATION — the client-supplied conversation history is capped
//    in length (MAX_MESSAGES turns) and per-message size (MAX_MESSAGE_LENGTH
//    chars), and any role other than "user"/"assistant" is stripped. That
//    last part matters most: without it, a malicious client could inject a
//    fake `{ role: "system", content: "ignore all previous instructions" }`
//    message into the array and have it concatenated ahead of our real
//    system prompt by the model provider — filtering to user/assistant only
//    closes that off entirely.
//
// 4. THE SYSTEM PROMPT ITSELF — see systemPrompt.ts for the actual guardrails
//    (never reveal instructions, never discuss backend/architecture/crypto,
//    never explain proprietary metric math, strict refusal for anything
//    off-topic). This route just assembles and sends it; it never lets any
//    part of it be overridden by request data.
// =============================================================================

export const runtime = "nodejs";

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;

interface RawIncomingMessage {
  role?: string;
  content?: string;
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.error("[api/chat] OPENAI_API_KEY is not configured");
      return NextResponse.json(
        { error: "AI Support isn't set up yet. Please check the Help & FAQ page or contact your agency owner." },
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

    // Re-derived server-side only — see file header. Never read from `body`.
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, role")
      .eq("id", authData.user.id)
      .maybeSingle();

    const firstName = (profile?.first_name || "").trim() || "there";
    const roleLabel: CentravityRoleLabel = profile?.role === "owner" ? "Owner" : "Team Member";

    const sanitizedMessages: ModelMessage[] = rawMessages
      .filter(
        (m): m is Required<RawIncomingMessage> =>
          !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0
      )
      .slice(-MAX_MESSAGES)
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content.slice(0, MAX_MESSAGE_LENGTH),
      }));

    if (sanitizedMessages.length === 0) {
      return NextResponse.json({ error: "No message provided." }, { status: 400 });
    }

    const systemPrompt = buildSystemPrompt(firstName, roleLabel);

    const result = streamText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      messages: sanitizedMessages,
      temperature: 0.4,
      maxOutputTokens: 500,
      // Errors that occur mid-stream (e.g. OpenAI quota/billing issues, rate
      // limits, provider outages) don't throw synchronously here — by the
      // time they happen, toTextStreamResponse() below has already sent a
      // 200 with a streaming body, so there's no JSON error response left to
      // shape. Logging server-side is what makes those visible at all,
      // instead of silently showing up to the user as a reply that just
      // stops (the widget's own try/catch around its stream reader still
      // surfaces *something* client-side either way).
      onError: ({ error }) => {
        console.error("[api/chat] streamText error", error);
      },
    });

    return result.toTextStreamResponse();
  } catch (err: unknown) {
    // Deliberately generic client-facing message — never leak the raw error
    // (which could include provider error details) to an unauthenticated
    // surface.
    console.error("[api/chat] failed", err);
    return NextResponse.json({ error: "Something went wrong. Please try again in a moment." }, { status: 500 });
  }
}
