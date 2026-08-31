"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  AlertTriangle,
  Target,
  DollarSign,
  Percent,
  Activity,
  CalendarRange,
  NotebookPen,
  History,
  Loader2,
  Stethoscope,
  Swords,
  LineChart,
  FlaskConical,
} from "lucide-react";
import { supabase } from "../utils/supabase";
import { isManagerLevelRole } from "../utils/roles";
import { computeCoachingSnapshot } from "../utils/coachingMetrics";
import { computeTrendAlerts } from "../utils/coachingAlerts";
import DealAutopsyPanel from "./coaching/DealAutopsyPanel";
import SparringRing from "./coaching/SparringRing";
import SparringHistoryPanel from "./coaching/SparringHistoryPanel";
import ObjectionSandboxPanel from "./coaching/ObjectionSandboxPanel";

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
//      picker + this producer's own controllable numbers only (YTD premium by
//      line, daily/weekly activity vs. their targets, individual close rate,
//      pipeline potential — see utils/coachingMetrics.ts's header comment for
//      why office/agency-blended AEC & lapse rate were deliberately dropped)
//      + Trend Alerts (Feature 4) + the notes/commitments form that writes
//      coaching_sessions.
//   2. Deal Autopsies   — everyone. Producers fill in objections on deals
//      they tagged "Send to Coaching" from the Active Pipeline; managers get
//      a read-only feed of the whole team's. See coaching/DealAutopsyPanel.tsx.
//   3. Sparring Ring     — everyone, self-serve AI objection practice. See
//      coaching/SparringRing.tsx.
//   4. Sparring History — everyone (producers see only their own graded
//      sessions, managers see the whole team's, both purely via RLS on
//      sparring_sessions - no client-side role branching on which rows to
//      fetch). See coaching/SparringHistoryPanel.tsx.
//   5. Objection Sandbox — everyone. A fast, stateless "what do I say right
//      now" tool for a producer mid-call: one objection in, three pivot
//      scripts out via the generateObjectionPivots Server Action. Nothing
//      here is persisted. See coaching/ObjectionSandboxPanel.tsx.
// =============================================================================

type InnerTab = "snapshot" | "autopsies" | "sparring" | "sparringHistory" | "sandbox";

interface CoachingSession {
  id: string;
  producer_id: string;
  manager_id: string;
  notes: string | null;
  commitments: string | null;
  created_at: string;
}

