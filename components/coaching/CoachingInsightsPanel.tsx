"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Lightbulb, TrendingDown, CheckCircle2, Check, Loader2, SlidersHorizontal, ChevronDown } from "lucide-react";
import { supabase } from "../../utils/supabase";
import {
  ACK_COOLDOWN_DAYS,
  METRIC_DB_KEY,
  computeCoachingInsights,
  formatPct as pct,
  getT30Boundary,
  type AcknowledgedRecord,
  type CoachingInsightFlag,
  type WindowCounts,
} from "../../utils/coachingMath";

// =============================================================================
// Coaching Insights (top of the Coaching tab, manager-level only).
// -----------------------------------------------------------------------------
// Flags any producer whose trailing-30-day Call->Quote or Quote->App ratio is more than 15%
// (relative) below their own historical baseline. All math lives in utils/coachingMath.ts; this
// component owns the data fetching, the acknowledge action and rendering.
//
// ONE boundary instant (now - 30 days) splits every conversion query into two non-overlapping windows:
//   Baseline  = rows dated STRICTLY BEFORE the boundary   (.lt)   - all-time, minus the last 30 days
//   T30       = rows dated ON/AFTER the boundary          (.gte)
// so no row can be counted in both, and the last 30 days never pollute the baseline they're
// compared against.
//
//   Touches  - 2 head-only COUNT queries per producer (baseline via .lt, T30 via .gte on
//              activities.logged_at, activity_type = 'touchpoint'). Counted in the database: a
//              full-history touch log is far too large to pull as rows.
//   Policies - ONE row query for the agency (user_id/status/dates only). Each policy's window
//              depends on a COALESCE across columns (quote date = written_at || logged_at; bound date
//              = bound_at || written_at || logged_at), which PostgREST can't express in a count
//              filter, so the same boundary is applied to those anchors while bucketing the rows.
//   History  - coaching_insights_history rows acknowledged within the cooldown window
//              (resolved_at >= now - ACK_COOLDOWN_DAYS), i.e. only the rows that can still suppress
//              a flag - older ones are history, not snoozes. Passed to computeCoachingInsights,
//              which drops any flag whose (producer, metric) was acknowledged inside that window.
//
// ACKNOWLEDGE inserts an immutable snapshot row into coaching_insights_history and appends it to
// local history state, so the flag disappears instantly (no refetch) and stays gone after a reload.
// =============================================================================

interface Props {
  profile: any;
  team: any[];
  /** Opens the in-place Adjust Goals modal. Omit to hide the action (no permission to edit goals). */
  onAdjustGoals?: (producerId: string) => void;
  showToast?: (msg: string, type?: string) => void;
}

interface Windows {
  baseline: Record<string, WindowCounts>;
  t30: Record<string, WindowCounts>;
}

const fmtDate = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

