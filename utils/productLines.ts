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
