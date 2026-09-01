"use client";

// =============================================================================
// "Progressive Setup" checklist - a dismissible nudge that sits at the very
// top of the Scoreboard for owner/manager-level roles only, closing three
// specific gaps onboarding intentionally leaves open (see the onboarding data
// inventory this was built from): agencies.timezone defaults to Pacific
// regardless of where the agency actually is, profiles.daily_target_bound is
// never auto-derived from the annual apps goals set in onboarding Step 5, and
// comp_plans is never created at all - onboarding only captures the base %
// on offices.base_comm_* as raw inputs for the revenue model.
//
// Per-task "done" ticks are intentionally NOT a new column each - they live in
// localStorage (keyed per profile.id) since they're just checklist UI state,
// not data the rest of the app needs to read. The one thing that *does* need
// to persist across devices/sessions is the "never show me this again"
// dismiss, which is what profiles.hide_setup_widget (see the migration next
// to this file) is for.
// =============================================================================

import { ReactNode, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Clock, Percent, Sparkles, Target, X } from "lucide-react";
import { supabase } from "../utils/supabase";
import { isManagerLevelRole } from "../utils/roles";
import { useDashboardTab } from "./dashboard/DashboardShellContext";

type SetupTaskId = "timezone" | "dailyTargets" | "compPlan";
type SetupProgress = Record<SetupTaskId, boolean>;

const DEFAULT_PROGRESS: SetupProgress = { timezone: false, dailyTargets: false, compPlan: false };

// Mirrors the exact 5 options in components/SettingsTab.tsx's "Primary Timezone"
// dropdown (~604-616) - agencies.timezone is only ever meant to hold one of these.
const SUPPORTED_TIMEZONES: Record<string, string> = {
  "America/New_York": "Eastern Time (ET)",
  "America/Chicago": "Central Time (CT)",
  "America/Denver": "Mountain Time (MT)",
  "America/Los_Angeles": "Pacific Time (PT)",
  "America/Anchorage": "Alaska Time (AKT)",
};

// Common IANA aliases a browser/OS can report that resolve to the same wall-clock
// rules as one of the 5 supported zones above, so "Confirm Timezone" doesn't dead-end
// for anyone not sitting in exactly those 5 canonical zone names.
const TIMEZONE_ALIASES: Record<string, string> = {
  "America/Detroit": "America/New_York",
  "America/Indiana/Indianapolis": "America/New_York",
  "America/Kentucky/Louisville": "America/New_York",
  "America/Toronto": "America/New_York",
  "America/Indiana/Knox": "America/Chicago",
  "America/Menominee": "America/Chicago",
  "America/Winnipeg": "America/Chicago",
  "America/Boise": "America/Denver",
  "America/Phoenix": "America/Denver", // no DST, but closest of the 5 supported options
  "America/Edmonton": "America/Denver",
  "America/Vancouver": "America/Los_Angeles",
  "America/Tijuana": "America/Los_Angeles",
  "America/Juneau": "America/Anchorage",
  "America/Sitka": "America/Anchorage",
};

function resolveSupportedTimezone(detected: string | null): string | null {
  if (!detected) return null;
  if (SUPPORTED_TIMEZONES[detected]) return detected;
  return TIMEZONE_ALIASES[detected] || null;
}

// Who actually carries a quota - excludes 'service'/'admin' seats the same way
// scripts/backfill_demo_gap_days.ts's resolveProducers() does for the demo agency.
const PRODUCING_ROLES = new Set(["owner", "manager", "producer"]);

const MONTHS_PER_YEAR = 12;
// Matches the same hardcoded production-days-per-month assumption DashboardTab
// already uses for its own daily premium pace tile (components/DashboardTab.tsx ~533).
const PRODUCTION_DAYS_PER_MONTH = 20;

interface DashboardSetupWidgetProps {
  profile: any;
  agencySettings: any;
  offices: any[];
  team: any[];
}

