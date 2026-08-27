"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  AlertTriangle,
  Target,
  DollarSign,
  Percent,
  Gauge,
  NotebookPen,
  History,
  Loader2,
  Stethoscope,
  Swords,
  LineChart,
} from "lucide-react";
import { supabase } from "../utils/supabase";
import { isManagerLevelRole } from "../utils/roles";
import { computeCoachingSnapshot } from "../utils/coachingMetrics";
import { computeTrendAlerts } from "../utils/coachingAlerts";
import DealAutopsyPanel from "./coaching/DealAutopsyPanel";
import SparringRing from "./coaching/SparringRing";

// =============================================================================
// The Coaching Suite — referred to as both "app/coaching/page.tsx" and "the
// Coaching tab" in the request that built this; implemented as a tab inside
// the existing /dashboard SPA (this component, rendered from
// app/dashboard/page.tsx when activeTab === 'coaching') rather than a
// standalone top-level route. Every other feature area in this app (Life
// Module, Reports, Agency MTD, etc.) is a tab for the same reason: it inherits
// auth, the persistent sidebar, and already-fetched team/pipeline data for
// free instead of duplicating that plumbing in a second, chrome-less route
// like /dashboard/cockpit had to.
//
// Three inner sections:
//   1. 1-on-1 Snapshot  — MANAGER-LEVEL ONLY (owner/admin/manager). Producer
//      picker + live YTD/AEC/lapse/quoting numbers + Trend Alerts (Feature 4)
//      + the notes/commitments form that writes coaching_sessions.
//   2. Deal Autopsies   — everyone. Producers fill in objections on deals
//      they tagged "Send to Coaching" from the Active Pipeline; managers get
//      a read-only feed of the whole team's. See coaching/DealAutopsyPanel.tsx.
//   3. Sparring Ring     — everyone, self-serve AI objection practice. See
//      coaching/SparringRing.tsx.
// =============================================================================

type InnerTab = "snapshot" | "autopsies" | "sparring";

interface CoachingSession {
  id: string;
  producer_id: string;
  manager_id: string;
  notes: string | null;
  commitments: string | null;
  created_at: string;
}

