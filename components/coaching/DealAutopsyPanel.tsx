"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Stethoscope, Loader2, Sparkles, CheckCircle2 } from "lucide-react";
import { supabase } from "../../utils/supabase";
import IdentifierChip from "../ui/IdentifierChip";

// =============================================================================
// Feature 2: Deal Autopsies.
// -----------------------------------------------------------------------------
// Lists rows from the new `deal_autopsies` table (see supabase/migrations/
// 20260827010000_add_coaching_module.sql) - one row per "Send to Coaching" tag
// a producer put on a Quoted deal in the Active Pipeline
// (components/DashboardTab.tsx). Producers fill in the objection they hit and
// get back a cached, senior-agent talk-path from POST /api/ai/deal-autopsy;
// managers get a read-only feed of the whole team's tagged deals so they can
// see exactly where production is stalling and what advice was already given.
// =============================================================================

interface DealAutopsyRow {
  id: string;
  producer_id: string;
  policy_id: string;
  objection_text: string | null;
  ai_talk_path: string | null;
  status: "open" | "reviewed";
  created_at: string;
  policies?: { client_identifier_hash?: string | null; client_identifier_ciphertext?: string | null; client_identifier_iv?: string | null; product_line?: string; premium_amount?: number } | null;
}

export default function DealAutopsyPanel({ profile, team, isManagerLevel, showToast }: any) {
  const [rows, setRows] = useState<DealAutopsyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const nameFor = (userId: string) => {
    if (userId === profile?.id) return "You";
    const t = (team || []).find((m: any) => m.id === userId);
    return t ? `${t.first_name} ${t.last_name}` : "Team Member";
  };

  const fetchRows = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    let query = supabase
      .from("deal_autopsies")
      .select("id, producer_id, policy_id, objection_text, ai_talk_path, status, created_at, policies(client_identifier_hash, client_identifier_ciphertext, client_identifier_iv, product_line, premium_amount)")
      .order("created_at", { ascending: false })
      .limit(100);

    query = isManagerLevel ? query.eq("agency_id", profile.agency_id) : query.eq("producer_id", profile.id);

    const { data, error } = await query;
    if (error) {
      // 42P01 = undefined_table - the migration hasn't been run against this database yet.
      if ((error as any).code === "42P01") {
        setTableMissing(true);
      } else {
        console.error("[DealAutopsyPanel] fetch failed", error);
      }
      setRows([]);
      setLoading(false);
      return;
    }
    setRows((data as any) || []);
    setLoading(false);
  }, [profile?.id, profile?.agency_id, isManagerLevel]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const submitObjection = async (autopsyId: string) => {
    const objectionText = (drafts[autopsyId] || "").trim();
    if (!objectionText) {
      showToast?.("Describe the objection you received first.", "error");
      return;
    }
    setSubmittingId(autopsyId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        showToast?.("Your session expired — please refresh the page.", "error");
        return;
      }
      const res = await fetch("/api/ai/deal-autopsy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken, autopsyId, objectionText }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        showToast?.(data?.error || "Failed to generate a talk-path. Please try again.", "error");
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === autopsyId ? { ...r, ...data.autopsy } : r)));
      setDrafts((prev) => ({ ...prev, [autopsyId]: "" }));
      showToast?.("Talk-path generated.", "success");
    } catch (err) {
      console.error("[DealAutopsyPanel] submit failed", err);
      showToast?.("Something went wrong. Please try again.", "error");
    } finally {
      setSubmittingId(null);
    }
  };

  if (tableMissing) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-6 text-sm font-semibold">
        Deal Autopsies aren&apos;t set up yet — the <code>deal_autopsies</code> database migration hasn&apos;t been applied. Ask your admin to run it.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="p-5 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
          <Stethoscope size={20} />
        </div>
        <div>
          <h3 className="font-bold text-gray-900">Deal Autopsies</h3>
          <p className="text-xs text-gray-500">
            {isManagerLevel ? "Deals your team has tagged \u201cSend to Coaching\u201d from the Active Pipeline." : "Deals you\u2019ve tagged \u201cSend to Coaching\u201d — describe the objection and get an exact talk-path back."}
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4 max-h-[520px] overflow-y-auto">
        {loading ? (
          <p className="text-sm text-gray-400 text-center py-8 font-medium">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8 font-medium">
            No deals tagged for coaching yet. Tag a Quoted deal from the Active Pipeline to get started.
          </p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="p-4 border border-gray-200 rounded-xl bg-gray-50/60">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
                  <IdentifierChip policyId={row.policy_id} hash={row.policies?.client_identifier_hash} ciphertext={row.policies?.client_identifier_ciphertext} iv={row.policies?.client_identifier_iv} agencyId={profile?.agency_id} />
                  <span className="text-gray-400 font-medium">·</span>
                  <span>{row.policies?.product_line || "Policy"}</span>
                  {isManagerLevel && (
                    <>
                      <span className="text-gray-400 font-medium">·</span>
                      <span className="text-gray-500">{nameFor(row.producer_id)}</span>
                    </>
                  )}
                </div>
                <span
                  className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider ${
                    row.status === "reviewed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {row.status === "reviewed" ? "Reviewed" : "Awaiting Objection"}
                </span>
              </div>

              {row.status === "reviewed" ? (
                <div className="space-y-2 mt-2">
                  <p className="text-xs text-gray-500">
                    <span className="font-bold text-gray-700">Objection: </span>
                    {row.objection_text}
                  </p>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 flex gap-2">
                    <Sparkles size={16} className="text-indigo-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-indigo-900 font-medium leading-relaxed">{row.ai_talk_path}</p>
                  </div>
                </div>
              ) : !isManagerLevel ? (
                <div className="flex flex-col sm:flex-row gap-2 mt-2">
                  <textarea
                    value={drafts[row.id] || ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    placeholder="What objection did you get on this deal?"
                    rows={2}
                    className="flex-1 p-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  />
                  <button
                    onClick={() => submitObjection(row.id)}
                    disabled={submittingId === row.id}
                    className="flex items-center justify-center gap-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg transition-colors whitespace-nowrap"
                  >
                    {submittingId === row.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Get Talk-Path
                  </button>
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic mt-1">Waiting on the producer to describe the objection.</p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
