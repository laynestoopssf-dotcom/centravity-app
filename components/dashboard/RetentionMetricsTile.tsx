"use client";

// =============================================================================
// Owner/Manager-facing MTD summary of the Service & Retention team's
// `retention_events` log (supabase/migrations/20260901020000_add_retention_events.sql,
// logged via components/RetentionLoggingWidget.tsx). Mounted on the main
// Scoreboard (components/DashboardTab.tsx) right next to DashboardMetrics'
// Sales Revenue cards - same card styling, own row, so retention numbers
// aren't confused with sales premium/commission.
//
// RLS on retention_events only lets owner/admin/manager roles SELECT every
// row in their agency (see the migration) - a producer/service viewer would
// only ever see their own rows here, which is why this tile is gated to
// isManagerLevelRole by its one caller in DashboardTab.tsx.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { LifeBuoy, Percent } from "lucide-react";
import { supabase } from "../../utils/supabase";

interface RetentionMetricsTileProps {
  agencyId: string | undefined;
  /** Pass the active office filter (e.g. DashboardTab's activeOfficeVal) to scope the same way
   * every other manager-level card on the Scoreboard already respects office selection. Omit or
   * pass 'all' for agency-wide. */
  officeId?: string;
}

const formatCurrency = (value: number): string => `$${Math.round(value || 0).toLocaleString()}`;

export default function RetentionMetricsTile({ agencyId, officeId }: RetentionMetricsTileProps) {
  const [events, setEvents] = useState<{ premium_at_risk: number; outcome: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      let query = supabase.from("retention_events")
        .select("premium_at_risk, outcome")
        .eq("agency_id", agencyId)
        .gte("created_at", startOfMonth);
      if (officeId && officeId !== "all") query = query.eq("office_id", officeId);

      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        console.error("[RetentionMetricsTile] fetch failed", error);
        setEvents([]);
      } else {
        setEvents(data || []);
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [agencyId, officeId]);

  const { totalPremiumRescued, saveRatePct, totalLogged } = useMemo(() => {
    const rows = events || [];
    const saved = rows.filter(r => r.outcome === "saved");
    const rescued = saved.reduce((sum, r) => sum + (Number(r.premium_at_risk) || 0), 0);
    const rate = rows.length > 0 ? (saved.length / rows.length) * 100 : 0;
    return { totalPremiumRescued: rescued, saveRatePct: rate, totalLogged: rows.length };
  }, [events]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      <div className="min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="min-w-0 truncate text-xs font-bold text-gray-400 uppercase tracking-wider">Total Premium Rescued</p>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <LifeBuoy size={18} />
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-black text-gray-900 truncate">{loading ? "…" : formatCurrency(totalPremiumRescued)}</p>
        <p className="text-xs text-gray-400 mt-1.5">Saved premium, month-to-date</p>
      </div>

      <div className="min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="min-w-0 truncate text-xs font-bold text-gray-400 uppercase tracking-wider">Opportunity Save Rate</p>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <Percent size={18} />
          </div>
        </div>
        <p className="text-2xl sm:text-3xl font-black text-gray-900 truncate">{loading ? "…" : totalLogged > 0 ? `${Math.round(saveRatePct)}%` : "—"}</p>
        <p className="text-xs text-gray-400 mt-1.5">{totalLogged > 0 ? `${totalLogged} at-risk ${totalLogged === 1 ? "event" : "events"} logged this month` : "No retention events logged yet this month"}</p>
      </div>
    </div>
  );
}
