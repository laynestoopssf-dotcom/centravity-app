"use client";

import React from "react";
import InfoTooltip from "../ui/InfoTooltip";
import type { DerivedProducerGoals, RatioSource } from "../../utils/goalMath";

// =============================================================================
// Shared producer goal-setting controls - the SINGLE implementation of the
// [Smart Math] | [Manual Override] toggle and the Monthly App Target / Daily / Weekly
// Calls-Quotes-Apps fields. Rendered by:
//   - components/SettingsTab.tsx           (Settings -> Team Management edit panel)
//   - components/coaching/AdjustGoalsModal.tsx (Coaching Insights "Adjust Goals")
// Both feed it a `member` (profile-shaped object), the derived goals from
// utils/goalMath.ts's deriveProducerGoals, and an onChange(field, value) - this file owns no
// state and no math, so the two surfaces can't drift.
// =============================================================================

const ratioSourceLabel = (src: RatioSource) =>
  src === "override" ? "manual override" : src === "live" ? "live YTD" : src === "agency" ? "agency target" : "baseline";

export function GoalModeHeader({ isManual, onChange }: { isManual: boolean; onChange: (manual: boolean) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div>
        <h4 className="text-sm font-bold text-gray-900 dark:text-slate-100">Goal Setting</h4>
        <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 max-w-md">
          {isManual
            ? "Manual Override: Daily and Weekly targets are hard-coded by you. The reverse math is bypassed for this producer."
            : "Smart Math: Daily and Weekly targets are derived from the Monthly App Target and this producer's conversion history."}
        </p>
      </div>
      <div role="group" aria-label="Goal mode" className="inline-flex p-1 rounded-full bg-gray-100 dark:bg-slate-950 border border-gray-200 dark:border-slate-700">
        <button
          type="button"
          aria-pressed={!isManual}
          onClick={() => onChange(false)}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${!isManual ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"}`}
        >
          Smart Math
        </button>
        <button
          type="button"
          aria-pressed={isManual}
          onClick={() => onChange(true)}
          className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${isManual ? "bg-amber-500 text-white shadow-sm" : "text-gray-500 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200"}`}
        >
          Manual Override
        </button>
      </div>
    </div>
  );
}

interface ColumnsProps {
  member: Record<string, any>;
  /** From deriveProducerGoals; undefined only for roles that don't use the reverse math. */
  derived: DerivedProducerGoals | undefined;
  productionDays: number;
  onChange: (field: string, value: number) => void;
  /** Extra fields stacked under the Monthly App Target (Settings adds Total Prem + Base Salary). */
  monthlyExtras?: React.ReactNode;
  monthlyHeading?: string;
}

/**
 * Renders three sibling column <div>s (Daily, Weekly, Monthly) as a fragment, so the caller decides
 * the surrounding grid (Settings: a 4-col grid alongside the Life column; the modal: its own 3-col grid).
 */
export function ProducerGoalColumns({ member, derived, productionDays, onChange, monthlyExtras, monthlyHeading = "Monthly Goals & Pay" }: ColumnsProps) {
  const hasMonthly = Number(member.monthly_target_bound) > 0;
  // Manual Override: g is null on purpose - the reverse math is bypassed and every field shows
  // (and edits) exactly what's stored for this producer. Smart Math with a Monthly Target shows the
  // derived figures directly, so the panel is right on the very render the target changes.
  const isManual = !!member.is_manual_goals;
  const g = !isManual && hasMonthly && derived ? derived.goals : null;

  const roCls = "w-full p-2.5 bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg text-sm font-black text-gray-700 dark:text-slate-200 cursor-not-allowed";
  const editCls = "w-full p-2.5 bg-white dark:bg-slate-950 border border-amber-300 dark:border-amber-500/60 rounded-lg text-sm font-bold text-gray-900 dark:text-slate-100 focus:ring-2 focus:ring-amber-400 outline-none";

  const goalInput = (label: string, derivedVal: number | undefined, field: string) => (
    <div>
      <label className="block text-[10px] font-bold text-gray-600 uppercase mb-1 dark:text-slate-200">{label}</label>
      <input
        type="number"
        min={0}
        readOnly={!isManual}
        tabIndex={isManual ? 0 : -1}
        value={g && derivedVal !== undefined ? derivedVal : (member[field] ?? 0)}
        onChange={(e) => onChange(field, Number(e.target.value))}
        className={isManual ? editCls : roCls}
      />
    </div>
  );

  return (
    <>
      <div className="space-y-4">
        <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">
          Daily Goals <span className="normal-case text-gray-400">({isManual ? "manual" : "auto"})</span>
        </h4>
        {goalInput("Calls (Touches)", g?.dailyCalls, "daily_target_touchpoints")}
        {goalInput("Quotes", g?.dailyQuotes, "daily_target_quotes")}
        {goalInput("Apps", g?.dailyApps, "daily_target_bound")}
        <p className="text-[10px] text-gray-400 dark:text-slate-400 leading-snug pt-1">
          {isManual ? (
            "Hard-coded. Switch back to Smart Math to re-derive these from the Monthly App Target."
          ) : hasMonthly && derived ? (
            <>
              Weekly goal ÷ {productionDays} production day{productionDays === 1 ? "" : "s"}/week. Quote→App {(derived.quoteToApp.ratio * 100).toFixed(1)}% ({ratioSourceLabel(derived.quoteToApp.source)}) · Touch→Quote {(derived.callToQuote.ratio * 100).toFixed(1)}% ({ratioSourceLabel(derived.callToQuote.source)}).
            </>
          ) : (
            "Enter a Monthly App Target to auto-fill every goal, or switch to Manual Override."
          )}
        </p>
      </div>

      <div className="space-y-4">
        <h4 className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-2">
          Weekly Goals <span className="normal-case text-gray-400">({isManual ? "manual" : "auto"})</span>
        </h4>
        {goalInput("Calls (Touches)", g?.weeklyCalls, "weekly_target_touchpoints")}
        {goalInput("Quotes", g?.weeklyQuotes, "weekly_target_quotes")}
        {goalInput("Apps", g?.weeklyApps, "weekly_target_bound")}
        <p className="text-[10px] text-gray-400 dark:text-slate-400 leading-snug pt-1">
          {isManual ? "Hard-coded - not tied to the Monthly App Target." : "Apps = Monthly ÷ 4 · Quotes = Apps ÷ Quote→App · Touches = Quotes ÷ Touch→Quote."}
        </p>
      </div>

      <div className="space-y-4">
        <h4 className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-2">{monthlyHeading}</h4>
        <div>
          <label className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase mb-1">
            Monthly App Target
            <InfoTooltip text="The one number you set. Weekly and Daily Calls, Quotes and Apps are all worked out backward from it using this producer's own conversion history and your global Production Days per Week." />
          </label>
          <input
            type="number"
            min={0}
            value={member.monthly_target_bound ?? 0}
            onChange={(e) => onChange("monthly_target_bound", Number(e.target.value))}
            className="w-full p-2.5 bg-blue-50 dark:bg-slate-900 border-2 border-blue-300 dark:border-blue-500/60 rounded-lg text-sm font-black text-blue-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        {monthlyExtras}
      </div>
    </>
  );
}
