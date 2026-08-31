"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Swords, Loader2, MessageSquare, X } from "lucide-react";
import { supabase } from "../../utils/supabase";

// =============================================================================
// "Sparring History" — the read side of Phase 2/3 of the Sparring Ring.
// -----------------------------------------------------------------------------
// Renders every completed session from public.sparring_sessions as a grid of
// cards (date, product line, score, AI summary), with a "View Transcript"
// button that opens the full turn-by-turn transcript in a modal.
//
// Deliberately does ZERO role branching on which rows to fetch - RLS on
// sparring_sessions (see supabase/migrations/20260831000000_add_sparring_sessions.sql)
// already does that for us: a standard producer's `select` only ever returns
// rows where user_id = auth.uid(), while an owner/admin/manager's `select`
// returns every row in their agency_id. The `.eq("agency_id", ...)` below is
// just an index-friendly narrowing on top of that, not the actual security
// boundary - same pattern as CoachingTab's fetchActivities.
// =============================================================================

interface SparringHistoryPanelProps {
  profile: { id: string; agency_id?: string; first_name?: string; last_name?: string } | null;
  team: Array<{ id: string; first_name?: string; last_name?: string }>;
  isManagerLevel: boolean;
  onStartSession?: () => void;
}

interface SparringTranscriptMessage {
  role: "user" | "assistant";
  content: string;
}

interface SparringSessionRow {
  id: string;
  created_at: string;
  user_id: string;
  product_line: string | null;
  transcript: SparringTranscriptMessage[] | null;
  summary: string | null;
  score: number | null;
}

const MAX_SESSIONS = 100;

function scoreTone(score: number | null): string {
  if (score == null) return "bg-gray-100 text-gray-500";
  if (score >= 8) return "bg-emerald-100 text-emerald-700";
  if (score >= 5) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

export default function SparringHistoryPanel({ profile, team, isManagerLevel, onStartSession }: SparringHistoryPanelProps) {
  const [sessions, setSessions] = useState<SparringSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [expandedSession, setExpandedSession] = useState<SparringSessionRow | null>(null);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of team || []) {
      map.set(m.id, `${m.first_name || ""} ${m.last_name || ""}`.trim() || "Teammate");
    }
    if (profile?.id) {
      map.set(profile.id, `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "You");
    }
    return map;
  }, [team, profile]);

  const fetchSessions = useCallback(async () => {
    if (!profile?.agency_id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sparring_sessions")
      .select("*")
      .eq("agency_id", profile.agency_id)
      .order("created_at", { ascending: false })
      .limit(MAX_SESSIONS);

    if (error) {
      if ((error as { code?: string }).code === "42P01") setTableMissing(true);
      else console.error("[SparringHistoryPanel] fetchSessions failed", error);
      setSessions([]);
      setLoading(false);
      return;
    }
    setSessions((data as SparringSessionRow[]) || []);
    setLoading(false);
  }, [profile?.agency_id]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Swords size={18} className="text-rose-600" /> Sparring History
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            {isManagerLevel ? "Every graded practice session across the team." : "Your graded practice sessions."}
          </p>
        </div>
      </div>

      {tableMissing ? (
        <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          Sparring History isn&apos;t set up yet — the <code>sparring_sessions</code> migration hasn&apos;t been applied.
        </p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 font-medium py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading sessions...
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <Swords size={26} />
          </div>
          <p className="text-sm font-bold text-gray-700">No sparring sessions found. Jump in the ring!</p>
          <p className="text-xs text-gray-400 mt-1 max-w-sm">
            Finish and grade a session in the Sparring Ring and it&apos;ll show up here with your score and AI feedback.
          </p>
          {onStartSession && (
            <button
              onClick={onStartSession}
              className="mt-4 flex items-center gap-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white px-4 py-2.5 rounded-lg transition-colors"
            >
              <Swords size={14} /> Start a Session
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sessions.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {new Date(s.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <span className={`text-xs font-black px-2.5 py-1 rounded-full ${scoreTone(s.score)}`}>
                  {s.score != null ? `${s.score}/10` : "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                  {s.product_line || "General"}
                </span>
                {isManagerLevel && (
                  <span className="text-xs font-semibold text-gray-500">{nameById.get(s.user_id) || "Teammate"}</span>
                )}
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1 line-clamp-4">
                {s.summary || "No summary available."}
              </p>
              <button
                onClick={() => setExpandedSession(s)}
                className="mt-4 flex items-center justify-center gap-1.5 text-xs font-bold text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 rounded-lg px-3 py-2 transition-colors"
              >
                <MessageSquare size={14} /> View Transcript
              </button>
            </div>
          ))}
        </div>
      )}

      {expandedSession && (
        <div
          className="fixed inset-0 z-[200] bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setExpandedSession(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  {new Date(expandedSession.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  · {expandedSession.product_line || "General"}
                  {isManagerLevel ? ` · ${nameById.get(expandedSession.user_id) || "Teammate"}` : ""}
                </p>
                <span className={`inline-flex mt-1.5 text-xs font-black px-2.5 py-1 rounded-full ${scoreTone(expandedSession.score)}`}>
                  Score: {expandedSession.score != null ? `${expandedSession.score}/10` : "—"}
                </span>
              </div>
              <button
                onClick={() => setExpandedSession(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                aria-label="Close transcript"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3 flex-1 bg-gray-50/50">
              {expandedSession.summary && (
                <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded-xl p-3 italic">
                  {expandedSession.summary}
                </p>
              )}
              {(expandedSession.transcript || []).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No transcript was saved for this session.</p>
              )}
              {(expandedSession.transcript || []).map((m, i) => {
                const isGraded = m.role === "assistant" && m.content.startsWith("Grade:");
                const [gradeLine, ...rest] = isGraded ? m.content.split("\n") : [null, m.content];
                return (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
