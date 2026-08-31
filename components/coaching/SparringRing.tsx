"use client";

import React, { useEffect, useRef, useState } from "react";
import { Swords, Send, RotateCcw, Loader2, Trophy, ArrowRight, X } from "lucide-react";
import { supabase } from "../../utils/supabase";
import { saveSparringSession } from "../../app/actions/sparring";
import { useDashboardTab } from "../dashboard/DashboardShellContext";

// =============================================================================
// Feature 3: AI Objection Simulator ("Sparring Ring").
// -----------------------------------------------------------------------------
// A plain turn-based text chat, deliberately non-streaming (matches
// app/actions/coaching.ts's existing Gemini usage) - each send round-trips to
// POST /api/ai/sparring with the full transcript and gets one full reply back,
// which embeds both the in-character prospect line AND (from the 2nd producer
// turn onward) a "Grade: X/10 — ..." line the backend's system prompt is
// instructed to always lead with. Available to every role (unlike the
// Snapshot half of the Coaching tab) - this is a self-serve practice tool.
//
// Phase 2: "Finish & Grade Session" - a separate one-shot call to
// POST /api/ai/sparring/grade (structured JSON out, not a chat continuation)
// scores the WHOLE transcript at once, then app/actions/sparring.ts's
// saveSparringSession persists {transcript, product_line, summary, score} to
// public.sparring_sessions. Grading and saving are deliberately two
// independent steps - see saveSparringSession's header comment - so a save
// failure never costs the producer the grade they already earned.
// =============================================================================

// Mirrors app/api/ai/sparring/route.ts's own PRODUCT_LINES exactly - that
// route's system prompt is a generic template that interpolates whichever
// line string it's given (no per-product branching), so keeping this list in
// sync is the only thing that actually gates which products are practiceable.
const PRODUCT_LINES = ["Life", "Commercial", "Auto", "Fire", "Umbrella"] as const;
type SparringLine = (typeof PRODUCT_LINES)[number];

interface SparringMessage {
  role: "user" | "assistant";
  content: string;
}

interface GradeResult {
  summary: string;
  score: number;
}

// Seeded from a real `not_sold` deal via DashboardTab.tsx's "Send to Coaching" button ->
// app/dashboard/page.tsx's sendNotSoldDealToSparring -> CoachingTab.tsx - see the useEffect below
// that consumes this the moment it arrives.
export interface DealSeedContext {
  productLine: string;
  premiumAmount: number;
  notes: string | null;
}

interface SparringRingProps {
  seedContext?: DealSeedContext | null;
  onSeedConsumed?: () => void;
}