export default function DashboardSetupWidget({ profile, agencySettings, offices, team }: DashboardSetupWidgetProps) {
  const { setActiveTab } = useDashboardTab();

  const [hidden, setHidden] = useState<boolean>(!!profile?.hide_setup_widget);
  const [progress, setProgress] = useState<SetupProgress>(DEFAULT_PROGRESS);
  const [detectedTz, setDetectedTz] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<SetupTaskId | null>(null);
  const [saving, setSaving] = useState<SetupTaskId | null>(null);
  const [dismissing, setDismissing] = useState(false);

  const storageKey = profile?.id ? `centravity_setup_widget_tasks_${profile.id}` : null;

  // Keep in sync if the parent re-fetches profile after a full reload.
  useEffect(() => { setHidden(!!profile?.hide_setup_widget); }, [profile?.hide_setup_widget]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setProgress({ ...DEFAULT_PROGRESS, ...JSON.parse(raw) });
    } catch {
      // Corrupt or blocked localStorage - just start from a fresh checklist.
    }
  }, [storageKey]);

  useEffect(() => {
    try {
      setDetectedTz(Intl.DateTimeFormat().resolvedOptions().timeZone || null);
    } catch {
      setDetectedTz(null);
    }
  }, []);

  const markTaskDone = (task: SetupTaskId) => {
    setProgress(prev => {
      const next = { ...prev, [task]: true };
      if (storageKey) {
        try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* best-effort only */ }
      }
      return next;
    });
    setExpandedTask(null);
  };

  // ---- Task 1: Confirm Timezone ---------------------------------------------
  const currentTz = agencySettings?.timezone || "America/Los_Angeles";
  const suggestedTz = resolveSupportedTimezone(detectedTz);
  const timezoneAlreadyMatches = !suggestedTz || suggestedTz === currentTz;

  const confirmTimezone = async (tzToSave: string) => {
    setSaving("timezone");
    try {
      if (tzToSave !== currentTz && agencySettings?.id) {
        const { error } = await supabase.from("agencies").update({ timezone: tzToSave }).eq("id", agencySettings.id);
        if (error) throw error;
      }
      markTaskDone("timezone");
    } catch (err) {
      console.error("[DashboardSetupWidget] confirmTimezone failed", err);
    } finally {
      setSaving(null);
    }
  };

  // ---- Task 2: Approve Daily Targets ----------------------------------------
  // offices.annual_target_*_apps is the only place onboarding Step 5 writes annual
  // goals (see app/dashboard/page.tsx's handleSaveOfficeGoals) - agencies has no
  // equivalent column, so this always sums across every office on the agency.
  const totalAnnualApps = useMemo(() => {
    if (!offices || offices.length === 0) return 0;
    return offices.reduce((sum: number, o: any) => sum
      + (Number(o.annual_target_auto_apps) || 0)
      + (Number(o.annual_target_fire_apps) || 0)
      + (Number(o.annual_target_life_apps) || 0)
      + (Number(o.annual_target_health_apps) || 0)
      + (Number(o.annual_target_commercial_apps) || 0), 0);
  }, [offices]);

  const activeProducerCount = useMemo(() => {
    const roster = (team && team.length > 0) ? team : [profile];
    const count = roster.filter((m: any) => !m?.is_archived && PRODUCING_ROLES.has(m?.role)).length;
    return Math.max(1, count);
  }, [team, profile]);

  // Real profiles have no stored "weight" for splitting an office-wide goal across
  // producers (unlike scripts/seed_demo_agency.ts's synthetic demo weights), so this
  // divides the office's daily pace evenly across active headcount for a fair
  // starting suggestion - each producer can still hand-tune it later in Settings.
  const suggestedDailyBound = useMemo(() => {
    const officeDailyApps = totalAnnualApps / MONTHS_PER_YEAR / PRODUCTION_DAYS_PER_MONTH;
    return Math.max(1, Math.round(officeDailyApps / activeProducerCount));
  }, [totalAnnualApps, activeProducerCount]);

  const approveDailyTargets = async () => {
    if (!profile?.id) return;
    setSaving("dailyTargets");
    try {
      const { error } = await supabase.from("profiles").update({ daily_target_bound: suggestedDailyBound }).eq("id", profile.id);
      if (error) throw error;
      markTaskDone("dailyTargets");
    } catch (err) {
      console.error("[DashboardSetupWidget] approveDailyTargets failed", err);
    } finally {
      setSaving(null);
    }
  };

  // ---- Task 3: Set Comp Plans ------------------------------------------------
  // base_comm_* lives on offices (onboarding's handleSaveOfficeGoals writes it there,
  // not to agencies) - comp_plans itself is a full rules engine (base rates +
  // thresholds + accelerators, see components/SettingsTab.tsx's plan editor), so this
  // only previews the carried-over % and hands off to Settings rather than guessing
  // at thresholds/accelerators no onboarding step ever collected.
  const primaryOffice = offices?.[0];
  const baseRatesSummary = [
    { label: "Auto", value: primaryOffice?.base_comm_auto },
    { label: "Fire", value: primaryOffice?.base_comm_fire },
    { label: "Life", value: primaryOffice?.base_comm_life },
    { label: "Health", value: primaryOffice?.base_comm_health },
  ].filter(r => r.value !== undefined && r.value !== null && r.value !== "");

  const goToCompPlans = () => {
    markTaskDone("compPlan");
    setActiveTab("settings");
  };

  const dismissWidget = async () => {
    setDismissing(true);
    try {
      if (profile?.id) {
        const { error } = await supabase.from("profiles").update({ hide_setup_widget: true }).eq("id", profile.id);
        if (error) throw error;
      }
    } catch (err) {
      console.error("[DashboardSetupWidget] dismiss failed", err);
    } finally {
      setHidden(true);
      setDismissing(false);
    }
  };

  if (hidden || !isManagerLevelRole(profile?.role)) return null;

  const tasksDone = Number(progress.timezone) + Number(progress.dailyTargets) + Number(progress.compPlan);
  const pct = Math.round((tasksDone / 3) * 100);
  const allDone = tasksDone === 3;

  const TASKS: Array<{ id: SetupTaskId; icon: ReactNode; label: string; blurb: string }> = [
    { id: "timezone", icon: <Clock size={15} />, label: "Confirm Timezone", blurb: "Auto-detected from your browser" },
    { id: "dailyTargets", icon: <Target size={15} />, label: "Approve Daily Targets", blurb: "Derived from your annual goals" },
    { id: "compPlan", icon: <Percent size={15} />, label: "Set Comp Plans", blurb: "Carries over your onboarding base %" },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in duration-300">
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white p-2.5 rounded-xl shrink-0">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-sm sm:text-base">
                {allDone ? "Setup complete — you're good to go!" : "Finish setting up Centravity"}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {allDone
                  ? "All three quick checks are done. This card won't nag you again once you dismiss it."
                  : "3 quick things to confirm before your team starts tracking real numbers."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={dismissWidget}
            disabled={dismissing}
            title="Dismiss — you can always redo these in Settings"
            className="text-gray-300 hover:text-gray-500 hover:bg-gray-50 p-1.5 rounded-lg transition-colors shrink-0 disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>

        {!allDone && (
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            {TASKS.map(task => {
              const done = progress[task.id];
              const isOpen = expandedTask === task.id;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setExpandedTask(isOpen ? null : task.id)}
                  disabled={done}
                  className={`flex-1 flex items-center gap-2.5 px-4 py-3 rounded-xl border text-left transition-colors ${
                    done
                      ? "bg-emerald-50 border-emerald-100 text-emerald-700 cursor-default"
                      : isOpen
                        ? "bg-blue-50 border-blue-200 text-blue-700"
                        : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-blue-50 hover:border-blue-200"
                  }`}
                >
                  <div className={`p-1.5 rounded-lg ${done ? "bg-emerald-100" : "bg-white shadow-sm"}`}>
                    {done ? <Check size={15} /> : task.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate">{task.label}</div>
                    <div className="text-[10px] opacity-70 truncate">{done ? "Done" : task.blurb}</div>
                  </div>
                  {!done && <ChevronDown size={14} className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />}
                </button>
              );
            })}
          </div>
        )}

        {expandedTask === "timezone" && (
          <div className="mt-3 p-4 bg-blue-50/60 border border-blue-100 rounded-xl">
            {timezoneAlreadyMatches ? (
              <p className="text-sm text-gray-700">
                Your agency's timezone is set to <span className="font-bold">{SUPPORTED_TIMEZONES[currentTz] || currentTz}</span>.
                {suggestedTz ? " That matches what your browser reports." : " We couldn't confidently auto-detect a match from your browser — just confirm it's still correct."}
              </p>
            ) : (
              <p className="text-sm text-gray-700">
                Your agency is currently set to <span className="font-bold">{SUPPORTED_TIMEZONES[currentTz] || currentTz}</span>, but your
                browser reports <span className="font-bold">{SUPPORTED_TIMEZONES[suggestedTz as string]}</span>. Which is correct?
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {timezoneAlreadyMatches ? (
                <button
                  type="button"
                  onClick={() => confirmTimezone(currentTz)}
                  disabled={saving === "timezone"}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                >
                  {saving === "timezone" ? "Confirming…" : "Confirm"}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => confirmTimezone(suggestedTz as string)}
                    disabled={saving === "timezone"}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                  >
                    {saving === "timezone" ? "Saving…" : `Use ${SUPPORTED_TIMEZONES[suggestedTz as string]}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => confirmTimezone(currentTz)}
                    disabled={saving === "timezone"}
                    className="bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
                  >
                    Keep {SUPPORTED_TIMEZONES[currentTz] || currentTz}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {expandedTask === "dailyTargets" && (
          <div className="mt-3 p-4 bg-blue-50/60 border border-blue-100 rounded-xl">
            <p className="text-sm text-gray-700">
              Based on your annual goals (<span className="font-bold">{totalAnnualApps.toLocaleString()} apps/yr</span> across {offices?.length || 1} office{(offices?.length || 1) > 1 ? "s" : ""}) split evenly across
              {" "}<span className="font-bold">{activeProducerCount} active producer{activeProducerCount > 1 ? "s" : ""}</span>, we'd suggest a daily target of
              {" "}<span className="font-bold text-blue-700">{suggestedDailyBound} bound app{suggestedDailyBound !== 1 ? "s" : ""}/day</span> for you.
            </p>
            <p className="text-[11px] text-gray-500 mt-1.5">You can always fine-tune this (and set separate quote/touch targets) later in Settings → Team Management.</p>
            <div className="mt-3">
              <button
                type="button"
                onClick={approveDailyTargets}
                disabled={saving === "dailyTargets"}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
              >
                {saving === "dailyTargets" ? "Saving…" : `Approve ${suggestedDailyBound}/day`}
              </button>
            </div>
          </div>
        )}

        {expandedTask === "compPlan" && (
          <div className="mt-3 p-4 bg-blue-50/60 border border-blue-100 rounded-xl">
            {baseRatesSummary.length > 0 ? (
              <p className="text-sm text-gray-700">
                Carried over from onboarding: {baseRatesSummary.map((r, i) => (
                  <span key={r.label}>
                    <span className="font-bold">{r.label} {r.value}%</span>{i < baseRatesSummary.length - 1 ? ", " : ""}
                  </span>
                ))}. Head to Settings to turn these into a full comp plan (thresholds, accelerators, bonuses) and assign it to your team.
              </p>
            ) : (
              <p className="text-sm text-gray-700">No base commission % found from onboarding — you can set one up from scratch in Settings.</p>
            )}
            <div className="mt-3">
              <button
                type="button"
                onClick={goToCompPlans}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors"
              >
                Set Comp Plans in Settings →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
