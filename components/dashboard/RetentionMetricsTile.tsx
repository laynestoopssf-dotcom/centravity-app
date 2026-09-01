"use client";

// =============================================================================
// Owner/Manager-facing MTD summary of the Service & Retention team's
// `retention_events` log (supabase/migrations/20260901020000_add_retention_events.sql +
// 20260901030000_retention_events_multi_product_lines.sql, logged via
// components/RetentionLoggingWidget.tsx). Mounted on the main Scoreboard
// (components/DashboardTab.tsx) right next to DashboardMetrics' Sales
// Revenue cards - same card styling, own row, so retention numbers aren't
// confused with sales premium/commission.
//
// RLS on retention_events only lets owner/admin/manager roles SELECT every
// row in their agency (see the migration) - a producer/service viewer would
// only ever see their own rows here, which is why this tile is gated to
// isManagerLevelRole by its one caller in DashboardTab.tsx.
// =============================================================================

import { useEffect, useMemo, useState } from "react";
import { LifeBuoy, Percent } from "lucide-react";
import { supabase } from "../../utils/supabase";
import ProfileAvatar from "../ui/ProfileAvatar";

interface RetentionEventRow {
  team_member_id: string;
  premium_at_risk: number;
  outcome: string;
}

interface RetentionMetricsTileProps {
  agencyId: string | undefined;
  /** Pass the active office filter (e.g. DashboardTab's activeOfficeVal) to scope the same way
   * every other manager-level card on the Scoreboard already respects office selection. Omit or
   * pass 'all' for agency-wide. */
  officeId?: string;
  /** Team roster, for name/avatar lookup on the per-member Retention Leaderboard below. Same
   * shape DashboardTab already threads through everywhere else (id, first_name, last_name,
   * avatar_url, role). */
  team?: any[];
}

const formatCurrency = (value: number): string => `$${Math.round(value || 0).toLocaleString()}`;

export default function RetentionMetricsTile({ agencyId, officeId, team }: RetentionMetricsTileProps) {
  const [events, setEvents] = useState<RetentionEventRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!agencyId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      let query = supabase.from("retention_events")
        .select("team_member_id, premium_at_risk, outcome")
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

  const leaderboard = useMemo(() => {
    const rows = events || [];
    const byMember = new Map<string, { userId: string; rescued: number; savedCount: number; totalCount: number }>();
    rows.forEach((row) => {
      if (!byMember.has(row.team_member_id)) {
        byMember.set(row.team_member_id, { userId: row.team_member_id, rescued: 0, savedCount: 0, totalCount: 0 });
      }
      const entry = byMember.get(row.team_member_id)!;
      entry.totalCount += 1;
      if (row.outcome === "saved") {
        entry.savedCount += 1;
        entry.rescued += Number(row.premium_at_risk) || 0;
      }
    });

    return Array.from(byMember.values())
      .map((entry) => {
        const member = (team || []).find((t: any) => t.id === entry.userId);
        return {
          ...entry,
          name: member ? `${member.first_name} ${member.last_name}` : "Unknown Rep",
          avatarUrl: member?.avatar_url || null,
          saveRatePct: entry.totalCount > 0 ? (entry.savedCount / entry.totalCount) * 100 : 0,
        };
      })
      .sort((a, b) => b.rescued - a.rescued);
  }, [events, team]);

  return (
    <div className="space-y-4">
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

      {/* RETENTION LEADERBOARD — styled after the sales Production Roster table in
          DashboardTab.tsx (avatar + name row, right-aligned metric columns). */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Retention Leaderboard</h3>
          <span className="text-xs font-bold text-gray-500 bg-gray-50 border border-gray-200 px-3 py-1 rounded-lg whitespace-nowrap">Month-to-Date</span>
        </div>

        {leaderboard.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400 font-bold text-sm">{loading ? "Loading…" : "No retention events logged yet this month."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-white text-gray-400 text-xs uppercase font-semibold border-b border-gray-100">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3 text-center">Events Logged</th>
                  <th className="px-6 py-3 text-center">Save Rate</th>
                  <th className="px-6 py-3 text-right">Premium Rescued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leaderboard.map((row) => (
                  <tr key={row.userId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 font-bold text-gray-900">
                      <div className="flex items-center gap-2.5">
                        <ProfileAvatar src={row.avatarUrl} name={row.name} size="xs" />
                        {row.name}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center font-medium text-gray-600">{row.totalCount}</td>
                    <td className="px-6 py-3 text-center font-black text-emerald-600">{Math.round(row.saveRatePct)}%</td>
                    <td className="px-6 py-3 text-right font-bold text-gray-700">{formatCurrency(row.rescued)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