export default function SparringRing({ seedContext, onSeedConsumed }: SparringRingProps) {
  const { setActiveTab } = useDashboardTab();
  const [productLine, setProductLine] = useState<SparringLine>("Life");
  const [messages, setMessages] = useState<SparringMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set only when this session was seeded from a real lost deal (see DealSeedContext above) -
  // echoed to /api/ai/sparring on every turn so the system prompt can ground the AI's opening
  // objection in this exact scenario. Dismissible (the little X in the banner below) without
  // ending the session, in case the producer wants to keep chatting generically afterwards.
  const [dealContext, setDealContext] = useState<DealSeedContext | null>(null);

  // Grading is a distinct terminal action from the turn-by-turn chat above -
  // its own loading/error/result state so it can't be confused with (or
  // clobbered by) an in-flight prospect reply.
  const [isGrading, setIsGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [gradeResult, setGradeResult] = useState<GradeResult | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  // `overrideLine`/`overrideDealContext` exist purely for the seeding effect below, which needs
  // to kick off the very first request with a resolved product line + context BEFORE the
  // corresponding setProductLine/setDealContext state updates have actually re-rendered (state
  // setters are async - reading `productLine`/`dealContext` from closure in that same tick would
  // still see the old values). Every other call site (startSession, sendMessage) omits them and
  // falls back to current state, unchanged from before.
  const callSparring = async (
    nextMessages: SparringMessage[],
    overrideLine?: SparringLine,
    overrideDealContext?: DealSeedContext | null
  ) => {
    const line = overrideLine ?? productLine;
    const context = overrideDealContext !== undefined ? overrideDealContext : dealContext;
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError("Your session expired — please refresh the page.");
        return;
      }

      const res = await fetch("/api/ai/sparring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessToken,
          productLine: line,
          messages: nextMessages,
          dealContext: context ? { premiumAmount: context.premiumAmount, notes: context.notes } : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.reply) {
        setError(data?.error || "The sparring partner didn't respond. Please try again.");
        return;
      }
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      scrollToBottom();
    } catch (err) {
      console.error("[SparringRing] request failed", err);
      setError("Something went wrong reaching the AI. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const startSession = () => {
    setMessages([]);
    setError(null);
    setGradeError(null);
    setGradeResult(null);
    setSaveWarning(null);
    callSparring([]);
  };

  // Fires once per distinct seed handed down from CoachingTab. Resolves the deal's real
  // product_line onto one of the 5 practiceable lines (falling back to "Commercial" for anything
  // else, e.g. "Health" - not one of the 5 - or an agency's custom line), then immediately starts
  // a session grounded in this exact lost deal, and tells the parent the seed has been consumed
  // so it doesn't re-fire (e.g. if the producer navigates away and back to this inner tab).
  useEffect(() => {
    if (!seedContext) return;
    const resolvedLine: SparringLine = (PRODUCT_LINES as readonly string[]).includes(seedContext.productLine)
      ? (seedContext.productLine as SparringLine)
      : "Commercial";
    setProductLine(resolvedLine);
    setDealContext(seedContext);
    setMessages([]);
    setError(null);
    setGradeError(null);
    setGradeResult(null);
    setSaveWarning(null);
    callSparring([], resolvedLine, seedContext);
    onSeedConsumed?.();
    // Deliberately only re-runs when the seed itself changes, not on every render - callSparring
    // is stable enough in practice here and including it would re-fire this on unrelated state
    // churn (e.g. the loading flag callSparring itself sets).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedContext]);

  const sendMessage = () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: SparringMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    scrollToBottom();
    callSparring(next);
  };

  const finishAndGrade = async () => {
    if (isGrading || loading || messages.length === 0) return;
    setIsGrading(true);
    setGradeError(null);
    setSaveWarning(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setGradeError("Your session expired — please refresh the page.");
        return;
      }

      const res = await fetch("/api/ai/sparring/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, messages }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setGradeError(data?.error || "Couldn't grade this session. Please try again.");
        return;
      }

      const result: GradeResult = { summary: data.summary, score: data.score };

      // Show the grade regardless of whether the save below succeeds - the
      // producer already earned this feedback, a persistence hiccup
      // shouldn't withhold it from them.
      const saveResult = await saveSparringSession({
        accessToken,
        productLine,
        transcript: messages,
        summary: result.summary,
        score: result.score,
      });
      if (!saveResult.success) {
        console.error("[SparringRing] saveSparringSession failed", saveResult.error);
        setSaveWarning("Your grade is shown below, but it couldn't be saved to your history.");
      }

      setGradeResult(result);
    } catch (err) {
      console.error("[SparringRing] finishAndGrade failed", err);
      setGradeError("Something went wrong grading this session. Please try again.");
    } finally {
      setIsGrading(false);
    }
  };

  const returnToDashboard = () => {
    setMessages([]);
    setGradeResult(null);
    setGradeError(null);
    setSaveWarning(null);
    setDealContext(null);
    setActiveTab("dashboard");
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[600px]">
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-rose-50 to-orange-50 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Swords size={20} className="text-rose-600" /> AI Objection Simulator — Sparring Ring
          </h3>
          <div className="flex items-center gap-2">
            {messages.length > 0 && !gradeResult && (
              <button
                onClick={finishAndGrade}
                disabled={isGrading || loading}
                className="flex items-center gap-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition-colors"
              >
                {isGrading ? <Loader2 size={14} className="animate-spin" /> : <Trophy size={14} />}
                {isGrading ? "Grading..." : "Finish & Grade Session"}
              </button>
            )}
            <button
              onClick={startSession}
              disabled={loading || isGrading}
              className="flex items-center gap-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition-colors"
            >
              <RotateCcw size={14} /> {messages.length === 0 ? "Start Session" : "New Session"}
            </button>
          </div>
        </div>

        {/* Responsive button grid rather than a <select> - every option is visible at a
            glance, and the active pick is obvious without opening a dropdown. Locked once
            a session starts (same reasoning the old <select disabled> had): switching
            products mid-conversation would leave the transcript arguing about a different
            line than the one it's graded/saved against. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mr-0.5">Product:</span>
          {PRODUCT_LINES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setProductLine(l)}
              disabled={messages.length > 0}
              aria-pressed={productLine === l}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                productLine === l
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-rose-300 hover:text-rose-600"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {dealContext && (
        <div className="flex items-start justify-between gap-3 px-5 py-2.5 bg-amber-50 border-b border-amber-100">
          <p className="text-xs font-semibold text-amber-800 leading-relaxed">
            <span className="font-black uppercase tracking-wider text-[10px] mr-1.5">Real deal:</span>
            Practicing a ${Math.round(dealContext.premiumAmount || 0).toLocaleString()} {dealContext.productLine} sale that was just marked Not Sold
            {dealContext.notes ? <> — <span className="italic">&ldquo;{dealContext.notes}&rdquo;</span></> : null}
          </p>
          <button
            type="button"
            onClick={() => setDealContext(null)}
            title="Stop grounding this session in that specific deal"
            className="text-amber-500 hover:text-amber-700 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {gradeResult ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50/50">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Trophy size={32} />
          </div>
          <p className="text-xs font-black uppercase tracking-wider text-gray-400 mb-1">Session Score</p>
          <p className="text-5xl font-black text-gray-900 mb-4">
            {gradeResult.score}
            <span className="text-2xl text-gray-400">/10</span>
          </p>
          <p className="max-w-md text-sm text-gray-600 leading-relaxed mb-6">{gradeResult.summary}</p>
          {saveWarning && <p className="text-xs font-bold text-amber-600 mb-4">{saveWarning}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={startSession}
              className="flex items-center gap-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-lg transition-colors"
            >
              <RotateCcw size={14} /> Practice Again
            </button>
            <button
              onClick={returnToDashboard}
              className="flex items-center gap-1.5 text-xs font-bold bg-gray-900 hover:bg-gray-800 text-white px-4 py-2.5 rounded-lg transition-colors"
            >
              Return to Dashboard <ArrowRight size={14} />
            </button>
          </div>
        </div>
      ) : isGrading ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gray-50/50">
          <Loader2 size={32} className="text-emerald-600 animate-spin mb-4" />
          <p className="text-sm font-bold text-gray-700">Grading your performance...</p>
          <p className="text-xs text-gray-400 mt-1">Reviewing how you handled every objection in this session.</p>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gray-50/50">
            {messages.length === 0 && !loading && (
              <p className="text-sm text-gray-400 text-center py-12 font-medium">
                Pick a product line and hit &quot;Start Session&quot; — the AI will open with a tough {productLine} objection for you to handle.
              </p>
            )}
            {messages.map((m, i) => {
              const isGraded = m.role === "assistant" && m.content.startsWith("Grade:");
              const [gradeLine, ...rest] = isGraded ? m.content.split("\n") : [null, m.content];
              return (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                      m.role === "user" ? "bg-blue-600 text-white" : "bg-white border border-gray-200 text-gray-800"
                    }`}
                  >
                    {gradeLine && (
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600 mb-1.5">{gradeLine}</p>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{rest.join("\n").trim()}</p>
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm text-gray-400 flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> The prospect is thinking...
                </div>
              </div>
            )}
            {error && <p className="text-xs font-bold text-red-600 text-center">{error}</p>}
            {gradeError && <p className="text-xs font-bold text-red-600 text-center">{gradeError}</p>}
            <div ref={bottomRef} />
          </div>

          <div className="p-4 border-t border-gray-100 flex items-center gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              disabled={messages.length === 0 || loading}
              placeholder={messages.length === 0 ? "Start a session first..." : "Type how you'd respond to the prospect..."}
              className="flex-1 p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-rose-500 text-sm disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={messages.length === 0 || loading || !input.trim()}
              className="p-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              <Send size={18} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