export default function CoachingTab({ profile, team, agencySettings, pipeline, showToast, pendingSparringSeed, onSparringSeedConsumed }: any) {
  // Same custom_roles-aware permission pattern as every other manager-gated
  // tab (canViewReports, canViewAgencyDash, etc. in app/dashboard/page.tsx) —
  // `manage_coaching` (see components/SettingsTab.tsx's AVAILABLE_PERMISSIONS/
  // DEFAULT_ROLES) defaults to Owner/Admin/Manager (an "Office Manager" gets
  // full parity with the Owner here out of the box), but an agency can still
  // dial it up/down per-role from Settings -> Roles & Permissions instead of
  // being stuck with the hardcoded fallback.
  const roleConfig = agencySettings?.custom_roles?.find((r: any) => r.id === profile?.role);
  const isManagerLevel = roleConfig?.permissions?.manage_coaching ?? isManagerLevelRole(profile?.role);
  const [innerTab, setInnerTab] = useState<InnerTab>(isManagerLevel ? "snapshot" : "autopsies");

  // A `not_sold` deal sent over from the Scoreboard (see DashboardTab.tsx's "Send to Coaching"
  // button + app/dashboard/page.tsx's sendNotSoldDealToSparring) jumps straight to the Sparring
  // Ring inner tab, regardless of whatever tab this producer/manager happened to be on before.
  useEffect(() => {
    if (pendingSparringSeed) setInnerTab("sparring");
  }, [pendingSparringSeed]);

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

  const customProductLines = agencySettings?.custom_product_lines || [];

  // Individual daily/weekly activity (touchpoints + quotes) for the Daily/Weekly Activity
  // cards below - fetched fresh per selected producer, same self-contained pattern as
  // fetchSessions above, since this tab doesn't otherwise receive `activities` as a prop.
  // Scoped to "since the start of this week" so a single fetch covers both the "today" and
  // "this week" buckets computeCoachingSnapshot derives from it.
  const [activities, setActivities] = useState<any[]>([]);
  const fetchActivities = useCallback(async () => {
    if (!selectedProducerId || !profile?.agency_id) return;
    const now = new Date();
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    monday.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("activities")
      .select("activity_type, logged_at, user_id")
      .eq("agency_id", profile.agency_id)
      .eq("user_id", selectedProducerId)
      .gte("logged_at", monday.toISOString())
      .limit(2000);

    if (error) {
      console.error("[CoachingTab] fetchActivities failed", error);
      setActivities([]);
      return;
    }
    setActivities((data as any) || []);
  }, [selectedProducerId, profile?.agency_id]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  const snapshot = useMemo(
    () => (selectedProducer ? computeCoachingSnapshot(selectedProducer, pipeline || [], activities, customProductLines) : null),
    [selectedProducer, pipeline, activities, customProductLines]
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
    { id: "sparringHistory", label: "Sparring History", icon: History, show: true },
    { id: "sandbox", label: "Objection Sandbox", icon: FlaskConical, show: true },
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
            <div className="space-y-4">
              {/* Individual YTD Premium — split by product line, no office/agency blend */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign size={14} className="text-emerald-500" /> Individual YTD Premium
                  </p>
                  <p className="text-sm font-black text-gray-900">
                    ${Math.round(snapshot.ytdPremiumTotal).toLocaleString()}{" "}
                    <span className="text-[10px] font-semibold text-gray-400">({snapshot.ytdAppsTotal} bound apps)</span>
                  </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-blue-50 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-blue-500 uppercase tracking-wider">Auto</p>
                    <p className="text-lg font-black text-blue-900">${Math.round(snapshot.ytdPremiumByLine.auto).toLocaleString()}</p>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-orange-500 uppercase tracking-wider">Fire</p>
                    <p className="text-lg font-black text-orange-900">${Math.round(snapshot.ytdPremiumByLine.fire).toLocaleString()}</p>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-purple-500 uppercase tracking-wider">Life</p>
                    <p className="text-lg font-black text-purple-900">${Math.round(snapshot.ytdPremiumByLine.life).toLocaleString()}</p>
                  </div>
                  <div className="bg-teal-50 rounded-xl p-3">
                    <p className="text-[9px] font-bold text-teal-500 uppercase tracking-wider">Health</p>
                    <p className="text-lg font-black text-teal-900">${Math.round(snapshot.ytdPremiumByLine.health).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Percent size={14} className="text-indigo-500" /> Close Rate
                  </p>
                  <p className="text-2xl font-black text-gray-900">{snapshot.closeRate30.toFixed(0)}%</p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-1">
                    {snapshot.closeRateRecent.toFixed(0)}% last 7 days · 30-day quote-to-bind
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Target size={14} className="text-amber-500" /> Pipeline Potential
                  </p>
                  <p className="text-2xl font-black text-gray-900">${Math.round(snapshot.pipelinePotential).toLocaleString()}</p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-1">{snapshot.pipelineCount} open quoted/bound policies</p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <Activity size={14} className="text-blue-500" /> Today&apos;s Activity
                  </p>
                  <p className="text-2xl font-black text-gray-900">
                    {snapshot.dailyQuotes}
                    <span className="text-sm text-gray-400 font-bold">/{snapshot.dailyQuoteTarget}</span>
                  </p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-1">
                    quotes · {snapshot.dailyTouchpoints}/{snapshot.dailyTouchpointTarget} touchpoints
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                    <CalendarRange size={14} className="text-violet-500" /> Weekly Activity
                  </p>
                  <p className="text-2xl font-black text-gray-900">
                    {snapshot.weeklyQuotes}
                    <span className="text-sm text-gray-400 font-bold">/{snapshot.weeklyQuoteTarget}</span>
                  </p>
                  <p className="text-[10px] font-semibold text-gray-400 mt-1">
                    quotes · {snapshot.weeklyTouchpoints}/{snapshot.weeklyTouchpointTarget} touchpoints
                  </p>
                </div>
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

      {innerTab === "sparring" && (
        <SparringRing seedContext={pendingSparringSeed} onSeedConsumed={onSparringSeedConsumed} />
      )}

      {innerTab === "sparringHistory" && (
        <SparringHistoryPanel
          profile={profile}
          team={team}
          isManagerLevel={isManagerLevel}
          onStartSession={() => setInnerTab("sparring")}
        />
      )}

      {innerTab === "sandbox" && <ObjectionSandboxPanel />}
    </div>
  );
}
