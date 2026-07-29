// Shared engine for the "Custom Corporate Targets" feature (Settings -> Corporate
// Targets -> Custom Target Builder). Lets an owner define an arbitrary named goal
// on top of a real tracked metric, then routes it to either the team-visible
// Scoreboard or the owner-only Revenue tab (agency_custom_targets.display_location).
//
// Kept separate from the hardcoded target_vc_active/target_travel_active toggles -
// those gate two fixed widgets, this is an open-ended, owner-defined list.
//
// Supports tiered milestones + cascading "feeds_into" links so a mini-promo (e.g.
// "Fast Start" on life apps) can dump bonus credits into a master promo's progress
// (e.g. "Travel Target" on total premium) once a tier threshold is hit. See
// scripts/add_custom_targets_tiers_and_linking.sql for the underlying columns.
import { resolveParentLine } from "./productLines";

export type CustomTargetPeriod = "weekly" | "monthly" | "ytd" | "custom";
export type CustomTargetDisplayLocation = "scoreboard" | "revenue";

export type CustomTargetMetricDef = {
  value: string;
  label: string;
  source: "activity" | "policy";
  activityType?: string;
  // Only set for line-specific policy metrics (apps or premium for one product line).
  parentLine?: string;
  aggregate: "count" | "premium_sum";
  // Activities are only ever fetched for the current calendar year (see
  // fetchCustomTargetProgressData in app/dashboard/page.tsx), so "ytd"/"custom" ranges
  // that reach further back than Jan 1 won't be fully accurate for activity-sourced
  // metrics - same constraint the Scoreboard itself already lives with (it never
  // reports YTD touches/quotes, only YTD apps, which come from `policies`).
  periods: CustomTargetPeriod[];
};

export const CUSTOM_TARGET_METRICS: CustomTargetMetricDef[] = [
  { value: "touchpoints", label: "Touches", source: "activity", activityType: "touchpoint", aggregate: "count", periods: ["weekly", "monthly", "custom"] },
  { value: "inbound_calls", label: "Inbound Calls", source: "activity", activityType: "inbound_call", aggregate: "count", periods: ["weekly", "monthly", "custom"] },
  { value: "quotes", label: "Quotes", source: "activity", activityType: "quote", aggregate: "count", periods: ["weekly", "monthly", "custom"] },
  { value: "cross_sells", label: "Cross-Sells", source: "activity", activityType: "cross_sell", aggregate: "count", periods: ["weekly", "monthly", "custom"] },
  { value: "auto_apps", label: "Auto Apps (Bound)", source: "policy", parentLine: "Auto", aggregate: "count", periods: ["weekly", "monthly", "ytd", "custom"] },
  { value: "fire_apps", label: "Fire Apps (Bound)", source: "policy", parentLine: "Fire", aggregate: "count", periods: ["weekly", "monthly", "ytd", "custom"] },
  { value: "commercial_apps", label: "Commercial Apps (Bound)", source: "policy", parentLine: "Commercial", aggregate: "count", periods: ["weekly", "monthly", "ytd", "custom"] },
  { value: "life_apps", label: "Life Apps (Bound)", source: "policy", parentLine: "Life", aggregate: "count", periods: ["weekly", "monthly", "ytd", "custom"] },
  { value: "health_apps", label: "Health Apps (Bound)", source: "policy", parentLine: "Health", aggregate: "count", periods: ["weekly", "monthly", "ytd", "custom"] },
  { value: "total_premium", label: "Total Issued Premium ($)", source: "policy", aggregate: "premium_sum", periods: ["weekly", "monthly", "ytd", "custom"] },
  { value: "life_premium", label: "Life Issued Premium ($)", source: "policy", parentLine: "Life", aggregate: "premium_sum", periods: ["weekly", "monthly", "ytd", "custom"] },
];

export const CUSTOM_TARGET_PERIODS: { value: CustomTargetPeriod; label: string }[] = [
  { value: "weekly", label: "This Week (Mon-Sun)" },
  { value: "monthly", label: "This Month" },
  { value: "ytd", label: "Year to Date" },
  { value: "custom", label: "Custom Date Range" },
];

