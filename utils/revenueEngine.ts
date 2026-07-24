// Single source of truth for the P&C + Life/Health revenue formula.
//
// Decoupling rule (see scripts/add_commission_rates_engine.sql): the Variable
// Comp (VC) multiplier applies STRICTLY to Auto/Fire/Commercial premium.
// Life & Health bypass VC entirely and instead multiply premium against the
// carrier-accurate `commission_rates` table (utils/commissionRates.ts),
// differentiated by New Business (year1/first_year) vs Renewal/Existing Book
// (servicing/year2_to_5).
//
// app/dashboard/page.tsx, app/dashboard/reveal/page.tsx, and
// app/dashboard/cockpit/page.tsx all import this instead of re-deriving the
// formula, so a future rate/rule change only has to happen once.

import { CommissionRates, calculateLifeHealthRevenue } from './commissionRates';
import { num, readBookField, sumOfficeBookSizes } from './officeFields';

export interface OfficeRates {
  vcRate: number;
  bAuto: number;
  bFire: number;
  bComm: number;
}

// Resolves an office's effective P&C rates, falling back to agency-wide
// defaults. Passing `office = null` (the "Enterprise / All Locations" view)
// naturally degrades to the agency-wide rates via optional chaining, so this
// one function correctly serves both per-office and enterprise-wide callers.
export function resolveOfficeRates(office: any, agencySettings: any): OfficeRates {
  const vcRate = num(office?.current_vc_rate, num(agencySettings?.current_vc_rate)) / 100;
  const bAuto = num(office?.base_comm_auto, num(agencySettings?.base_comm_auto, 8)) / 100;
  const bFire = num(office?.base_comm_fire, num(agencySettings?.base_comm_fire, 8)) / 100;
  // Commercial has no dedicated base_comm_* column — mirrors Fire's rate, matching
  // every existing consumer of this formula.
  const bComm = bFire;
  return { vcRate, bAuto, bFire, bComm };
}

export interface RenewalRevenueResult {
  totalBookPremium: number;
  totalRenRev: number;
  // P&C (Auto/Fire/Commercial) and Life/Health are exposed separately, in
  // addition to the combined totals above, so consumers can display "Net
  // Renewals" as a strictly-isolated P&C figure instead of a blended number
  // that silently folds in Life/Health servicing revenue (which has its own
  // carrier-rate math and never touches VC — see calculateLifeHealthRevenue).
  pncBookPremium: number;
  lifeHealthBookPremium: number;
  pncRenRev: number;
  lifeHealthRenRev: number;
}

// Existing book (already-in-force premium) → renewal revenue for one office.
// P&C lines are lapse-adjusted by how far into the year we are; Life/Health
// are not (they use the flat carrier renewal/servicing rate instead).
export function calculateOfficeRenewalRevenue(
  office: any,
  agencySettings: any,
  commissionRates: CommissionRates,
  ytdTimeFraction: number
): RenewalRevenueResult {
  const autoLapse = (num(office?.ytd_lapse_cancel_auto, num(agencySettings?.ytd_lapse_cancel_auto)) / 100) * ytdTimeFraction;
  const fireLapse = (num(office?.ytd_lapse_cancel_fire, num(agencySettings?.ytd_lapse_cancel_fire)) / 100) * ytdTimeFraction;
  const commLapse = (num(office?.ytd_lapse_cancel_commercial, num(agencySettings?.ytd_lapse_cancel_commercial)) / 100) * ytdTimeFraction;

  const { vcRate, bAuto, bFire, bComm } = resolveOfficeRates(office, agencySettings);

  const bookAuto = readBookField(office, 'book_size_auto');
  const bookFire = readBookField(office, 'book_size_fire');
  const bookComm = readBookField(office, 'book_size_commercial');
  const bookLife = readBookField(office, 'book_size_life');
  const bookHealth = readBookField(office, 'book_size_health');

  const { lifeRevenue: bookLifeRev, healthRevenue: bookHealthRev } = calculateLifeHealthRevenue({
    lifePremium: bookLife,
    healthPremium: bookHealth,
    phase: 'renewal',
    rates: commissionRates,
  });

  const pncBookPremium = bookAuto + bookFire + bookComm;
  const lifeHealthBookPremium = bookLife + bookHealth;
  const totalBookPremium = pncBookPremium + lifeHealthBookPremium;

  const pncRenRev =
    bookAuto * (1 - autoLapse) * (bAuto + vcRate) +
    bookFire * (1 - fireLapse) * (bFire + vcRate) +
    bookComm * (1 - commLapse) * (bComm + vcRate);
  const lifeHealthRenRev = bookLifeRev + bookHealthRev;
  const totalRenRev = pncRenRev + lifeHealthRenRev;

  return { totalBookPremium, totalRenRev, pncBookPremium, lifeHealthBookPremium, pncRenRev, lifeHealthRenRev };
}

