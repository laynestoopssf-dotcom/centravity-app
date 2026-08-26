"use client";

import React, { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Loader2 } from "lucide-react";
import { supabase } from "../../utils/supabase";

// =============================================================================
// Floating "AI Support" chat widget — live, wired to app/api/chat/route.ts.
// -----------------------------------------------------------------------------
// Mounted once in app/dashboard/layout.tsx (inside DashboardShellContext.Provider,
// outside the isShellRoute branch) so it persists across every /dashboard/*
// route — main tabs, Cockpit, Help & FAQ — the same way a real support widget
// would, instead of remounting (and losing conversation state) every time the
// user switches tabs or navigates to a full page route.
//
// Sending a message posts the running conversation + the caller's own
// Supabase access token to /api/chat, which re-derives their name/role
// server-side, streams "Stratt"'s reply from OpenAI, and hands back a plain
// text stream that gets appended into the assistant bubble chunk by chunk.
// =============================================================================

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
}

const SUGGESTED_PROMPTS = ["How do I log an activity?", "How does my commission get calculated?", "How do I invite a team member?"];

const WELCOME_MESSAGE_ID = "welcome";

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function AiSupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: WELCOME_MESSAGE_ID,
      role: "assistant",
      text: "Hi! I'm Stratt, your AI Support assistant. Ask me anything about navigating or using Centravity.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isTyping, isOpen]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isTyping) return;

    const userMessage: ChatMessage = { id: makeId(), role: "user", text: trimmed };
    // The welcome message is local-only flavor text, never sent as conversation
    // history to the model — it isn't something Stratt ever actually said.
    const history = [...messages, userMessage]
      .filter((m) => m.id !== WELCOME_MESSAGE_ID)
      .map((m) => ({ role: m.role, content: m.text }));

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsTyping(true);

    const assistantId = makeId();
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", text: "" }]);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("You've been signed out — please refresh and sign back in.");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, messages: history }),
      });

      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || "Something went wrong. Please try again.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // A ref (not a plain local variable) so the streaming buffer isn't
      // treated as component render state by the React Compiler's
      // immutability analysis — it's just a mutable accumulator scoped to
      // this one in-flight request.
      const bufferRef = { current: "" };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bufferRef.current += decoder.decode(value, { stream: true });
        const nextText = bufferRef.current;
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: nextText } : m)));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: message } : m)));
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {isOpen && (
        <div className="fixed bottom-40 right-4 lg:bottom-24 lg:right-6 z-50 w-[calc(100vw-2rem)] max-w-sm h-[70vh] max-h-[520px] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* HEADER */}
          <div className="flex items-center justify-between gap-3 px-4 py-3.5 bg-gradient-to-r from-indigo-600 to-purple-700 text-white shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-white/15 rounded-lg">
                <Sparkles size={16} />
              </div>
              <div>
                <p className="font-bold text-sm leading-tight">AI Support</p>
                <p className="text-[10px] text-indigo-200 leading-tight">Ask Stratt anything about Centravity</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 text-indigo-100 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              aria-label="Close chat"
            >
              <X size={18} />
            </button>
          </div>

          {/* MESSAGES */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
            {messages
              .filter((m) => m.text !== "")
              .map((m) => (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                      m.role === "user"
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-white text-gray-700 border border-gray-100 shadow-sm rounded-bl-sm"
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            {isTyping && messages[messages.length - 1]?.text === "" && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1.5">
                  <Loader2 size={14} className="animate-spin text-gray-400" />
                  <span className="text-xs text-gray-400 font-medium">Thinking…</span>
                </div>
              </div>
            )}

            {messages.length === 1 && !isTyping && (
              <div className="pt-2 space-y-1.5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">Try asking</p>
                {SUGGESTED_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => sendMessage(prompt)}
                    className="block w-full text-left text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-xl px-3 py-2 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* INPUT */}
          <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3 border-t border-gray-100 bg-white shrink-0">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              disabled={isTyping}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {/* FAB — parked well above bottom-4 on narrow/short windows (bottom-20)
          so it never overlaps QuickActionsBar's own `fixed bottom-4 inset-x-3`
          dock (see that component), which shares this same z-40 layer below
          the `lg` breakpoint. */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        title="AI Support"
        className="fixed bottom-20 right-4 lg:bottom-4 lg:right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 text-white shadow-[0_8px_30px_rgb(0,0,0,0.25)] hover:scale-105 transition-transform"
      >
        {isOpen ? <X size={22} /> : <Sparkles size={22} />}
      </button>
    </>
  );
}