export const getMetricDef = (metricType: string): CustomTargetMetricDef | undefined =>
  CUSTOM_TARGET_METRICS.find((m) => m.value === metricType);

export type CustomTargetTier = {
  id: string | number;
  name: string;
  threshold_metric: number;
  reward_credit_value: number;
};

export type CustomTargetRow = {
  id: string;
  agency_id: string;
  office_id: string | null;
  name: string;
  metric_type: string;
  period: CustomTargetPeriod;
  start_date?: string | null;
  end_date?: string | null;
  target_value: number;
  display_location: CustomTargetDisplayLocation;
  tiers?: CustomTargetTier[];
  feeds_into_target_id?: string | null;
  active: boolean;
  sort_order?: number;
};

// Matches the Monday-start week / calendar-month / Jan-1 YTD conventions already
// used for the Scoreboard's own touches/quotes/apps windows in app/dashboard/page.tsx.
// For 'custom', uses the target's own start_date/end_date instead.
export function getPeriodRange(
  target: Pick<CustomTargetRow, "period" | "start_date" | "end_date">,
  now: Date = new Date()
): { start: Date; end: Date } {
  if (target.period === "custom") {
    return {
      start: target.start_date ? new Date(target.start_date) : new Date(0),
      end: target.end_date ? new Date(target.end_date) : now,
    };
  }
  const start = new Date(now);
  if (target.period === "weekly") {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    start.setFullYear(now.getFullYear(), now.getMonth(), diff);
  } else if (target.period === "monthly") {
    start.setFullYear(now.getFullYear(), now.getMonth(), 1);
  } else {
    start.setFullYear(now.getFullYear(), 0, 1);
  }
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

// The raw, ledger-derived value for a single target's own metric_type/period - this
// is what a standalone target's progress is, and what a "feeder" target's tier
// thresholds are checked against. Does NOT include any cascaded credits.
export function computeRawMetricValue(
  target: Pick<CustomTargetRow, "metric_type" | "period" | "office_id" | "start_date" | "end_date">,
  activities: any[],
  policies: any[],
  linesDict: any[]
): number {
  const def = getMetricDef(target.metric_type);
  if (!def) return 0;
  const { start, end } = getPeriodRange(target);
  const startMs = start.getTime();
  const endMs = end.getTime();

  if (def.source === "activity") {
    return (activities || []).filter((a) => {
      if (a.activity_type !== def.activityType) return false;
      if (target.office_id && a.office_id !== target.office_id) return false;
      const t = new Date(a.logged_at).getTime();
      return t >= startMs && t <= endMs;
    }).length;
  }

  const matches = (policies || []).filter((p) => {
    if (target.office_id && p.office_id !== target.office_id) return false;
    const t = new Date(p.logged_at).getTime();
    if (t < startMs || t > endMs) return false;
    if (def.parentLine && resolveParentLine(p.product_line, linesDict) !== def.parentLine) return false;
    return true;
  });

  if (def.aggregate === "premium_sum") {
    return matches.filter((p) => p.status === "issued").reduce((sum, p) => sum + (Number(p.premium_amount) || 0), 0);
  }
  return matches.filter((p) => p.status === "bound" || p.status === "issued").length;
}

/** @deprecated use computeRawMetricValue - kept as an alias so any stale imports don't break. */
export const computeCustomTargetCurrent = computeRawMetricValue;

export type ResolvedCustomTargetValue = {
  raw: number;
  effective: number;
  earnedCredits: number;
  tiersAchieved: CustomTargetTier[];
};

// Resolves every target's "effective" progress = its own raw metric value, plus the
// sum of reward_credit_value from any OTHER targets that feeds_into it, for whichever
// of THOSE targets' tiers have been achieved (checked against THEIR OWN effective
// value, so multi-hop chains cascade correctly: A feeds B feeds C). Cycles (A<->B,
// or a target accidentally feeding into itself indirectly) are broken defensively by
// falling back to the raw value for whichever node closes the loop.
export function resolveCustomTargetValues(
  targets: CustomTargetRow[],
  activities: any[],
  policies: any[],
  linesDict: any[]
): Map<string, ResolvedCustomTargetValue> {
  const rawById = new Map<string, number>(
    targets.map((t) => [t.id, computeRawMetricValue(t, activities, policies, linesDict)])
  );
  const feedersOf = (targetId: string) => targets.filter((t) => t.feeds_into_target_id === targetId);

  const cache = new Map<string, ResolvedCustomTargetValue>();
  const visiting = new Set<string>();

  function resolve(id: string): ResolvedCustomTargetValue {
    const cached = cache.get(id);
    if (cached) return cached;

    const raw = rawById.get(id) ?? 0;
    if (visiting.has(id)) {
      // Cycle detected - break it here so we never recurse forever.
      return { raw, effective: raw, earnedCredits: 0, tiersAchieved: [] };
    }
    visiting.add(id);

    let earnedCredits = 0;
    for (const feeder of feedersOf(id)) {
      const feederResolved = resolve(feeder.id);
      const tiers = Array.isArray(feeder.tiers) ? feeder.tiers : [];
      for (const tier of tiers) {
        if (feederResolved.effective >= Number(tier.threshold_metric)) {
          earnedCredits += Number(tier.reward_credit_value) || 0;
        }
      }
    }

    visiting.delete(id);
    const effective = raw + earnedCredits;
    const target = targets.find((t) => t.id === id);
    const ownTiers = Array.isArray(target?.tiers) ? (target!.tiers as CustomTargetTier[]) : [];
    const tiersAchieved = ownTiers.filter((tier) => raw >= Number(tier.threshold_metric));
    const result = { raw, effective, earnedCredits, tiersAchieved };
    cache.set(id, result);
    return result;
  }

  const out = new Map<string, ResolvedCustomTargetValue>();
  for (const t of targets) out.set(t.id, resolve(t.id));
  return out;
}

export type EnrichedCustomTarget = CustomTargetRow & {
  current: number;
  raw: number;
  earnedCredits: number;
  tiersAchieved: CustomTargetTier[];
  pct: number;
  officeName: string;
  metricLabel: string;
  periodLabel: string;
  isCurrency: boolean;
  feedsIntoName?: string | null;
};

export function enrichCustomTargets(
  targets: CustomTargetRow[],
  activities: any[],
  policies: any[],
  linesDict: any[],
  offices: { id: string; name: string }[]
): EnrichedCustomTarget[] {
  const resolved = resolveCustomTargetValues(targets, activities, policies, linesDict);
  return (targets || [])
    .filter((t) => t.active !== false)
    .map((t) => {
      const def = getMetricDef(t.metric_type);
      const { raw, effective, earnedCredits, tiersAchieved } = resolved.get(t.id) || { raw: 0, effective: 0, earnedCredits: 0, tiersAchieved: [] };
      const goal = Number(t.target_value) || 0;
      const pct = goal > 0 ? Math.min(100, (effective / goal) * 100) : 0;
      const officeName = t.office_id ? offices.find((o) => o.id === t.office_id)?.name || "Unknown Office" : "All Locations";
      const periodLabel = t.period === "custom"
        ? `${t.start_date ? new Date(t.start_date).toLocaleDateString() : "?"} - ${t.end_date ? new Date(t.end_date).toLocaleDateString() : "?"}`
        : CUSTOM_TARGET_PERIODS.find((p) => p.value === t.period)?.label || t.period;
      const feedsIntoName = t.feeds_into_target_id ? targets.find((x) => x.id === t.feeds_into_target_id)?.name || null : null;
      return {
        ...t,
        current: effective,
        raw,
        earnedCredits,
        tiersAchieved,
        pct,
        officeName,
        metricLabel: def?.label || t.metric_type,
        periodLabel,
        isCurrency: def?.aggregate === "premium_sum",
        feedsIntoName,
      };
    })
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
}