export interface EnterpriseRenewalRevenueResult extends RenewalRevenueResult {
  summedBook: ReturnType<typeof sumOfficeBookSizes>;
}

// Enterprise / All Locations: SUM every office's book + renewal (never a
// nonexistent agency-level book_size_* aggregate).
export function calculateEnterpriseRenewalRevenue(
  offices: any[],
  agencySettings: any,
  commissionRates: CommissionRates,
  ytdTimeFraction: number
): EnterpriseRenewalRevenueResult {
  const summedBook = sumOfficeBookSizes(offices);
  const totalBookPremium =
    summedBook.book_size_auto +
    summedBook.book_size_fire +
    summedBook.book_size_commercial +
    summedBook.book_size_life +
    summedBook.book_size_health;
  const pncBookPremium = summedBook.book_size_auto + summedBook.book_size_fire + summedBook.book_size_commercial;
  const lifeHealthBookPremium = summedBook.book_size_life + summedBook.book_size_health;

  const totals = (offices || []).reduce(
    (sum, office) => {
      const r = calculateOfficeRenewalRevenue(office, agencySettings, commissionRates, ytdTimeFraction);
      return { totalRenRev: sum.totalRenRev + r.totalRenRev, pncRenRev: sum.pncRenRev + r.pncRenRev, lifeHealthRenRev: sum.lifeHealthRenRev + r.lifeHealthRenRev };
    },
    { totalRenRev: 0, pncRenRev: 0, lifeHealthRenRev: 0 }
  );

  return { totalBookPremium, pncBookPremium, lifeHealthBookPremium, ...totals, summedBook };
}

export interface NewBusinessPremiums {
  autoPremium: number;
  firePremium: number;
  commercialPremium: number;
  lifePremium: number;
  healthPremium: number;
}

export interface NewBusinessRevenueResult {
  totalNbRev: number;
  autoRev: number;
  fireRev: number;
  commRev: number;
  lifeRev: number;
  healthRev: number;
  lifeRate: number;
  healthRate: number;
  // Same P&C vs Life/Health isolation as RenewalRevenueResult, above.
  pncNbRev: number;
  lifeHealthNbRev: number;
}

// New business (freshly bound/logged premium this year) → revenue. Same
// P&C-vs-Life/Health VC decoupling as the renewal engine above, just without
// the lapse adjustment (new business hasn't had a chance to lapse yet).
export function calculateNewBusinessRevenue(
  premiums: NewBusinessPremiums,
  office: any,
  agencySettings: any,
  commissionRates: CommissionRates
): NewBusinessRevenueResult {
  const { vcRate, bAuto, bFire, bComm } = resolveOfficeRates(office, agencySettings);

  const { lifeRevenue: lifeRev, healthRevenue: healthRev, lifeRate, healthRate } = calculateLifeHealthRevenue({
    lifePremium: premiums.lifePremium,
    healthPremium: premiums.healthPremium,
    phase: 'new_business',
    rates: commissionRates,
  });

  const autoRev = premiums.autoPremium * (bAuto + vcRate);
  const fireRev = premiums.firePremium * (bFire + vcRate);
  const commRev = premiums.commercialPremium * (bComm + vcRate);
  const pncNbRev = autoRev + fireRev + commRev;
  const lifeHealthNbRev = lifeRev + healthRev;
  const totalNbRev = pncNbRev + lifeHealthNbRev;

  return { totalNbRev, autoRev, fireRev, commRev, lifeRev, healthRev, lifeRate, healthRate, pncNbRev, lifeHealthNbRev };
}
