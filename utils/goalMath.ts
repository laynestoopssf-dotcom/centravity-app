// Reverse ("backward") goal math for Team Management.
//
// The agency owner types ONE number per producer - the Monthly App Target - and every other
// activity goal is derived from it, working backward through the sales funnel:
//
//   Monthly App Target
//     -> Weekly Apps    = Monthly / 4
//     -> Weekly Quotes  = Weekly Apps  / (Quote -> App ratio)
//     -> Weekly Calls   = Weekly Quotes / (Call -> Quote ratio)
//     -> Daily X        = Weekly X / (Global Weekly Production Days)
//
// "Calls" here is the app's Touches metric (outbound calls + texts, activity_type 'touchpoint') -
// that is the number every dashboard/pacing surface calls "touches" and the one the
// `*_target_touchpoints` profile columns are measured against.
//
// MISSING / ZERO CONVERSION DATA never reaches a division. Every ratio goes through a resolver that
// walks a fallback chain and always returns a finite value in [MIN_RATIO, 1]:
//
//   Quote -> App :  manual override (profiles.close_rate)
//                -> producer's live YTD (bound / quotes, only once they have >= MIN_QUOTES_FOR_LIVE_RATIO quotes)
//                -> agency global close rate (agencies.global_close_rate)
//                -> BASELINE_QUOTE_TO_APP
//   Call  -> Quote: producer's live YTD (quotes / touches, only once they have >= MIN_TOUCHES_FOR_LIVE_RATIO
//                   touches AND >= MIN_QUOTES_FOR_LIVE_RATIO quotes)
//                -> BASELINE_CALL_TO_QUOTE
//
// The sample-size minimums stop a brand-new hire's 1-quote-from-2-touches (50%) from producing a
// near-zero call goal, and a producer with no bound apps yet (0% live) from dividing by zero.

/** 20% - matches the agency-level global_close_rate default used by the Executive Cockpit. */
export const BASELINE_QUOTE_TO_APP = 0.2;
/** 15% - roughly 1 quote for every ~7 outbound touches. Used until a producer has real history. */
export const BASELINE_CALL_TO_QUOTE = 0.15;
export const MIN_QUOTES_FOR_LIVE_RATIO = 10;
export const MIN_TOUCHES_FOR_LIVE_RATIO = 50;
/** Floor so a pathologically low ratio can't explode a goal into the thousands. */
export const MIN_RATIO = 0.01;
export const DEFAULT_PRODUCTION_DAYS = 5;
export const WEEKS_PER_MONTH = 4;

export type RatioSource = "override" | "live" | "agency" | "baseline";

export interface ResolvedRatio {
  /** Decimal in [MIN_RATIO, 1] (0.25 = 25%). Always safe to divide by. */
  ratio: number;
  source: RatioSource;
}

const isUsablePct = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const clampRatio = (r: number) => Math.min(1, Math.max(MIN_RATIO, r));

export function resolveQuoteToAppRatio(input: {
  /** profiles.close_rate - a percent (e.g. 25), null/''/undefined when not set. */
  manualOverridePct?: number | string | null;
  ytdQuotes?: number | null;
  ytdBound?: number | null;
  /** agencies.global_close_rate - a percent. */
  agencyCloseRatePct?: number | string | null;
}): ResolvedRatio {
  const override = input.manualOverridePct === "" || input.manualOverridePct == null ? NaN : Number(input.manualOverridePct);
  if (isUsablePct(override)) return { ratio: clampRatio(override / 100), source: "override" };

  const quotes = Number(input.ytdQuotes) || 0;
  const bound = Number(input.ytdBound) || 0;
  if (quotes >= MIN_QUOTES_FOR_LIVE_RATIO && bound > 0) {
    return { ratio: clampRatio(bound / quotes), source: "live" };
  }

  const agency = input.agencyCloseRatePct === "" || input.agencyCloseRatePct == null ? NaN : Number(input.agencyCloseRatePct);
  if (isUsablePct(agency)) return { ratio: clampRatio(agency / 100), source: "agency" };

  return { ratio: BASELINE_QUOTE_TO_APP, source: "baseline" };
}

export function resolveCallToQuoteRatio(input: {
  ytdTouches?: number | null;
  ytdQuotes?: number | null;
}): ResolvedRatio {
  const touches = Number(input.ytdTouches) || 0;
  const quotes = Number(input.ytdQuotes) || 0;
  if (touches >= MIN_TOUCHES_FOR_LIVE_RATIO && quotes >= MIN_QUOTES_FOR_LIVE_RATIO) {
    return { ratio: clampRatio(quotes / touches), source: "live" };
  }
  return { ratio: BASELINE_CALL_TO_QUOTE, source: "baseline" };
}

/** Anything that isn't a sane 1-7 day work week falls back to 5. */
export function sanitizeProductionDays(days: unknown): number {
  const n = Number(days);
  return Number.isFinite(n) && n > 0 && n <= 7 ? n : DEFAULT_PRODUCTION_DAYS;
}

export interface ReverseGoals {
  weeklyApps: number;
  weeklyQuotes: number;
  weeklyCalls: number;
  dailyApps: number;
  dailyQuotes: number;
  dailyCalls: number;
}

