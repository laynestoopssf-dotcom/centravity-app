// Shared "generate one realistic day of production" engine for the Demo Agency
// Simulator. Used by BOTH scripts/seed_demo_agency.ts (Stage 2 of the historical
// backfill) and app/api/cron/simulate-demo/route.ts (the daily cron) so the two
// never drift apart — that's what keeps the 30-day rolling averages the app
// already computes (Settings → Team close rates, the Cockpit What-If engine)
// moving naturally instead of jumping when the cron takes over from the seed.
//
// This module is pure computation (dates in, row objects out) — it never talks
// to Supabase itself. Callers own the DEMO_AGENCY_ID/DEMO_OFFICE_ID scoping and
// the actual insert() calls, so isolation stays enforced at the call site.

export const LOB_LIST = ["Auto", "Fire", "Commercial", "Life", "Health"] as const;
export type LineOfBusiness = (typeof LOB_LIST)[number];

export type AnnualGoals = Record<LineOfBusiness, { apps: number; premium: number }>;

/** Billing/term cycle written to policies.payment_cycle — P&C is billed monthly here, Health annually. */
const PAYMENT_CYCLE: Record<LineOfBusiness, "monthly" | "annual"> = {
  Auto: "monthly",
  Fire: "monthly",
  Commercial: "monthly",
  Life: "annual",
  Health: "annual",
};

// Fraction of Life apps written as monthly-pay rather than paid-in-full annual.
// This is what makes "Life Carry Over" (app/dashboard/cockpit/page.tsx's
// carryOverCred/pendingCarryOver — the unearned portion of a monthly-pay Life
// policy's annual premium that rolls into next year) come out non-zero at
// all: the carry-over formula is `premium - (premium/12)*(12-monthDone)`,
// which is always exactly 0 for an annual-pay policy. Only Life gets this
// treatment — Auto/Fire/Commercial/Health's payment_cycle never feeds that
// calculation, so they stay on the fixed map above.
const LIFE_MONTHLY_PAY_SHARE = 0.35;

function pickPaymentCycle(lob: LineOfBusiness): "monthly" | "annual" {
  if (lob === "Life") return Math.random() < LIFE_MONTHLY_PAY_SHARE ? "monthly" : "annual";
  return PAYMENT_CYCLE[lob];
}

export interface ProducerWeight {
  userId: string;
  /** Fraction of total team production this producer carries. Should sum to 1 across the roster. */
  weight: number;
  /** Quotes → bound conversion rate, e.g. 0.24 for 24%. */
  closeRate: number;
  /** Touches → quotes conversion rate, e.g. 0.30 for 30%. */
  quoteRate: number;
}

export interface GeneratedPolicyRow {
  id: string;
  agency_id: string;
  office_id: string;
  user_id: string;
  product_line: LineOfBusiness;
  premium_amount: number;
  payment_cycle: "monthly" | "annual";
  // "quoted" = still-open pipeline (see generateOpenPipeline) — deliberately
  // has no bound_at/issued_at, exactly like a real not-yet-bound quote (see
  // app/dashboard/page.tsx's own "'quoted' hasn't been bound yet, so it
  // should have no bind date at all" convention).
  status: "quoted" | "bound" | "issued";
  is_renewal: false;
  logged_at: string;
  written_at: string;
  bound_at?: string;
  issued_at?: string;
}

export interface GeneratedActivityRow {
  id: string;
  agency_id: string;
  office_id: string;
  user_id: string;
  activity_type: "touchpoint" | "quote";
  logged_at: string;
}

export interface DayResult {
  policies: GeneratedPolicyRow[];
  activities: GeneratedActivityRow[];
}

/** Expected COMBINED team apps per business day, keyed by line of business. */
export type DailyTeamRate = Record<LineOfBusiness, number>;

export function computeAvgPremiumPerApp(goals: AnnualGoals): Record<LineOfBusiness, number> {
  const out: Record<LineOfBusiness, number> = { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 };
  for (const lob of LOB_LIST) {
    const g = goals[lob];
    out[lob] = g.apps > 0 ? g.premium / g.apps : 0;
  }
  return out;
}

/**
 * Saturdays get a small realistic chance of activity even on a 5-day week;
 * Sundays are rare but not impossible (a producer catching up on paperwork).
 * A `productionDaysPerWeek` of 6+ treats Saturday as a full business day.
 */
export function isBusinessDay(date: Date, productionDaysPerWeek: number): boolean {
  const day = date.getDay(); // 0 = Sun, 6 = Sat
  if (day === 0) return false;
  if (day === 6) return productionDaysPerWeek >= 6;
  return true;
}

/** Weekend "trickle" factor applied to the team rate on non-business days instead of a hard zero. */
export function weekendRateFactor(date: Date): number {
  const day = date.getDay();
  if (day === 6) return 0.15; // Saturday
  if (day === 0) return 0.05; // Sunday
  return 1;
}

export function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Knuth's algorithm — fine for the small lambdas (well under 30) this simulator ever uses. */
export function poissonSample(lambda: number): number {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > limit);
  return k - 1;
}

