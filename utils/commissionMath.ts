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

import { resolveParentLine, resolveLifeSubType, resolveHealthSubType } from "./productLines";

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
export type HealthCommissionSubLineName = "HealthBase" | "HealthMedicare";

export interface CommissionPolicyRow {
  id?: string;
  user_id: string;
  status?: string | null;
  premium_amount?: number | string | null;
  product_line?: string | null;
  /** New Business vs Renewal - see Rule 3 above. Missing/false = New Business (commission-eligible). */
  is_renewal?: boolean | null;
  /**
   * issued_date: stamped when status flips to 'issued', cleared when it flips back. The ONLY date
   * commission eligibility looks at - see isCommissionEligible. (bound_at / logged_at are
   * production dates and deliberately play no part in commission.)
   */
  issued_at?: string | null;
}

/**
 * COMMISSION ELIGIBILITY - the one rule that decides whether a policy can appear on (and pay out
 * on) a month's commission statement: its status must be 'issued' AND its issued_at must fall in
 * `targetMonth` (local calendar month). bound_at / written_at / logged_at are never consulted -
 * those are PRODUCTION dates (when the work happened, which is what the Scoreboard, Weekly Rank and
 * pacing credit). A policy bound in August but issued in September is September commission and
 * August production. Bound-but-not-issued policies, and issued rows missing an issued_at, are
 * never eligible.
 */
export function isCommissionEligible(
  pol: Pick<CommissionPolicyRow, "status" | "issued_at">,
  targetMonth: Date
): boolean {
  if (pol.status !== "issued" || !pol.issued_at) return false;
  const issued = new Date(pol.issued_at);
  if (Number.isNaN(issued.getTime())) return false;
  return issued.getFullYear() === targetMonth.getFullYear() && issued.getMonth() === targetMonth.getMonth();
}

export function filterCommissionEligiblePolicies<T extends CommissionPolicyRow>(
  policies: T[] | null | undefined,
  targetMonth: Date
): T[] {
  return (policies || []).filter((p) => isCommissionEligible(p, targetMonth));
}

export interface AcceleratorRule {
  metric?: string;
  threshold?: number | string;
  reward_type?: "rate_bump" | "flat_bonus" | string;
  // "life_base" is kept (never removed) for backward compatibility with every comp plan saved
  // before the Term/Whole Life split existed - resolveAccelerators below still applies it to BOTH
  // term_life_base and whole_life_base. "term_life_base"/"whole_life_base" are the new, more
  // specific targets a plan can use going forward to bump just one Life sub-line.
  target_line?: "pnc_base" | "auto_base" | "fire_base" | "life_base" | "term_life_base" | "whole_life_base" | "health_base" | "health_medicare_base" | string;
  bump_percent?: number | string;
  bonus_amount?: number | string;
}

export type FlatBonusRule = Record<string, unknown>;

// base_rates keys (Granular Life Commissions): "life_nb" is the legacy flat Life rate, still read
// as the fallback for `term_life_nb`/`whole_life_nb` whenever either is missing - see resolveRates
// below. A plan created/edited before this split shipped keeps paying exactly what it always paid,
// uniformly, on every Life policy until an admin explicitly sets one of the two new fields.
//
// base_rates.term_life_rate_type / whole_life_rate_type / health_base_rate_type /
// health_medicare_rate_type (Flat-$-per-App):
// 'percent' (default) means that line's numeric rate is a % of premium. 'flat' means the same
// number is a flat dollar amount paid per policy, ignoring premium - see sumLineTotals.
// Missing/unrecognized values always resolve to 'percent' (normalizeRateType), so a plan saved
// before this feature existed keeps its original percent-of-premium math.
//
// Granular Health Commissions: `health_nb` is the existing Health (Base) rate (kept under its
// original key so every saved plan keeps paying what it always paid). `health_medicare_rate` is
// the new Medicare Supplemental rate; when missing it falls back to `health_nb`, same as Whole
// Life falling back to `life_nb`.
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
  health_medicare_base: number;
}

// "Life" remains the sum of TermLife + WholeLife (backward compat - see the header note on
// LifeCommissionSubLineName above). TermLife/WholeLife are the new sub-buckets the real payout
// math (sumLineTotals) actually multiplies rates against.
export type CommissionLineTotals = Record<CommissionLineName | LifeCommissionSubLineName | HealthCommissionSubLineName, number>;

