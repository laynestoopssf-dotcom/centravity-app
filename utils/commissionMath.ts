// Single source of truth for producer commission math. Previously this logic was copy/pasted
// three times (the active-producer `commissionData` useMemo, the `teamCommissions` per-member
// loop, and the leaderboard's `resolveAcceleratedRates` What-If engine) inside app/dashboard/page.tsx,
// and each copy had subtly drifted from the others. Consolidated here so every consumer applies the
// exact same four agency rules identically:
//
//   1. Retroactive Tiers  - a resolved rate always multiplies the FULL eligible premium bucket for
//      the month, never just the marginal premium above a threshold. There is no marginal-splitting
//      code anywhere below, so crossing a tier is inherently retroactive by construction.
//   2. Stacking Multipliers - every accelerator whose threshold is met contributes its bump/bonus
//      additively. Two separate qualifying accelerators targeting the same rate line (or the same
//      flat-bonus metric) SUM, they never just take the larger of the two.
//   3. Exclude Renewals - any policy row flagged `is_renewal` is invisible to this entire engine:
//      it cannot earn a payout, and it cannot count toward any unlock threshold or accelerator
//      metric either. Commission (and everything that gates it) is New Business only.
//   4. Health = Financial Services - the "life_premium" / "life_health_apps" accelerator metrics
//      represent the Financial Services bucket, which is Life + Health combined. Health premium and
//      Health apps always count toward those thresholds, not just Life.

import { resolveParentLine, resolveLifeSubType } from "./productLines";

export type CommissionLineName = "Auto" | "Fire" | "Commercial" | "Life" | "Health";
export const COMMISSION_LINES: CommissionLineName[] = ["Auto", "Fire", "Commercial", "Life", "Health"];

// Granular Life Commissions: "Life" (above) stays the umbrella bucket everything else in the app
// (Scoreboard, roster, Pipeline, Weekly Rank, Agency Overview, What-If) keeps reading - see the
// note on resolveLifeSubType in utils/productLines.ts. These two extra buckets exist ONLY so the
// real payout math below (sumLineTotals/calculateCommission) can apply Term Life's and Whole
// Life's own distinct rates instead of one blended "Life" rate. `Life` on CommissionLineTotals
// remains the sum of TermLife + WholeLife for every existing consumer that only ever cared about
// the combined figure (e.g. CommissionTab's per-line premium summary cards).
export type LifeCommissionSubLineName = "TermLife" | "WholeLife";

export interface CommissionPolicyRow {
  id?: string;
  user_id: string;
  status?: string | null;
  premium_amount?: number | string | null;
  product_line?: string | null;
  /** New Business vs Renewal - see Rule 3 above. Missing/false = New Business (commission-eligible). */
  is_renewal?: boolean | null;
}

export interface AcceleratorRule {
  metric?: string;
  threshold?: number | string;
  reward_type?: "rate_bump" | "flat_bonus" | string;
  // "life_base" is kept (never removed) for backward compatibility with every comp plan saved
  // before the Term/Whole Life split existed - resolveAccelerators below still applies it to BOTH
  // term_life_base and whole_life_base. "term_life_base"/"whole_life_base" are the new, more
  // specific targets a plan can use going forward to bump just one Life sub-line.
  target_line?: "pnc_base" | "auto_base" | "fire_base" | "life_base" | "term_life_base" | "whole_life_base" | "health_base" | string;
  bump_percent?: number | string;
  bonus_amount?: number | string;
}

export type FlatBonusRule = Record<string, unknown>;

// base_rates keys (Granular Life Commissions): "life_nb" is the legacy flat Life rate, still read
// as the fallback for `term_life_nb`/`whole_life_nb` whenever either is missing - see resolveRates
// below. A plan created/edited before this split shipped keeps paying exactly what it always paid,
// uniformly, on every Life policy until an admin explicitly sets one of the two new fields.
//
// base_rates.term_life_rate_type / whole_life_rate_type (Flat-$-per-App Life Commissions):
// 'percent' (default) means `term_life_nb`/`whole_life_nb` above is a % of premium, calculated
// exactly as every other line always has been. 'flat' means that same numeric field instead reads
// as a flat dollar amount paid per policy, completely ignoring premium - see sumLineTotals below.
// Missing/unrecognized values always resolve to 'percent' (see resolveRates' normalizeRateType),
// so a plan saved before this feature existed keeps its exact original percent-of-premium math.
export interface CompPlanRules {
  base_rates?: Record<string, unknown>;
  baseRates?: Record<string, unknown>;
  thresholds?: Record<string, unknown>;
  accelerators?: AcceleratorRule[];
  custom_bonuses?: FlatBonusRule[];
  flat_bonuses?: FlatBonusRule[];
  flatBonuses?: FlatBonusRule[];
}