export function pickWeightedProducer(producers: ProducerWeight[]): ProducerWeight {
  const total = producers.reduce((sum, p) => sum + p.weight, 0) || 1;
  let roll = Math.random() * total;
  for (const p of producers) {
    roll -= p.weight;
    if (roll <= 0) return p;
  }
  return producers[producers.length - 1];
}

/** Jitters a timestamp to a random hour within a typical 8am–6pm production window (local server time). */
function withBusinessHour(date: Date, hourRangeStart = 8, hourRangeEnd = 18): Date {
  const d = new Date(date);
  const hour = Math.floor(randomInRange(hourRangeStart, hourRangeEnd));
  const minute = Math.floor(randomInRange(0, 60));
  d.setHours(hour, minute, Math.floor(randomInRange(0, 60)), 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export interface GenerateDayParams {
  date: Date;
  agencyId: string;
  officeId: string;
  producers: ProducerWeight[];
  avgPremiumPerApp: Record<LineOfBusiness, number>;
  dailyTeamRate: DailyTeamRate;
  productionDaysPerWeek: number;
  /** Historical backfill rows are fully "issued"; very-recent rows should still read "bound" (not yet carrier-issued). */
  policyStatus: "bound" | "issued";
  makeId: () => string;
  /** Clamp generated timestamps so nothing lands before this date (keeps quote backdating inside the seed window). */
  earliestDate?: Date;
  /** Clamp generated timestamps so nothing lands after this date (never generate into the future). */
  latestDate?: Date;
}

/**
 * Generates one calendar day of realistic activity+policy rows for the whole
 * producing roster. Pure function — callers batch the returned rows into their
 * own chunked insert() calls.
 */
export function generateDayOfProduction(params: GenerateDayParams): DayResult {
  const {
    date,
    agencyId,
    officeId,
    producers,
    avgPremiumPerApp,
    dailyTeamRate,
    productionDaysPerWeek,
    policyStatus,
    makeId,
    earliestDate,
    latestDate,
  } = params;

  const policies: GeneratedPolicyRow[] = [];
  const activities: GeneratedActivityRow[] = [];

  // Hard, unconditional floor under `latestDate`: activities has a DB trigger
  // that rejects any row with logged_at > NOW() + 5 minutes ("Cannot log
  // activities in the future"). When `date` is TODAY, withBusinessHour() below
  // picks a random hour anywhere in the whole 8am-6pm window regardless of
  // what time it actually is right now — e.g. running this at 8am can still
  // roll 2pm, which is genuinely in the future relative to the real clock.
  // `latestDate` alone doesn't catch this if a caller passes end-of-day
  // instead of the literal current moment, so this caps every generated
  // timestamp to "now" no matter what latestDate was given. A small buffer
  // absorbs the (generate-in-memory now, insert-into-Postgres later) gap.
  const NOW_SAFETY_BUFFER_MS = 60_000;
  const nowSafetyCap = new Date(Date.now() - NOW_SAFETY_BUFFER_MS);

  const clamp = (d: Date): Date => {
    let result = d;
    if (earliestDate && result < earliestDate) result = new Date(earliestDate);
    if (latestDate && result > latestDate) result = new Date(latestDate);
    if (result > nowSafetyCap) result = new Date(nowSafetyCap);
    return result;
  };

  const businessDay = isBusinessDay(date, productionDaysPerWeek);
  const rateFactor = businessDay ? 1 : weekendRateFactor(date);

  for (const lob of LOB_LIST) {
    const rate = (dailyTeamRate[lob] || 0) * rateFactor;
    const boundToday = poissonSample(rate);
    if (boundToday === 0) continue;

    // Tally how many of today's binds land on each producer so the extra
    // (non-converting) quotes/touches below can be sized off real per-producer volume.
    const boundByProducer = new Map<string, number>();

    for (let i = 0; i < boundToday; i++) {
      const producer = pickWeightedProducer(producers);
      boundByProducer.set(producer.userId, (boundByProducer.get(producer.userId) || 0) + 1);

      const premium = Math.round((avgPremiumPerApp[lob] || 0) * randomInRange(0.7, 1.35));
      const boundAt = clamp(withBusinessHour(date));
      const writtenAt = clamp(addDays(boundAt, -Math.floor(randomInRange(1, 4))));
      const issuedAt = policyStatus === "issued" ? clamp(addDays(boundAt, Math.floor(randomInRange(1, 6)))) : undefined;

      policies.push({
        id: makeId(),
        agency_id: agencyId,
        office_id: officeId,
        user_id: producer.userId,
        product_line: lob,
        premium_amount: premium,
        payment_cycle: pickPaymentCycle(lob),
        status: policyStatus,
        is_renewal: false,
        logged_at: boundAt.toISOString(),
        written_at: writtenAt.toISOString(),
        bound_at: boundAt.toISOString(),
        ...(issuedAt ? { issued_at: issuedAt.toISOString() } : {}),
      });

      // The "converting" quote + touchpoint that led to this bind.
      activities.push({
        id: makeId(),
        agency_id: agencyId,
        office_id: officeId,
        user_id: producer.userId,
        activity_type: "quote",
        logged_at: writtenAt.toISOString(),
      });
      activities.push({
        id: makeId(),
        agency_id: agencyId,
        office_id: officeId,
        user_id: producer.userId,
        activity_type: "touchpoint",
        logged_at: clamp(addDays(writtenAt, -Math.floor(randomInRange(0, 3)))).toISOString(),
      });
    }

    // Extra non-converting quotes/touches so each producer's realized close rate
    // trends toward their assigned closeRate/quoteRate instead of looking like 100%.
    for (const producer of producers) {
      const bound = boundByProducer.get(producer.userId) || 0;
      if (bound === 0) continue;

      const totalQuotesNeeded = Math.round(bound / Math.max(producer.closeRate, 0.05));
      const extraQuotes = Math.max(0, totalQuotesNeeded - bound);
      for (let q = 0; q < extraQuotes; q++) {
        activities.push({
          id: makeId(),
          agency_id: agencyId,
          office_id: officeId,
          user_id: producer.userId,
          activity_type: "quote",
          logged_at: clamp(withBusinessHour(date)).toISOString(),
        });
      }

      const totalTouchesNeeded = Math.round(totalQuotesNeeded / Math.max(producer.quoteRate, 0.05));
      const alreadyLoggedTouches = bound; // one touchpoint per converting bind, added above
      const extraTouches = Math.max(0, totalTouchesNeeded - alreadyLoggedTouches);
      for (let t = 0; t < extraTouches; t++) {
        activities.push({
          id: makeId(),
          agency_id: agencyId,
          office_id: officeId,
          user_id: producer.userId,
          activity_type: "touchpoint",
          logged_at: clamp(withBusinessHour(date)).toISOString(),
        });
      }
    }
  }

  return { policies, activities };
}

export interface GenerateOpenPipelineParams {
  agencyId: string;
  officeId: string;
  producers: ProducerWeight[];
  avgPremiumPerApp: Record<LineOfBusiness, number>;
  /** How many currently-open ("quoted", never closed) policies to create per line of business. */
  countByLob: Record<LineOfBusiness, number>;
  /** Open items are backdated to a random day inside this window so they read as "still being worked" rather than all landing on the same instant. */
  earliestDate: Date;
  latestDate: Date;
  makeId: () => string;
}

/**
 * Generates a batch of still-open ("quoted") pipeline policies — prospects
 * that have been quoted but never bound or issued. Every existing "win" path
 * in generateDayOfProduction above always resolves straight to "bound"/
 * "issued", so without this, the demo agency would have zero real Pipeline
 * Potential (app/dashboard/cockpit's pendingCarryOver / pendingLifeCred /
 * pendingHealthCred, and the various "Active Pipeline"/"Pending Pipeline"
 * list views in components/DashboardTab.tsx, LifeTab.tsx, CommissionTab.tsx,
 * LedgerTab.tsx) no matter how much historical production got seeded — those
 * widgets all read directly off `policies.status === 'quoted'` rows, which
 * this is the only thing that ever creates.
 *
 * Deliberately a separate, explicit batch rather than folded into the daily
 * win-generation loop: a real pipeline is a bounded, roughly-steady-state
 * pool of currently-active prospects, not an ever-growing pile of every quote
 * ever thrown (nothing in this simulator ever "resolves" an old quoted row
 * into bound/dead, so scripts/seed_demo_agency.ts and the daily cron both
 * intentionally keep this batch small and recent-dated).
 */
export function generateOpenPipeline(params: GenerateOpenPipelineParams): GeneratedPolicyRow[] {
  const { agencyId, officeId, producers, avgPremiumPerApp, countByLob, earliestDate, latestDate, makeId } = params;

  const NOW_SAFETY_BUFFER_MS = 60_000;
  const nowSafetyCap = new Date(Date.now() - NOW_SAFETY_BUFFER_MS);
  const effectiveLatest = latestDate > nowSafetyCap ? nowSafetyCap : latestDate;
  const spanDays = Math.max(1, Math.round((effectiveLatest.getTime() - earliestDate.getTime()) / (24 * 60 * 60 * 1000)));

  const policies: GeneratedPolicyRow[] = [];

  for (const lob of LOB_LIST) {
    const count = Math.max(0, Math.round(countByLob[lob] || 0));
    for (let i = 0; i < count; i++) {
      const producer = pickWeightedProducer(producers);
      const premium = Math.round((avgPremiumPerApp[lob] || 0) * randomInRange(0.7, 1.35));

      const day = new Date(earliestDate);
      day.setDate(day.getDate() + Math.floor(Math.random() * spanDays));
      let writtenAt = withBusinessHour(day);
      if (writtenAt < earliestDate) writtenAt = new Date(earliestDate);
      if (writtenAt > effectiveLatest) writtenAt = new Date(effectiveLatest);

      policies.push({
        id: makeId(),
        agency_id: agencyId,
        office_id: officeId,
        user_id: producer.userId,
        product_line: lob,
        premium_amount: premium,
        payment_cycle: pickPaymentCycle(lob),
        status: "quoted",
        is_renewal: false,
        logged_at: writtenAt.toISOString(),
        written_at: writtenAt.toISOString(),
      });
    }
  }

  return policies;
}