export const emptyCommissionLineTotals = (): CommissionLineTotals => ({ Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0, TermLife: 0, WholeLife: 0, HealthBase: 0, HealthMedicare: 0 });
const emptyLineTotals = emptyCommissionLineTotals;
const emptyBumps = (): RateBumps => ({ pnc_base: 0, auto_base: 0, fire_base: 0, life_base: 0, term_life_base: 0, whole_life_base: 0, health_base: 0, health_medicare_base: 0 });

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

      if (line === "Health") {
        const subLine: HealthCommissionSubLineName = resolveHealthSubType(pol.product_line || "") === "medicare" ? "HealthMedicare" : "HealthBase";
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

/** 'percent' (of premium) is the original, still-default behavior for every line. 'flat' applies
 * to Term/Whole Life and Health Base/Medicare independently - see the rate_type docs above. */
export type CommissionRateType = "percent" | "flat";
/** @deprecated Use CommissionRateType. Kept so existing Life-named imports keep compiling. */
export type LifeRateType = CommissionRateType;

/** Unrecognized/missing input (undefined, null, a legacy plan that predates this field, a typo)
 * always falls back to 'percent' - this is the ONLY place that decides the default, so every
 * caller (resolveRates below, plus any future one) automatically inherits the same safe fallback. */
const normalizeRateType = (value: unknown): CommissionRateType => (value === "flat" ? "flat" : "percent");
const normalizeLifeRateType = normalizeRateType;

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
  /** Backward-compat blended figure - simple average of healthBase/healthMedicare below. */
  health: number;
  healthBase: number;
  healthMedicare: number;
  healthBaseRateType: CommissionRateType;
  healthMedicareRateType: CommissionRateType;
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
 * Flat-$-per-App: each Life/Health sub-line's numeric rate is just a number - whether it means
 * "% of premium" or "flat $ per policy" is decided by that line's own rate_type field. Missing
 * types always normalize to 'percent'. A rate_bump accelerator targeting health_base still stacks
 * onto BOTH Health sub-lines (legacy); health_medicare_base only bumps Medicare. */
export function resolveRates(baseRates: Record<string, unknown> | null | undefined, bumps: RateBumps): ResolvedRates {
  const base = baseRates || {};
  const legacyLife = Number(base.life_nb || 0);
  const termLifeBase = base.term_life_nb !== undefined && base.term_life_nb !== null && base.term_life_nb !== "" ? Number(base.term_life_nb) : legacyLife;
  const wholeLifeBase = base.whole_life_nb !== undefined && base.whole_life_nb !== null && base.whole_life_nb !== "" ? Number(base.whole_life_nb) : legacyLife;
  const termLife = termLifeBase + bumps.life_base + bumps.term_life_base;
  const wholeLife = wholeLifeBase + bumps.life_base + bumps.whole_life_base;
  const legacyHealth = Number(base.health_nb || 0);
  const healthMedicareRaw = base.health_medicare_rate !== undefined && base.health_medicare_rate !== null && base.health_medicare_rate !== "" ? Number(base.health_medicare_rate) : legacyHealth;
  const healthBase = legacyHealth + bumps.health_base;
  const healthMedicare = healthMedicareRaw + bumps.health_base + bumps.health_medicare_base;
  return {
    auto: Number(base.auto_nb || 0) + bumps.pnc_base + bumps.auto_base,
    fire: Number(base.fire_nb || 0) + bumps.pnc_base + bumps.fire_base,
    comm: Number(base.commercial_nb || 0) + bumps.pnc_base,
    life: (termLife + wholeLife) / 2,
    termLife,
    wholeLife,
    termLifeRateType: normalizeLifeRateType(base.term_life_rate_type),
    wholeLifeRateType: normalizeLifeRateType(base.whole_life_rate_type),
    health: (healthBase + healthMedicare) / 2,
    healthBase,
    healthMedicare,
    healthBaseRateType: normalizeRateType(base.health_base_rate_type),
    healthMedicareRateType: normalizeRateType(base.health_medicare_rate_type),
  };
}

/**
 * `premTotals`/`appTotals` are the SAME shape (one $ premium bucket, one app-count bucket) per
 * line. P&C is always percent-of-premium. TermLife/WholeLife and HealthBase/HealthMedicare each
 * independently check their own rate type and switch to `appTotals * flatRate` when it's 'flat'.
 * Umbrella Life/Health totals are never multiplied here — only the sub-line buckets. */
const sumLineTotals = (premTotals: CommissionLineTotals, appTotals: CommissionLineTotals, rates: ResolvedRates): number => {
  const amountFor = (prem: number, apps: number, rate: number, rateType: CommissionRateType) =>
    rateType === "flat" ? apps * rate : prem * (rate / 100);

  return premTotals.Auto * (rates.auto / 100) +
    premTotals.Fire * (rates.fire / 100) +
    premTotals.Commercial * (rates.comm / 100) +
    amountFor(premTotals.TermLife, appTotals.TermLife, rates.termLife, rates.termLifeRateType) +
    amountFor(premTotals.WholeLife, appTotals.WholeLife, rates.wholeLife, rates.wholeLifeRateType) +
    amountFor(premTotals.HealthBase, appTotals.HealthBase, rates.healthBase, rates.healthBaseRateType) +
    amountFor(premTotals.HealthMedicare, appTotals.HealthMedicare, rates.healthMedicare, rates.healthMedicareRateType);
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
  /** App counts per line - used for Term/Whole Life and Health Base/Medicare on a 'flat' plan. */
  issuedAppsLOB: CommissionLineTotals;
  pipelineAppsLOB: CommissionLineTotals;
  metrics: AggregatedCommissionMetrics;
}

export interface CalculateCommissionParams {
  /**
   * Candidate policy rows (any/all producers - filtered by userId below). NOT assumed to be
   * pre-filtered: calculateCommission itself applies isCommissionEligible against `commissionMonth`,
   * so the engine can never pay on a policy that isn't issued in the statement month no matter what
   * the caller hands it.
   */
  policies: CommissionPolicyRow[] | null | undefined;
  /** The statement month being calculated (any Date inside it). */
  commissionMonth: Date;
  userId: string;
  rules: CompPlanRules | null | undefined;
  manualBonusTotal: number;
  getParentLine: (line: string) => string;
}

/** The full commission engine for one producer for one month, applying all four agency rules. */
export function calculateCommission({
  policies,
  commissionMonth,
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

  const metrics = aggregateCommissionMetrics(filterCommissionEligiblePolicies(policies, commissionMonth), userId, getParentLine);

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