export default function CoachingTab({ profile, team, offices, agencySettings, pipeline, showToast }: any) {
  const isManagerLevel = isManagerLevelRole(profile?.role);
  const [innerTab, setInnerTab] = useState<InnerTab>(isManagerLevel ? "snapshot" : "autopsies");

  const producers = useMemo(() => {
    return [...(team || [])].sort((a: any, b: any) => (a.first_name || "").localeCompare(b.first_name || ""));
  }, [team]);

  const [selectedProducerId, setSelectedProducerId] = useState<string>("");
  useEffect(() => {
    if (selectedProducerId) return;
    if (isManagerLevel) {
      setSelectedProducerId(producers[0]?.id || profile?.id || "");
    } else if (profile?.id) {
      setSelectedProducerId(profile.id);
    }
  }, [isManagerLevel, producers, profile?.id, selectedProducerId]);

  const selectedProducer = useMemo(
    () => producers.find((t: any) => t.id === selectedProducerId) || (selectedProducerId === profile?.id ? profile : null),
    [producers, selectedProducerId, profile]
  );

  const [sessions, setSessions] = useState<CoachingSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsTableMissing, setSessionsTableMissing] = useState(false);
  const [notesInput, setNotesInput] = useState("");
  const [commitmentsInput, setCommitmentsInput] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchSessions = useCallback(async () => {
    if (!selectedProducerId) return;
    setSessionsLoading(true);
    const { data, error } = await supabase
      .from("coaching_sessions")
      .select("*")
      .eq("producer_id", selectedProducerId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      if ((error as any).code === "42P01") setSessionsTableMissing(true);
      else console.error("[CoachingTab] fetchSessions failed", error);
      setSessions([]);
      setSessionsLoading(false);
      return;
    }
    setSessions((data as any) || []);
    setSessionsLoading(false);
  }, [selectedProducerId]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const office = useMemo(
    () => (offices || []).find((o: any) => o.id === selectedProducer?.office_id) || null,
    [offices, selectedProducer]
  );

  const customProductLines = agencySettings?.custom_product_lines || [];

  const snapshot = useMemo(
    () => (selectedProducer ? computeCoachingSnapshot(selectedProducer, pipeline || [], office, agencySettings, customProductLines) : null),
    [selectedProducer, pipeline, office, agencySettings, customProductLines]
  );

  const alerts = useMemo(
    () => (selectedProducer ? computeTrendAlerts(selectedProducer, pipeline || [], customProductLines) : []),
    [selectedProducer, pipeline, customProductLines]
  );

  const lastSession = sessions[0] || null;
  const actualSinceLastSession = useMemo(() => {
    if (!lastSession || !selectedProducerId) return null;
    const since = new Date(lastSession.created_at);
    const rows = (pipeline || []).filter((p: any) => p.user_id === selectedProducerId && new Date(p.logged_at) >= since);
    const bound = rows.filter((p: any) => p.status === "bound" || p.status === "issued");
    return {
      quotes: rows.length,
      bound: bound.length,
      premium: bound.reduce((sum: number, p: any) => sum + (Number(p.premium_amount) || 0), 0),
    };
  }, [lastSession, pipeline, selectedProducerId]);

  const saveCoachingSession = async () => {
    if (!notesInput.trim() && !commitmentsInput.trim()) {
      showToast?.("Add notes or a commitment before logging this 1-on-1.", "error");
      return;
    }
    if (!selectedProducerId || !profile?.agency_id) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("coaching_sessions")
      .insert({
        agency_id: profile.agency_id,
        producer_id: selectedProducerId,
        manager_id: profile.id,
        notes: notesInput.trim() || null,
        commitments: commitmentsInput.trim() || null,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.error("[CoachingTab] saveCoachingSession failed", error);
      if ((error as any).code === "42P01") {
        showToast?.("Coaching Sessions table isn't set up yet — ask your admin to run the latest migration.", "error");
      } else {
        showToast?.("Failed to log this 1-on-1. Please try again.", "error");
      }
      setSaving(false);
      return;
    }

    setSessions((prev) => [data as any, ...prev]);
    setNotesInput("");
    setCommitmentsInput("");
    showToast?.("1-on-1 logged.", "success");
    setSaving(false);
  };

  if (!profile) return null;

  const innerTabs: { id: InnerTab; label: string; icon: any; show: boolean }[] = [
    { id: "snapshot", label: "1-on-1 Snapshot", icon: LineChart, show: isManagerLevel },
    { id: "autopsies", label: "Deal Autopsies", icon: Stethoscope, show: true },
    { id: "sparring", label: "Sparring Ring", icon: Swords, show: true },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300 pb-12">
      <header className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <GraduationCap className="text-indigo-600" size={32} /> Coaching
          </h2>
          <p className="text-gray-500 mt-1">1-on-1s, deal autopsies, and AI-powered objection practice.</p>
        </div>
        <div className="flex bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
          {innerTabs.filter((t) => t.show).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setInnerTab(t.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors ${
                  innerTab === t.id ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </header>

      {innerTab === "snapshot" && isManagerLevel && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-1.5 shadow-sm h-[44px] w-fit">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">PRODUCER:</span>
            <select
              value={selectedProducerId}
              onChange={(e) => setSelectedProducerId(e.target.value)}
              className="bg-transparent text-sm font-bold text-gray-900 outline-none cursor-pointer"
            >
              {producers.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.first_name} {t.last_name}
                </option>
              ))}
            </select>
          </div>

          {alerts.length > 0 && (
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-5 space-y-2">
              <h3 className="text-sm font-black text-red-700 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle size={18} /> Suggested Action
              </h3>
              {alerts.map((a) => (
                <p key={a.id} className="text-sm text-red-800 font-semibold">
                  {a.message}
                </p>
              ))}
            </div>
          )}

          {snapshot && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <DollarSign size={14} className="text-emerald-500" /> YTD Premium
                </p>
                <p className="text-2xl font-black text-gray-900">
                  ${Math.round(snapshot.ytdPremium).toLocaleString()}
                </p>
                <p className="text-[10px] font-semibold text-gray-400 mt-1">{snapshot.ytdApps} bound apps</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Percent size={14} className="text-indigo-500" /> AEC Pacing
                </p>
                <p className="text-2xl font-black text-gray-900">{snapshot.aecRate}%</p>
                <p className="text-[10px] font-semibold text-gray-400 mt-1">
                  Contributed {snapshot.aecContributionApps} Auto/Fire apps, ${Math.round(snapshot.aecContributionFsCommission).toLocaleString()} FS premium YTD
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Gauge size={14} className="text-red-500" /> Net Lapse Rate
                </p>
                <p className="text-2xl font-black text-gray-900">{snapshot.netLapseRate}%</p>
                <p className="text-[10px] font-semibold text-gray-400 mt-1">{office ? office.name : "Agency"}-level rate</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                  <Target size={14} className="text-blue-500" /> Daily Quote Target
                </p>
                <p className="text-2xl font-black text-gray-900">{snapshot.dailyQuoteTarget}</p>
                <p className="text-[10px] font-semibold text-gray-400 mt-1">
                  {snapshot.closeRateRecent.toFixed(0)}% close rate (7d) · {snapshot.closeRate30.toFixed(0)}% (30d)
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <NotebookPen size={20} className="text-indigo-500" /> Log This Week&apos;s 1-on-1
              </h3>
              <div className="space-y-3">
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  placeholder="Notes from this session..."
                  rows={3}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                />
                <textarea
                  value={commitmentsInput}
                  onChange={(e) => setCommitmentsInput(e.target.value)}
                  placeholder="What did they commit to this week?"
                  rows={2}
                  className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
                />
                <button
                  onClick={saveCoachingSession}
                  disabled={saving}
                  className="flex items-center gap-2 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl transition-colors"
                >
                  {saving && <Loader2 size={14} className="animate-spin" />} Log 1-on-1
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <History size={20} className="text-amber-500" /> Last Commitment vs. Actual
              </h3>
              {sessionsTableMissing ? (
                <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                  Coaching Sessions aren&apos;t set up yet — the <code>coaching_sessions</code> migration hasn&apos;t been applied.
                </p>
              ) : sessionsLoading ? (
                <p className="text-sm text-gray-400 font-medium">Loading...</p>
              ) : !lastSession ? (
                <p className="text-sm text-gray-400 font-medium">No prior 1-on-1 logged for {selectedProducer?.first_name || "this producer"} yet.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                      Committed on {new Date(lastSession.created_at).toLocaleDateString()}
                    </p>
                    <p className="text-sm text-gray-800 font-medium bg-gray-50 border border-gray-100 rounded-lg p-3">
                      {lastSession.commitments || "No specific commitment logged."}
                    </p>
                  </div>
                  {actualSinceLastSession && (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="bg-blue-50 rounded-lg p-2.5">
                        <p className="text-lg font-black text-blue-700">{actualSinceLastSession.quotes}</p>
                        <p className="text-[9px] font-bold text-blue-500 uppercase">Quotes Since</p>
                      </div>
                      <div className="bg-emerald-50 rounded-lg p-2.5">
                        <p className="text-lg font-black text-emerald-700">{actualSinceLastSession.bound}</p>
                        <p className="text-[9px] font-bold text-emerald-500 uppercase">Bound Since</p>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-2.5">
                        <p className="text-lg font-black text-amber-700">${Math.round(actualSinceLastSession.premium).toLocaleString()}</p>
                        <p className="text-[9px] font-bold text-amber-500 uppercase">Premium Since</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {innerTab === "autopsies" && (
        <DealAutopsyPanel profile={profile} team={team} isManagerLevel={isManagerLevel} showToast={showToast} />
      )}

      {innerTab === "sparring" && <SparringRing />}
    </div>
  );
}