export default function CoachingInsightsPanel({ profile, team, onAdjustGoals, showToast }: Props) {
  const [windows, setWindows] = useState<Windows | null>(null);
  const [history, setHistory] = useState<AcknowledgedRecord[]>([]);
  const [historyTableMissing, setHistoryTableMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ackingId, setAckingId] = useState<string | null>(null);
  // null = "automatic" (expanded when there are flags, collapsed when there are none); once the
  // manager clicks the chevron their choice wins for the rest of the session.
  const [collapsedOverride, setCollapsedOverride] = useState<boolean | null>(null);

  // Active producers: not archived (`team` already excludes archived), not on vacation, and not
  // service-role (they don't run the call -> quote -> app funnel).
  const producers = useMemo(
    () => (team || []).filter((m: any) => m.role !== "service" && !m.on_vacation && !m.is_archived),
    [team]
  );
  const producersKey = producers.map((p: any) => p.id).join(",");

  useEffect(() => {
    if (!profile?.agency_id || producers.length === 0) {
      setWindows(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setFailed(false);

    (async () => {
      const boundary = getT30Boundary();
      const boundaryIso = boundary.toISOString();
      const cooldownStartIso = new Date(Date.now() - ACK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const agencyId = profile.agency_id;

      const countTouches = async (userId: string, window: "baseline" | "t30") => {
        let q = supabase
          .from("activities")
          .select("id", { count: "exact", head: true })
          .eq("agency_id", agencyId)
          .eq("user_id", userId)
          .eq("activity_type", "touchpoint");
        q = window === "baseline" ? q.lt("logged_at", boundaryIso) : q.gte("logged_at", boundaryIso);
        const { count, error } = await q;
        if (error) throw error;
        return count || 0;
      };

      try {
        const [policyRes, touchRows, historyRes] = await Promise.all([
          supabase
            .from("policies")
            .select("user_id, status, written_at, logged_at, bound_at")
            .eq("agency_id", agencyId)
            .limit(100000),
          Promise.all(
            producers.map(async (p: any) => {
              const [b, t] = await Promise.all([countTouches(p.id, "baseline"), countTouches(p.id, "t30")]);
              return [p.id, b, t] as const;
            })
          ),
          supabase
            .from("coaching_insights_history")
            .select("producer_id, metric, resolved_at")
            .eq("agency_id", agencyId)
            .gte("resolved_at", cooldownStartIso),
        ]);
        if (policyRes.error) throw policyRes.error;

        // The history table is an add-on: if its migration hasn't run, show flags un-snoozed (and
        // hide Acknowledge) rather than failing the whole widget.
        if (historyRes.error) {
          if ((historyRes.error as any).code === "42P01") setHistoryTableMissing(true);
          else console.error("[CoachingInsightsPanel] history fetch failed", historyRes.error);
        }

        const baseline: Record<string, WindowCounts> = {};
        const t30: Record<string, WindowCounts> = {};
        producers.forEach((p: any) => {
          baseline[p.id] = { touches: 0, quotes: 0, bound: 0 };
          t30[p.id] = { touches: 0, quotes: 0, bound: 0 };
        });
        touchRows.forEach(([id, b, t]) => {
          baseline[id].touches = b;
          t30[id].touches = t;
        });

        (policyRes.data || []).forEach((pol: any) => {
          if (!baseline[pol.user_id]) return;
          // Every policy row is one quote event, dated by when it was first written.
          const quoteDate = new Date(pol.written_at || pol.logged_at);
          (quoteDate >= boundary ? t30 : baseline)[pol.user_id].quotes++;
          // Bound/issued additionally lands in whichever window its bind date falls in.
          if (pol.status === "bound" || pol.status === "issued") {
            const boundDate = new Date(pol.bound_at || pol.written_at || pol.logged_at);
            (boundDate >= boundary ? t30 : baseline)[pol.user_id].bound++;
          }
        });

        if (!cancelled) {
          setWindows({ baseline, t30 });
          setHistory(historyRes.error ? [] : ((historyRes.data as AcknowledgedRecord[]) || []));
        }
      } catch (err) {
        console.error("[CoachingInsightsPanel] failed to load conversion windows", err);
        if (!cancelled) {
          setFailed(true);
          setWindows(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.agency_id, producersKey]);

  // Flags are derived (never stored): conversion windows + acknowledgement history -> visible flags.
  // Re-runs whenever history changes, which is what makes an acknowledged card vanish immediately.
  const { flags, snoozed } = useMemo(
    () => (windows ? computeCoachingInsights(producers, windows.baseline, windows.t30, history) : { flags: [], snoozed: [] }),
    [windows, producers, history]
  );

  const collapsed = collapsedOverride ?? (!loading && !failed && flags.length === 0);

  const acknowledge = async (f: CoachingInsightFlag) => {
    if (!profile?.id || !profile?.agency_id) return;
    setAckingId(f.id);
    const resolvedAt = new Date().toISOString();
    const { error } = await supabase.from("coaching_insights_history").insert({
      agency_id: profile.agency_id,
      producer_id: f.producerId,
      resolved_by: profile.id,
      metric: METRIC_DB_KEY[f.metric],
      // Exact snapshot of what the manager was looking at: ratios as decimals + the raw T30 volume.
      t30_ratio: f.t30Ratio,
      baseline_ratio: f.baselineRatio,
      volume_context: {
        window: "T30",
        touches: f.t30Counts.touches,
        quotes: f.t30Counts.quotes,
        apps: f.t30Counts.bound,
        relative_drop: f.relativeDrop,
      },
      resolved_at: resolvedAt,
    });
    setAckingId(null);
    if (error) {
      console.error("[CoachingInsightsPanel] acknowledge failed", error);
      if ((error as any).code === "42P01") {
        setHistoryTableMissing(true);
        showToast?.("Coaching Insights history isn't set up yet — ask your admin to run the latest migration.", "error");
      } else {
        showToast?.("Couldn't acknowledge that insight. Please try again.", "error");
      }
      return;
    }
    // Applying it to local history is what snoozes the flag right now, no refetch needed.
    setHistory((prev) => [...prev, { producer_id: f.producerId, metric: METRIC_DB_KEY[f.metric], resolved_at: resolvedAt }]);
    showToast?.(`Acknowledged — ${f.producerName}'s ${f.metricLabel} flag is snoozed for ${ACK_COOLDOWN_DAYS} days.`, "success");
  };

  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsedOverride(!collapsed)}
        aria-expanded={!collapsed}
        aria-controls="coaching-insights-body"
        className="w-full p-5 flex items-center gap-3 text-left hover:bg-gray-50/60 dark:hover:bg-slate-800/40 transition-colors"
      >
        <div className="p-2 bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
          <Lightbulb size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 dark:text-slate-100">Coaching Insights</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400">
            Producers whose last-30-day conversion is more than 15% below their own historical baseline.
          </p>
        </div>

        {/* Top-level summary: always visible, collapsed or not. */}
        {loading ? (
          <Loader2 size={16} className="animate-spin text-gray-400 dark:text-slate-400 shrink-0" />
        ) : failed ? null : flags.length > 0 ? (
          <span className="px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 shrink-0">
            {flags.length} flag{flags.length === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
            <CheckCircle2 size={16} /> All producers are trending at or above historical baselines.
          </span>
        )}

        <ChevronDown
          size={20}
          className={`text-gray-400 dark:text-slate-400 shrink-0 transition-transform duration-200 ${collapsed ? "" : "rotate-180"}`}
        />
      </button>

      {/* Narrow screens: the zero-flag summary drops below the header instead of being hidden. */}
      {!loading && !failed && flags.length === 0 && (
        <p className="sm:hidden flex items-center gap-1.5 px-5 pb-4 -mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={16} className="shrink-0" /> All producers are trending at or above historical baselines.
        </p>
      )}

      {!collapsed && (
        <div id="coaching-insights-body" className="px-5 pb-5 pt-1 border-t border-gray-100 dark:border-slate-800">
          {loading ? (
            <p className="flex items-center justify-center gap-2 text-sm text-gray-400 dark:text-slate-400 py-4 font-medium">
              <Loader2 size={16} className="animate-spin" /> Analyzing recent performance...
            </p>
          ) : failed ? (
            <p className="text-sm text-gray-500 dark:text-slate-400 text-center py-4 font-medium">
              Couldn&apos;t load conversion data right now. Try refreshing the page.
            </p>
          ) : flags.length === 0 ? (
            <div className="pt-4 space-y-2">
              <p className="text-sm text-gray-600 dark:text-slate-300">Nothing needs attention right now.</p>
              {snoozed.length > 0 && (
                <ul className="space-y-1">
                  {snoozed.map(({ flag, snoozedUntil }) => (
                    <li key={flag.id} className="text-xs text-slate-500 dark:text-slate-400">
                      {flag.producerName}&apos;s {flag.metricLabel} drop was acknowledged — snoozed until {fmtDate(snoozedUntil)}.
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
                {flags.map((f) => {
                  // Rose once the slide is severe (>30% relative drop), amber for the 15-30% band.
                  const severe = f.relativeDrop > 0.3;
                  const accent = severe ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400";
                  const acking = ackingId === f.id;
                  return (
                    <div
                      key={f.id}
                      className="p-4 rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex flex-col gap-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-slate-100 truncate">{f.producerName}</p>
                          <p className={`text-xs font-black uppercase tracking-wider flex items-center gap-1 ${accent}`}>
                            <TrendingDown size={13} /> {f.metricLabel}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-2xl font-black leading-none ${accent}`}>{pct(f.t30Ratio)}</p>
                          <p className="text-[10px] font-bold text-gray-400 dark:text-slate-400 uppercase tracking-wider mt-1">
                            vs {pct(f.baselineRatio)} baseline
                          </p>
                        </div>
                      </div>

                      <p className="text-sm text-gray-600 dark:text-slate-300 leading-relaxed">{f.message}</p>

                      <div className="flex flex-wrap items-center justify-between gap-3 mt-auto">
                        {/* Raw T30 volume behind the ratio, so the manager can judge how much weight it carries. */}
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {f.metric === "callToQuote"
                            ? `T30 Volume: ${f.t30Counts.touches.toLocaleString()} Touches | ${f.t30Counts.quotes.toLocaleString()} Quotes`
                            : `T30 Volume: ${f.t30Counts.quotes.toLocaleString()} Quotes | ${f.t30Counts.bound.toLocaleString()} Apps`}
                        </p>
                        <div className="flex items-center gap-2">
                          {!historyTableMissing && (
                            <button
                              type="button"
                              onClick={() => acknowledge(f)}
                              disabled={acking}
                              title={`Mark as addressed - hides this flag for ${ACK_COOLDOWN_DAYS} days and logs it to the coaching history.`}
                              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
                            >
                              {acking ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Acknowledge
                            </button>
                          )}
                          {onAdjustGoals && (
                            <button
                              type="button"
                              onClick={() => onAdjustGoals(f.producerId)}
                              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <SlidersHorizontal size={13} /> Adjust Goals
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {snoozed.length > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-4">
                  {snoozed.length} acknowledged flag{snoozed.length === 1 ? " is" : "s are"} snoozed for {ACK_COOLDOWN_DAYS} days.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