export interface RateBumps {
  pnc_base: number;
  auto_base: number;
  fire_base: number;
  life_base: number;
  term_life_base: number;
  whole_life_base: number;
  health_base: number;
}

// "Life" remains the sum of TermLife + WholeLife (backward compat - see the header note on
// LifeCommissionSubLineName above). TermLife/WholeLife are the new sub-buckets the real payout
// math (sumLineTotals) actually multiplies rates against.
export type CommissionLineTotals = Record<CommissionLineName | LifeCommissionSubLineName, number>;

export const emptyCommissionLineTotals = (): CommissionLineTotals => ({ Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0, TermLife: 0, WholeLife: 0 });
const emptyLineTotals = emptyCommissionLineTotals;
const emptyBumps = (): RateBumps => ({ pnc_base: 0, auto_base: 0, fire_base: 0, life_base: 0, term_life_base: 0, whole_life_base: 0, health_base: 0 });

export interface AggregatedCommissionMetrics {
  monthPotentialPremium: number;
  monthTotalApps: number;
  /** Financial Services (Life + Health) issued apps - Rule 4. */
  monthLifeHealthApps: number;
  /** Financial Services (Life + Health) issued premium - Rule 4. */
  financialServicesPremium: number;
  /** Auto + Fire + Commercial, bound-or-issued (unchanged P&C bucket definition). */
  pncPremium: number;
  issuedPremLOB: CommissionLineTotals;
  pipelinePremLOB: CommissionLineTotals;
  // Flat-$-per-App Life Commissions: app COUNTS per line, mirroring issuedPremLOB/pipelinePremLOB's
  // $ premium buckets one-for-one. Only ever read by sumLineTotals below for a Life sub-line whose
  // plan has opted into `rate_type: 'flat'` (see ResolvedRates.termLifeRateType/wholeLifeRateType) -
  // every percent-based line keeps using the premium buckets exactly as before.
  issuedAppsLOB: CommissionLineTotals;
  pipelineAppsLOB: CommissionLineTotals;
}

/**
 * Buckets a raw set of policy rows (already scoped to the target month) into every figure the
 * commission engine needs for one producer. Renewal-flagged and Complex Resolution rows never
 * contribute anything here (Rule 3).
 */
export function aggregateCommissionMetrics(
  policies: CommissionPolicyRow[] | null | undefined,
  userId: string,
  getParentLine: (line: string) => string
): AggregatedCommissionMetrics {
  const metrics: AggregatedCommissionMetrics = {
    monthPotentialPremium: 0,
    monthTotalApps: 0,
    monthLifeHealthApps: 0,
    financialServicesPremium: 0,
    pncPremium: 0,
    issuedPremLOB: emptyLineTotals(),
    pipelinePremLOB: emptyLineTotals(),
    issuedAppsLOB: emptyLineTotals(),
    pipelineAppsLOB: emptyLineTotals(),
  };

  (policies || []).forEach((pol) => {
    if (pol.user_id !== userId) return;
    if (pol.product_line === "Complex Resolution") return;
    if (pol.is_renewal) return; // Rule 3: Exclude Renewals - never counted, never paid.

    const status = pol.status;
    const isBoundOrIssued = status === "bound" || status === "issued";
    if (!isBoundOrIssued) return;

    const premium = Number(pol.premium_amount) || 0;
    const parentLine = getParentLine(pol.product_line || "");

    metrics.monthPotentialPremium += premium;
    metrics.monthTotalApps++;

    if (parentLine === "Auto" || parentLine === "Fire" || parentLine === "Commercial") {
      metrics.pncPremium += premium;
    }

    // Issued-only: a bound-but-not-yet-issued Life/Health app hasn't actually been placed on the
    // books yet, so it can't unlock a Financial Services bump or count toward its threshold.
    if ((parentLine === "Life" || parentLine === "Health") && status === "issued") {
      metrics.monthLifeHealthApps++;
      metrics.financialServicesPremium += premium; // Rule 4: Health = Financial Services.
    }

    if ((COMMISSION_LINES as string[]).includes(parentLine)) {
      const line = parentLine as CommissionLineName;
      if (status === "issued") { metrics.issuedPremLOB[line] += premium; metrics.issuedAppsLOB[line] += 1; }
      else if (status === "bound") { metrics.pipelinePremLOB[line] += premium; metrics.pipelineAppsLOB[line] += 1; }

      // Granular Life Commissions: also split the "Life" bucket into its Term/Whole sub-lines so
      // sumLineTotals (the real payout math) can apply each its own rate. `Life` above keeps the
      // combined total for anything that only ever cared about the umbrella figure. App COUNTS
      // (not just premium $) are tracked per sub-line too, for plans that pay a flat $ amount per
      // policy instead of a percentage of premium.
      if (line === "Life") {
        const subLine: LifeCommissionSubLineName = resolveLifeSubType(pol.product_line || "") === "whole" ? "WholeLife" : "TermLife";
        if (status === "issued") { metrics.issuedPremLOB[subLine] += premium; metrics.issuedAppsLOB[subLine] += 1; }
        else if (status === "bound") { metrics.pipelinePremLOB[subLine] += premium; metrics.pipelineAppsLOB[subLine] += 1; }
      }
    }
  });

  return metrics;
}

