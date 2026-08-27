"use client";

import React, { useRef, useState } from "react";
import { Swords, Send, RotateCcw, Loader2 } from "lucide-react";
import { supabase } from "../../utils/supabase";

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
// =============================================================================

const PRODUCT_LINES = ["Life", "Commercial"] as const;
type SparringLine = (typeof PRODUCT_LINES)[number];

interface SparringMessage {
  role: "user" | "assistant";
  content: string;
}

export default function SparringRing() {
  const [productLine, setProductLine] = useState<SparringLine>("Life");
  const [messages, setMessages] = useState<SparringMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  const callSparring = async (nextMessages: SparringMessage[]) => {
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
        body: JSON.stringify({ accessToken, productLine, messages: nextMessages }),
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
    callSparring([]);
  };

  const sendMessage = () => {
    const text = input.trim();
    if (!text || loading) return;
    const next: SparringMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    scrollToBottom();
    callSparring(next);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[600px]">
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-rose-50 to-orange-50 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-bold text-gray-900 flex items-center gap-2">
          <Swords size={20} className="text-rose-600" /> AI Objection Simulator — Sparring Ring
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={productLine}
            onChange={(e) => setProductLine(e.target.value as SparringLine)}
            disabled={messages.length > 0}
            className="text-xs font-bold px-3 py-2 rounded-lg border border-gray-200 bg-white outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {PRODUCT_LINES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <button
            onClick={startSession}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <RotateCcw size={14} /> {messages.length === 0 ? "Start Session" : "New Session"}
          </button>
        </div>
      </div>

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
    </div>
  );
}
