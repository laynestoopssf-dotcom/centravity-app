// Shared parent-line resolver - single source of truth (previously copy/pasted ~9 times across
// app/page.tsx and CommissionTab.tsx). Maps a raw policy product_line string to its parent category
// (Auto/Fire/Commercial/Life/Health) using the agency's custom_product_lines.
//
// Exact match is tried first, case/whitespace-insensitive, since a stray space or capitalization
// difference (e.g. from a CSV import) was silently causing an exact `===` match to fail. If nothing
// matches exactly, falls back to a substring heuristic - checking the more specific "Commercial"/
// "Health" names before the generic "Auto"/"Fire"/"Life" ones, so compound names like "Commercial
// Auto" or "Health - Group" still roll up correctly instead of silently being dropped from every
// YTD/MTD tally that keys off an exact parent-category match.
const PARENT_LINE_FALLBACK_ORDER = ['Commercial', 'Health', 'Life', 'Auto', 'Fire'] as const;

export const resolveParentLine = (line: string, linesDict: any[]): string => {
  if (!line) return line;
  const normalized = line.trim().toLowerCase();
  const exact = (linesDict || []).find((l: any) => (l?.name || '').trim().toLowerCase() === normalized);
  if (exact) return exact.parent;
  const fallback = PARENT_LINE_FALLBACK_ORDER.find(p => normalized.includes(p.toLowerCase()));
  return fallback || line;
};

// Granular Life Commissions: sub-type resolver for anything that rolls up to the "Life" parent
// category (see resolveParentLine above), used ONLY by the commission-rate engine
// (utils/commissionMath.ts) to decide whether a Life policy pays its Term or Whole rate. Every
// other consumer of "Life" as a parent bucket (Scoreboard tiles, roster counts, Pipeline grouping,
// Weekly Rank, Agency Overview, etc.) is completely unaffected by this - resolveParentLine still
// returns the single umbrella "Life" for all of those, on purpose, so this split only ever touches
// payout math, never production/app-count reporting.
//
// An agency creates the actual "Term Life"/"Whole Life" product lines themselves via Settings ->
// Custom Product Lines (mapped to parent "Life", exactly like any other custom line) - there's
// nothing new to configure there. This just reads the resulting name text: anything containing
// "whole" is Whole Life; everything else under the Life umbrella (including a bare legacy "Life"
// product line from before this split existed) defaults to Term, matching the same Term-as-default
// convention utils/commissionRates.ts already established for the separate agency-revenue engine.
export type LifeSubType = 'term' | 'whole';

export const resolveLifeSubType = (productLine: string): LifeSubType => {
  const normalized = (productLine || '').trim().toLowerCase();
  return normalized.includes('whole') ? 'whole' : 'term';
};

// Granular Health Commissions: same "name-on-product_line, no extra DB column" pattern as
// resolveLifeSubType above. "Medicare Supplemental" (and the State Farm catalog's existing
// "Medicare Supp/Medigap") pays the Medicare rate; every other Health parent line — including a
// bare legacy "Health" product — is Health (Base). Logging UI injects "Medicare Supplemental"
// into the Health product dropdown when the agency's custom catalog doesn't already have a
// medicare-matching line (see ensureHealthProductOptions).
export type HealthSubType = 'base' | 'medicare';

export const MEDICARE_SUPPLEMENTAL_PRODUCT_NAME = 'Medicare Supplemental';

export const resolveHealthSubType = (productLine: string): HealthSubType => {
  const normalized = (productLine || '').trim().toLowerCase();
  return (normalized.includes('medicare') || normalized.includes('medigap')) ? 'medicare' : 'base';
};

/** Health product-dropdown options: agency catalog first, plus Medicare Supplemental if missing. */
export const ensureHealthProductOptions = (
  lines: { name: string; parent: string }[] | null | undefined,
  parentCategory: string
): { name: string; parent: string }[] => {
  const available = (lines || []).filter((l) => l.parent === parentCategory);
  if (parentCategory !== 'Health') {
    return available.length > 0 ? available : [{ name: parentCategory, parent: parentCategory }];
  }
  const hasMedicare = available.some((l) => resolveHealthSubType(l.name) === 'medicare');
  const result = available.length > 0 ? [...available] : [{ name: 'Health', parent: 'Health' }];
  if (!hasMedicare) {
    result.push({ name: MEDICARE_SUPPLEMENTAL_PRODUCT_NAME, parent: 'Health' });
  }
  return result;
};