/**
 * Whole-number goals (the profiles target columns are `integer`). Each figure is computed from the
 * UNROUNDED figure above it and only then rounded UP, so rounding never compounds down the funnel
 * and a goal is never rounded below what the funnel actually requires.
 */
export function calculateReverseGoals(input: {
  monthlyAppTarget: number;
  quoteToApp: number;
  callToQuote: number;
  productionDays: number;
}): ReverseGoals {
  const monthly = Number.isFinite(Number(input.monthlyAppTarget)) ? Math.max(0, Number(input.monthlyAppTarget)) : 0;
  const q2a = clampRatio(Number.isFinite(input.quoteToApp) && input.quoteToApp > 0 ? input.quoteToApp : BASELINE_QUOTE_TO_APP);
  const c2q = clampRatio(Number.isFinite(input.callToQuote) && input.callToQuote > 0 ? input.callToQuote : BASELINE_CALL_TO_QUOTE);
  const days = sanitizeProductionDays(input.productionDays);

  const weeklyApps = monthly / WEEKS_PER_MONTH;
  const weeklyQuotes = weeklyApps / q2a;
  const weeklyCalls = weeklyQuotes / c2q;

  // Math.ceil of a tiny float error (e.g. 5.000000000000001) would bump a clean 5 to 6.
  const up = (n: number) => Math.ceil(Math.round(n * 1e6) / 1e6);

  return {
    weeklyApps: up(weeklyApps),
    weeklyQuotes: up(weeklyQuotes),
    weeklyCalls: up(weeklyCalls),
    dailyApps: up(weeklyApps / days),
    dailyQuotes: up(weeklyQuotes / days),
    dailyCalls: up(weeklyCalls / days),
  };
}

// -----------------------------------------------------------------------------
// Shared producer-goal helpers. Used by BOTH Settings -> Team Management (components/SettingsTab.tsx)
// and the Coaching tab's Adjust Goals modal (components/coaching/AdjustGoalsModal.tsx) so the two
// surfaces can never drift apart: one derivation, one set of persisted columns.
// -----------------------------------------------------------------------------

export interface ProducerConversionStats {
  ytdQuotes?: number | null;
  ytdBound?: number | null;
  ytdTouches?: number | null;
}

export interface DerivedProducerGoals {
  goals: ReverseGoals;
  quoteToApp: ResolvedRatio;
  callToQuote: ResolvedRatio;
}

/** Monthly App Target + the producer's conversion history -> every derived goal, plus the ratios
 * (and where each came from) that produced them. */
export function deriveProducerGoals(input: {
  monthlyAppTarget: number;
  /** profiles.close_rate (percent) or an unsaved draft of it. */
  manualCloseRatePct?: number | string | null;
  stats?: ProducerConversionStats | null;
  /** agencies.global_close_rate (percent). */
  agencyCloseRatePct?: number | string | null;
  productionDays: number;
}): DerivedProducerGoals {
  const quoteToApp = resolveQuoteToAppRatio({
    manualOverridePct: input.manualCloseRatePct,
    ytdQuotes: input.stats?.ytdQuotes,
    ytdBound: input.stats?.ytdBound,
    agencyCloseRatePct: input.agencyCloseRatePct,
  });
  const callToQuote = resolveCallToQuoteRatio({ ytdTouches: input.stats?.ytdTouches, ytdQuotes: input.stats?.ytdQuotes });
  const goals = calculateReverseGoals({
    monthlyAppTarget: input.monthlyAppTarget,
    quoteToApp: quoteToApp.ratio,
    callToQuote: callToQuote.ratio,
    productionDays: input.productionDays,
  });
  return { goals, quoteToApp, callToQuote };
}

/** The six profile columns the Daily/Weekly goals persist to. */
export const DAILY_WEEKLY_GOAL_FIELDS = [
  "daily_target_touchpoints", "daily_target_quotes", "daily_target_bound",
  "weekly_target_touchpoints", "weekly_target_quotes", "weekly_target_bound",
] as const;

export type DailyWeeklyGoalFields = Record<(typeof DAILY_WEEKLY_GOAL_FIELDS)[number], number>;

export function goalFieldsFromReverseGoals(g: ReverseGoals): DailyWeeklyGoalFields {
  return {
    daily_target_touchpoints: g.dailyCalls,
    daily_target_quotes: g.dailyQuotes,
    daily_target_bound: g.dailyApps,
    weekly_target_touchpoints: g.weeklyCalls,
    weekly_target_quotes: g.weeklyQuotes,
    weekly_target_bound: g.weeklyApps,
  };
}

/**
 * What to PERSIST for a producer's Daily/Weekly goals:
 *   Manual Override            -> the hand-typed stored values, untouched (reverse math bypassed)
 *   Smart Math + Monthly > 0   -> the derived values
 *   Smart Math + no Monthly    -> whatever is stored (nothing to derive from)
 */
export function resolveGoalFieldsToSave(
  member: Record<string, any>,
  derived: DerivedProducerGoals | undefined | null
): DailyWeeklyGoalFields {
  if (!member.is_manual_goals && derived && Number(member.monthly_target_bound) > 0) {
    return goalFieldsFromReverseGoals(derived.goals);
  }
  const stored = {} as DailyWeeklyGoalFields;
  DAILY_WEEKLY_GOAL_FIELDS.forEach((f) => { stored[f] = Math.round(Number(member[f]) || 0); });
  return stored;
}
