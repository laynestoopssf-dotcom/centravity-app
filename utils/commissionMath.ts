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

import { resolveParentLine } from "./productLines";

export type CommissionLineName = "Auto" | "Fire" | "Commercial" | "Life" | "Health";
export const COMMISSION_LINES: CommissionLineName[] = ["Auto", "Fire", "Commercial", "Life", "Health"];

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
  target_line?: "pnc_base" | "auto_base" | "fire_base" | "life_base" | "health_base" | string;
  bump_percent?: number | string;
  bonus_amount?: number | string;
}

export type FlatBonusRule = Record<string, unknown>;

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
  health_base: number;
}

export type CommissionLineTotals = Record<CommissionLineName, number>;

export const emptyCommissionLineTotals = (): CommissionLineTotals => ({ Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 });
const emptyLineTotals = emptyCommissionLineTotals;
const emptyBumps = (): RateBumps => ({ pnc_base: 0, auto_base: 0, fire_base: 0, life_base: 0, health_base: 0 });

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
      if (status === "issued") metrics.issuedPremLOB[line] += premium;
      else if (status === "bound") metrics.pipelinePremLOB[line] += premium;
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

export interface ResolvedRates {
  auto: number;
  fire: number;
  comm: number;
  life: number;
  health: number;
}

/** Applies stacked bumps on top of a plan's base rates. Rule 1: this rate then multiplies the
 * ENTIRE eligible premium bucket (see calculateCommission below), so it's retroactive by construction. */
export function resolveRates(baseRates: Record<string, unknown> | null | undefined, bumps: RateBumps): ResolvedRates {
  const base = baseRates || {};
  return {
    auto: Number(base.auto_nb || 0) + bumps.pnc_base + bumps.auto_base,
    fire: Number(base.fire_nb || 0) + bumps.pnc_base + bumps.fire_base,
    comm: Number(base.commercial_nb || 0) + bumps.pnc_base,
    life: Number(base.life_nb || 0) + bumps.life_base,
    health: Number(base.health_nb || 0) + bumps.health_base,
  };
}

const sumLineTotals = (totals: CommissionLineTotals, rates: ResolvedRates): number =>
  totals.Auto * (rates.auto / 100) +
  totals.Fire * (rates.fire / 100) +
  totals.Commercial * (rates.comm / 100) +
  totals.Life * (rates.life / 100) +
  totals.Health * (rates.health / 100);

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

  const issuedComm = isLocked ? 0 : sumLineTotals(metrics.issuedPremLOB, rates);
  const pipelineComm = isLocked ? 0 : sumLineTotals(metrics.pipelinePremLOB, rates);
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
    metrics,
  };
}

/** Convenience wrapper matching the shape most call sites already have (agency's custom_product_lines dict). */
export function makeParentLineResolver(customProductLines: Record<string, unknown>[] | null | undefined) {
  return (line: string) => resolveParentLine(line, customProductLines || []);
}
