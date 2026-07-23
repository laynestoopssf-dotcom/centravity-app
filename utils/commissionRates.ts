// Shared read/lookup helpers for the carrier-accurate Life & Health commission rate
// engine (see scripts/add_commission_rates_engine.sql for the schema this reads).
//
// Life/Health revenue is intentionally decoupled from the P&C Variable Comp (VC)
// multiplier — VC only ever applies to Auto/Fire/Commercial. Life & Health instead
// multiply their premium volume against these carrier-table rates, differentiated
// by New Business (year1 / first_year) vs Renewal-Existing Book (servicing /
// year2_to_5). See app/dashboard/page.tsx calculateRev and
// app/dashboard/reveal/page.tsx for the two consumers.
//
// SUB-TYPE CAVEAT: the underlying `policies` data model only tracks a single
// aggregate "Life" / "Health" premium bucket per parent line (via
// utils/productLines.ts resolveParentLine) — it does not yet distinguish Term vs
// Traditional Ordinary vs Single-Premium (or the three Health sub-products) on
// individual policy rows. Until that granularity exists upstream, aggregate
// premium totals use a single representative sub-type per line (Term for Life,
// Medicare Supplement for Health) as the blended default — the same
// simplification the carrier table itself already applies by averaging
// mid-tier age brackets on Traditional Ordinary. The nested JSON shape is ready
// to key off real per-policy sub-types the moment that data exists.

export type RevenuePhase = 'new_business' | 'renewal';

export type LifeSubType = 'term' | 'traditional_ordinary' | 'single_premium';
export type HealthSubType = 'medicare_supplement' | 'long_term_care_and_disability' | 'hospital_income';

export interface LifeRateBand {
  year1: number;
  year2_to_5: number;
  year6_plus: number;
}

export interface HealthRateBand {
  first_year: number;
  servicing: number;
}

export interface CommissionRates {
  life: Record<LifeSubType, LifeRateBand>;
  health: Record<HealthSubType, HealthRateBand>;
}

// Mirrors scripts/add_commission_rates_engine.sql's column default exactly — used
// as the client-side fallback for agencies that haven't been migrated/fetched yet,
// or whose commission_rates JSON is missing a sub-type the UI hasn't saved yet.
export const DEFAULT_COMMISSION_RATES: CommissionRates = {
  life: {
    term: { year1: 0.20, year2_to_5: 0.03, year6_plus: 0.02 },
    traditional_ordinary: { year1: 0.30, year2_to_5: 0.12, year6_plus: 0.03 },
    single_premium: { year1: 0.03, year2_to_5: 0.00, year6_plus: 0.00 },
  },
  health: {
    medicare_supplement: { first_year: 0.11, servicing: 0.11 },
    long_term_care_and_disability: { first_year: 0.40, servicing: 0.10 },
    hospital_income: { first_year: 0.25, servicing: 0.10 },
  },
};

// The single aggregate sub-type used for blended Life/Health premium buckets
// until per-policy sub-type data exists (see file header caveat).
export const DEFAULT_LIFE_SUBTYPE: LifeSubType = 'term';
export const DEFAULT_HEALTH_SUBTYPE: HealthSubType = 'medicare_supplement';

// Deep-merges a (possibly partial/null/legacy) commission_rates payload from the
// `agencies` row over the defaults, so a JSON that's missing a sub-type the admin
// hasn't touched yet (or a brand-new agency created before this migration ran)
// never produces NaN/undefined rates downstream.
export function resolveCommissionRates(raw: unknown): CommissionRates {
  const r = (raw || {}) as Partial<CommissionRates>;
  const life = (r.life || {}) as Partial<Record<LifeSubType, Partial<LifeRateBand>>>;
  const health = (r.health || {}) as Partial<Record<HealthSubType, Partial<HealthRateBand>>>;

  return {
    life: {
      term: { ...DEFAULT_COMMISSION_RATES.life.term, ...(life.term || {}) },
      traditional_ordinary: { ...DEFAULT_COMMISSION_RATES.life.traditional_ordinary, ...(life.traditional_ordinary || {}) },
      single_premium: { ...DEFAULT_COMMISSION_RATES.life.single_premium, ...(life.single_premium || {}) },
    },
    health: {
      medicare_supplement: { ...DEFAULT_COMMISSION_RATES.health.medicare_supplement, ...(health.medicare_supplement || {}) },
      long_term_care_and_disability: { ...DEFAULT_COMMISSION_RATES.health.long_term_care_and_disability, ...(health.long_term_care_and_disability || {}) },
      hospital_income: { ...DEFAULT_COMMISSION_RATES.health.hospital_income, ...(health.hospital_income || {}) },
    },
  };
}

// Renewal/existing-book revenue represents book that's already past its first
// policy year. `year2_to_5` is used as that representative servicing rate since
// the data model doesn't track per-policy vintage (a static `book_size_life`
// aggregate has no "how many years old" dimension) — `year6_plus` is reserved
// for whenever per-policy-year tracking lands.
export function getLifeRate(rates: CommissionRates, phase: RevenuePhase, subType: LifeSubType = DEFAULT_LIFE_SUBTYPE): number {
  const band = rates.life[subType] || DEFAULT_COMMISSION_RATES.life[subType];
  return phase === 'new_business' ? band.year1 : band.year2_to_5;
}

export function getHealthRate(rates: CommissionRates, phase: RevenuePhase, subType: HealthSubType = DEFAULT_HEALTH_SUBTYPE): number {
  const band = rates.health[subType] || DEFAULT_COMMISSION_RATES.health[subType];
  return phase === 'new_business' ? band.first_year : band.servicing;
}

interface LifeHealthRevenueInput {
  lifePremium: number;
  healthPremium: number;
  phase: RevenuePhase;
  rates: CommissionRates;
  lifeSubType?: LifeSubType;
  healthSubType?: HealthSubType;
}

interface LifeHealthRevenueResult {
  lifeRevenue: number;
  healthRevenue: number;
  lifeRate: number;
  healthRate: number;
}

// VC-free by design — never multiplies against current_vc_rate. Callers pass the
// same premium buckets already used for the old base_comm_life/health math; this
// simply swaps the flat base rate for the carrier-table lookup above.
export function calculateLifeHealthRevenue({
  lifePremium,
  healthPremium,
  phase,
  rates,
  lifeSubType = DEFAULT_LIFE_SUBTYPE,
  healthSubType = DEFAULT_HEALTH_SUBTYPE,
}: LifeHealthRevenueInput): LifeHealthRevenueResult {
  const lifeRate = getLifeRate(rates, phase, lifeSubType);
  const healthRate = getHealthRate(rates, phase, healthSubType);
  return {
    lifeRevenue: (Number(lifePremium) || 0) * lifeRate,
    healthRevenue: (Number(healthPremium) || 0) * healthRate,
    lifeRate,
    healthRate,
  };
}