export interface ResolvedAccelerators {
  bumps: RateBumps;
  flatBonusTotal: number;
  /** metric -> summed qualifying flat bonus $, kept for the existing per-metric breakdown UI. */
  acceleratorBreakdown: Record<string, number>;
}

/** Reads a comp plan's accelerator metric value off a producer's aggregated metrics for this month. */
export function resolveAcceleratorMetricValue(metric: string | undefined, metrics: AggregatedCommissionMetrics): number {
  switch (metric) {
    case "life_health_apps":
      return metrics.monthLifeHealthApps;
    case "life_premium": // Historical key name; represents the Financial Services bucket (Rule 4).
      return metrics.financialServicesPremium;
    case "pnc_premium":
      return metrics.pncPremium;
    case "total_premium":
      return metrics.monthPotentialPremium;
    case "total_apps":
      return metrics.monthTotalApps;
    default:
      return 0;
  }
}

/**
 * Resolves every accelerator against a producer's metrics. Rule 2 (Stacking Multipliers): every
 * accelerator whose threshold is met is summed into its target, never max()'d against the others.
 */
export function resolveAccelerators(
  accelerators: AcceleratorRule[] | null | undefined,
  metrics: AggregatedCommissionMetrics
): ResolvedAccelerators {
  const bumps = emptyBumps();
  const acceleratorBreakdown: Record<string, number> = {};

  (accelerators || []).forEach((acc) => {
    const metricVal = resolveAcceleratorMetricValue(acc.metric, metrics);
    const thresholdAmt = Number(acc.threshold || 0);
    if (metricVal < thresholdAmt) return;

    if (acc.reward_type === "flat_bonus") {
      const bonusAmt = Number(acc.bonus_amount || 0);
      const key = acc.metric || "unknown";
      acceleratorBreakdown[key] = (acceleratorBreakdown[key] || 0) + bonusAmt;
    } else {
      const bumpAmt = Number(acc.bump_percent || 0);
      const targetKey = acc.target_line as keyof RateBumps;
      if (targetKey && targetKey in bumps) {
        bumps[targetKey] += bumpAmt;
      }
    }
  });

  const flatBonusTotal = Object.values(acceleratorBreakdown).reduce((sum, v) => sum + v, 0);
  return { bumps, flatBonusTotal, acceleratorBreakdown };
}

/** 'percent' (of premium) is the original, still-default behavior for every line. 'flat' only
 * ever applies to the two Life sub-lines - see the base_rates.term_life_rate_type doc above. */
export type LifeRateType = "percent" | "flat";

/** Unrecognized/missing input (undefined, null, a legacy plan that predates this field, a typo)
 * always falls back to 'percent' - this is the ONLY place that decides the default, so every
 * caller (resolveRates below, plus any future one) automatically inherits the same safe fallback. */
const normalizeLifeRateType = (value: unknown): LifeRateType => (value === "flat" ? "flat" : "percent");

