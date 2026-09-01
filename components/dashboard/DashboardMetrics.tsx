"use client";

import React from "react";
import { DollarSign, Target, Wallet } from "lucide-react";

export interface DashboardMetricsProps {
  // Agency-wide (or office-scoped, if an office filter is active — see
  // agencyStats in app/dashboard/page.tsx) bound+issued premium for the
  // current calendar month. Deliberately NOT scoped to whichever producer
  // happens to be selected in the Team filter — these three cards are the
  // owner/admin-level summary, not a per-producer view.
  monthlyPremium: number;
  // Derived, not stored: sum of offices.annual_target_premium / 12 (or just
  // the selected office's, if one is active) — see the identical calculation
  // in MyPerformanceTab's agency-view pacing. There is no dedicated monthly
  // goal column; annual/12 is the agency's existing convention for turning
  // an annual target into a monthly pace everywhere else in the app.
  monthlyPremiumGoal: number;
  // Sum of every non-owner/admin team member's estimated commission (issued +
  // pipeline + bonuses) for the current month — see teamCommissions in
  // app/dashboard/page.tsx, the same per-producer comp-plan math CommissionTab
  // already renders, just totaled across the roster (owner/admin excluded —
  // see ownerCommission below) instead of shown per person.
  estimatedCommission: number;
  // The owner/admin's own estimated commission, tracked in its own bucket so
  // their (often outlier) production doesn't skew "Team Commissions" above —
  // see components/DashboardTab.tsx's estimatedOwnerCommission. Optional/0
  // for agencies where the owner isn't drawing a comp-plan commission.
  ownerCommission?: number;
}

const formatCurrency = (value: number): string => {
  const rounded = Math.round(value || 0);
  return `$${rounded.toLocaleString()}`;
};

export default function DashboardMetrics({ monthlyPremium, monthlyPremiumGoal, estimatedCommission, ownerCommission = 0 }: DashboardMetricsProps) {
  const pacingPct = monthlyPremiumGoal > 0 ? (monthlyPremium / monthlyPremiumGoal) * 100 : 0;
  const pacingBarPct = Math.max(0, Math.min(100, pacingPct));
  const pacingLabel = monthlyPremiumGoal > 0 ? `${Math.round(pacingPct)}%` : "—";
  const pacingBarClass = pacingPct >= 100 ? "bg-emerald-500" : pacingPct >= 60 ? "bg-blue-500" : "bg-amber-500";

  return (
    // lg (1024px), not md (768px) — the dashboard shell's sidebar itself
    // switches from stacked-above to a fixed 288px-wide column at exactly
    // md (see app/dashboard/layout.tsx's `md:flex-row` + DashboardSidebar's
    // `md:w-72`). Tailwind's responsive variants key off VIEWPORT width, not
    // this grid's own container width, so a 3-column layout at that same md
    // breakpoint used to force three cards into whatever's left of the
    // viewport after that sidebar — often well under 300px each — which is
    // exactly the "cut off/hidden" cramped window this was reported for.
    // Waiting for lg guarantees real room is left over once the sidebar is
    // already taking its own fixed slice.
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
      <div className="min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="min-w-0 truncate text-xs font-bold text-gray-400 uppercase tracking-wider">Monthly Premium</p>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <DollarSign size={18} />
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-black text-gray-900 truncate">{formatCurrency(monthlyPremium)}</p>
        <p className="text-xs text-gray-400 mt-1.5">Written month-to-date</p>
      </div>

      <div className="min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="min-w-0 truncate text-xs font-bold text-gray-400 uppercase tracking-wider">Team Pacing</p>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <Target size={18} />
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-black text-gray-900 truncate">{pacingLabel}</p>
        <div className="mt-3 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full rounded-full transition-all ${pacingBarClass}`} style={{ width: `${pacingBarPct}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1.5 break-words">
          {monthlyPremiumGoal > 0
            ? `${formatCurrency(monthlyPremium)} of ${formatCurrency(monthlyPremiumGoal)} goal`
            : "No monthly goal set for this office"}
        </p>
      </div>

      <div className="min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="min-w-0 truncate text-xs font-bold text-gray-400 uppercase tracking-wider">Team Commissions</p>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Wallet size={18} />
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-black text-gray-900 truncate">{formatCurrency(estimatedCommission)}</p>
        <p className="text-xs text-gray-400 mt-1.5">Earned month-to-date (est.) — producers only</p>
        {ownerCommission > 0 && (
          <p className="text-[11px] font-bold text-purple-600 mt-1 truncate">+ {formatCurrency(ownerCommission)} Owner (tracked separately)</p>
        )}
      </div>
    </div>
  );
}
