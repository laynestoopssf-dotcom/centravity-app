"use client";

import React, { useState } from "react";
import { FlaskConical, Loader2, Heart, Calculator, Target, MessageCircle, Sparkles } from "lucide-react";
import { supabase } from "../../utils/supabase";
import { generateObjectionPivots } from "../../app/actions/objectionSandbox";
import type { ObjectionStrategy } from "../../app/actions/objectionSandbox.types";

// =============================================================================
// Coaching Suite Feature 5: "Objection Sandbox" — a fast, one-shot tool for a
// producer who's mid-call and needs a script RIGHT NOW, not a roleplay.
// -----------------------------------------------------------------------------
// One objection in, three ready-to-read pivot scripts out
// (app/actions/objectionSandbox.ts's generateObjectionPivots). Nothing here
// is persisted anywhere — unlike the Sparring Ring, this is deliberately
// stateless: there's no transcript, no score, no history tab. Re-submitting
// simply replaces the three cards below.
// =============================================================================

const MAX_OBJECTION_LENGTH = 1000;

function iconForStrategyType(type: string): { Icon: typeof Heart; tone: string } {
  const t = type.toLowerCase();
  if (t.includes("empath")) return { Icon: Heart, tone: "text-rose-600 bg-rose-100" };
  if (t.includes("logic") || t.includes("financ")) return { Icon: Calculator, tone: "text-blue-600 bg-blue-100" };
  if (t.includes("clos") || t.includes("direct")) return { Icon: Target, tone: "text-emerald-600 bg-emerald-100" };
  return { Icon: MessageCircle, tone: "text-gray-600 bg-gray-100" };
}

export default function ObjectionSandboxPanel() {
  const [objectionText, setObjectionText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<ObjectionStrategy[] | null>(null);

  const generateStrategies = async () => {
    const text = objectionText.trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setError("Your session expired — please refresh the page.");
        return;
      }

      const result = await generateObjectionPivots({ accessToken, objectionText: text });
      if (!result.success || !result.strategies) {
        setError(result.error || "Couldn't generate strategies. Please try again.");
        return;
      }
      setStrategies(result.strategies);
    } catch (err) {
      console.error("[ObjectionSandboxPanel] generateStrategies failed", err);
      setError("Something went wrong reaching the AI. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-1">
          <FlaskConical size={20} className="text-violet-600" /> Objection Sandbox
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          Drop in the objection you just heard and get three ways to respond — instantly, while you&apos;re still on the call.
        </p>
        <textarea
          value={objectionText}
          onChange={(e) => setObjectionText(e.target.value.slice(0, MAX_OBJECTION_LENGTH))}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              generateStrategies();
            }
          }}
          placeholder="What objection did you just hear on the phone?"
          rows={3}
          disabled={loading}
          className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-violet-500 text-sm resize-none disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-3 mt-3">
          <p className="text-[10px] text-gray-400 font-semibold">{objectionText.length}/{MAX_OBJECTION_LENGTH}</p>
          <button
            onClick={generateStrategies}
            disabled={loading || !objectionText.trim()}
            className="flex items-center gap-1.5 text-sm font-bold bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl transition-colors"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {loading ? "Generating..." : "Generate Strategies"}
          </button>
        </div>
        {error && <p className="text-xs font-bold text-red-600 mt-3">{error}</p>}
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center text-center py-12">
          <Loader2 size={28} className="text-violet-600 animate-spin mb-3" />
          <p className="text-sm font-bold text-gray-700">Coaching up your next move...</p>
        </div>
      )}

      {!loading && strategies && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in duration-300">
          {strategies.map((s, i) => {
            const { Icon, tone } = iconForStrategyType(s.type);
            return (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
                <div className={`inline-flex items-center justify-center h-9 w-9 rounded-full mb-3 ${tone}`}>
                  <Icon size={18} />
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-2">{s.type}</p>
                <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap flex-1">{s.script}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