export interface ResolvedRates {
  auto: number;
  fire: number;
  comm: number;
  /** Backward-compat blended figure - simple average of termLife/wholeLife below. Real payout
   * math (sumLineTotals) never reads this; it's for consumers that only render one "Life" rate
   * (e.g. the What-If projection engine in app/dashboard/page.tsx, which blends at the parent-
   * category level and isn't sub-type aware). NOTE: if either sub-line is set to 'flat', this
   * blended figure mixes a $ amount with a % rate and is not meaningful for that plan - the What-If
   * estimator is a projection tool, not the real paycheck, and hasn't been made rate-type-aware. */
  life: number;
  termLife: number;
  wholeLife: number;
  /** Which basis termLife/wholeLife above should be read as - see sumLineTotals below. */
  termLifeRateType: LifeRateType;
  wholeLifeRateType: LifeRateType;
  health: number;
}

/** Applies stacked bumps on top of a plan's base rates. Rule 1: this rate then multiplies the
 * ENTIRE eligible premium bucket (see calculateCommission below), so it's retroactive by construction.
 *
 * Granular Life Commissions: `term_life_nb`/`whole_life_nb` are the new distinct base rates; each
 * falls back to the legacy flat `life_nb` whenever it hasn't been explicitly set, so an existing
 * comp plan keeps paying exactly what it always paid on every Life policy until an admin opts into
 * the split. Likewise, the legacy `life_base` bump target (still resolved generically by
 * resolveAccelerators above) stacks onto BOTH sub-lines, while the new `term_life_base`/
 * `whole_life_base` targets only ever bump their own one.
 *
 * Flat-$-per-App Life Commissions: `term_life_nb`/`whole_life_nb` (and any bumps stacked onto
 * them) are just numbers - whether they mean "% of premium" or "flat $ per policy" is decided
 * entirely by `termLifeRateType`/`wholeLifeRateType` below, per `base_rates.term_life_rate_type` /
 * `whole_life_rate_type`. A rate_bump accelerator targeting `term_life_base`/`whole_life_base`
 * still just adds its `bump_percent` value onto this same number either way - on a 'flat' line
 * that reads as "+$X per policy", not a percentage-point bump, since it's the same underlying
 * dollar-or-percent field being bumped. */
export function resolveRates(baseRates: Record<string, unknown> | null | undefined, bumps: RateBumps): ResolvedRates {
  const base = baseRates || {};
  const legacyLife = Number(base.life_nb || 0);
  const termLifeBase = base.term_life_nb !== undefined && base.term_life_nb !== null && base.term_life_nb !== "" ? Number(base.term_life_nb) : legacyLife;
  const wholeLifeBase = base.whole_life_nb !== undefined && base.whole_life_nb !== null && base.whole_life_nb !== "" ? Number(base.whole_life_nb) : legacyLife;
  const termLife = termLifeBase + bumps.life_base + bumps.term_life_base;
  const wholeLife = wholeLifeBase + bumps.life_base + bumps.whole_life_base;
  return {
    auto: Number(base.auto_nb || 0) + bumps.pnc_base + bumps.auto_base,
    fire: Number(base.fire_nb || 0) + bumps.pnc_base + bumps.fire_base,
    comm: Number(base.commercial_nb || 0) + bumps.pnc_base,
    life: (termLife + wholeLife) / 2,
    termLife,
    wholeLife,
    termLifeRateType: normalizeLifeRateType(base.term_life_rate_type),
    wholeLifeRateType: normalizeLifeRateType(base.whole_life_rate_type),
    health: Number(base.health_nb || 0) + bumps.health_base,
  };
}

/**
 * `premTotals`/`appTotals` are the SAME shape (one $ premium bucket, one app-count bucket) per
 * line - see AggregatedCommissionMetrics.issuedPremLOB/issuedAppsLOB above. Every line except the
 * two Life sub-lines is unconditionally percent-of-premium; TermLife/WholeLife each independently
 * check their own resolved rate type and switch to `appTotals * flatRate` (Rule: "policy_count *
 * flat_rate, ignoring premium") instead of `premTotals * (rate / 100)` when it's 'flat'. */
const sumLineTotals = (premTotals: CommissionLineTotals, appTotals: CommissionLineTotals, rates: ResolvedRates): number => {
  const termLifeAmount = rates.termLifeRateType === "flat"
    ? appTotals.TermLife * rates.termLife
    : premTotals.TermLife * (rates.termLife / 100);
  const wholeLifeAmount = rates.wholeLifeRateType === "flat"
    ? appTotals.WholeLife * rates.wholeLife
    : premTotals.WholeLife * (rates.wholeLife / 100);

  return premTotals.Auto * (rates.auto / 100) +
    premTotals.Fire * (rates.fire / 100) +
    premTotals.Commercial * (rates.comm / 100) +
    termLifeAmount +
    wholeLifeAmount +
    premTotals.Health * (rates.health / 100);
};

export interface CommissionResult {
  total: number;
  issuedComm: number;
  pipelineComm: number;
  bonusTotal: number;
  isLocked: boolean;
  thresholds: Record<string, unknown>;
  rates: ResolvedRates;
  activeBumps: RateBumps;
  appliedBumps: RateBumps;
  flatBonuses: { name: string; amount: number }[];
  acceleratorBreakdown: Record<string, number>;
  issuedPremLOB: CommissionLineTotals;
  pipelinePremLOB: CommissionLineTotals;
  /** App counts per line - only meaningful for Term/Whole Life lines on a 'flat' plan; see
   * sumLineTotals. Exposed here so display consumers (CommissionTab's breakdown cards) can
   * recompute the same flat-$ payout shown in the totals above without re-deriving it. */
  issuedAppsLOB: CommissionLineTotals;
  pipelineAppsLOB: CommissionLineTotals;
  metrics: AggregatedCommissionMetrics;
}

export interface CalculateCommissionParams {
  /** Raw policy rows, already scoped to the target month (any/all producers - filtered by userId below). */
  policies: CommissionPolicyRow[] | null | undefined;
  userId: string;
  rules: CompPlanRules | null | undefined;
  manualBonusTotal: number;
  getParentLine: (line: string) => string;
}

/** The full commission engine for one producer for one month, applying all four agency rules. */
export function calculateCommission({
  policies,
  userId,
  rules,
  manualBonusTotal,
  getParentLine,
}: CalculateCommissionParams): CommissionResult {
  const safeRules = rules || {};
  const baseRates = safeRules.base_rates || safeRules.baseRates || {};
  const thresholds = safeRules.thresholds || {};
  const accelerators = safeRules.accelerators || [];
  const rawFlatBonuses = safeRules.custom_bonuses || safeRules.flat_bonuses || safeRules.flatBonuses || [];
  const flatBonuses = rawFlatBonuses.map((b) => ({
    name: (b.name || b.title || b.bonusName || b.description || "Unnamed Bonus") as string,
    amount: Number(b.amount || b.value || b.payout || b.bonus || 0),
  }));

  const metrics = aggregateCommissionMetrics(policies, userId, getParentLine);

  const isLocked =
    metrics.monthPotentialPremium < Number(thresholds.required_premium_to_unlock || 0) ||
    metrics.monthTotalApps < Number(thresholds.required_apps_to_unlock || 0) ||
    metrics.monthLifeHealthApps < Number(thresholds.required_life_health_apps_to_unlock || 0);

  const { bumps, flatBonusTotal, acceleratorBreakdown } = resolveAccelerators(accelerators, metrics);
  const rates = resolveRates(baseRates, bumps);

  const issuedComm = isLocked ? 0 : sumLineTotals(metrics.issuedPremLOB, metrics.issuedAppsLOB, rates);
  const pipelineComm = isLocked ? 0 : sumLineTotals(metrics.pipelinePremLOB, metrics.pipelineAppsLOB, rates);
  const earnedRuleBonuses = isLocked ? 0 : flatBonusTotal;

  return {
    total: issuedComm + pipelineComm + manualBonusTotal + earnedRuleBonuses,
    issuedComm,
    pipelineComm,
    bonusTotal: manualBonusTotal + earnedRuleBonuses,
    isLocked,
    thresholds,
    rates,
    activeBumps: bumps,
    appliedBumps: bumps,
    flatBonuses,
    acceleratorBreakdown,
    issuedPremLOB: metrics.issuedPremLOB,
    pipelinePremLOB: metrics.pipelinePremLOB,
    issuedAppsLOB: metrics.issuedAppsLOB,
    pipelineAppsLOB: metrics.pipelineAppsLOB,
    metrics,
  };
}

/** Convenience wrapper matching the shape most call sites already have (agency's custom_product_lines dict). */
export function makeParentLineResolver(customProductLines: Record<string, unknown>[] | null | undefined) {
  return (line: string) => resolveParentLine(line, customProductLines || []);
}
