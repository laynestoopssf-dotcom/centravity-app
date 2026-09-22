// Shared date-range filter used by both the Data Ledger (components/LedgerTab.tsx) and the
// Active Pipeline (components/DashboardTab.tsx) so the two pickers always mean exactly the
// same thing for the same option, instead of drifting into two subtly different "This week"s.

export type DateRangeKey = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'custom';

export const DATE_RANGE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'thisWeek', label: 'This week' },
  { value: 'lastWeek', label: 'Last week' },
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'custom', label: 'Custom range' },
];

const startOfDay = (d: Date): Date => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const endOfDay = (d: Date): Date => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };

// Weeks are Monday-start, matching the existing Weekly Rank convention (see the
// `distanceToMonday` derivation of `selectedWeekStart` in app/dashboard/page.tsx) so "This
// week"/"Last week" here always line up with what the rest of the dashboard already means by
// "this week" instead of introducing a second, Sunday-start definition of the same word.
const mondayOf = (d: Date): Date => {
  const date = new Date(d);
  const dayOfWeek = date.getDay();
  const distanceToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  date.setDate(date.getDate() - distanceToMonday);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Resolves a DateRangeKey (+ optional "YYYY-MM-DD" custom bounds) into a concrete window.
 * `end === null` means "open-ended, through right now" (Today/This week/This month - i.e. the
 * range is still accumulating); every other range is a fully closed [start, end] window.
 */
export function resolveDateRange(key: DateRangeKey, customStart?: string, customEnd?: string): { start: Date; end: Date | null } {
  const now = new Date();
  switch (key) {
    case 'today':
      return { start: startOfDay(now), end: null };
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return { start: startOfDay(y), end: endOfDay(y) };
    }
    case 'thisWeek':
      return { start: mondayOf(now), end: null };
    case 'lastWeek': {
      const thisMonday = mondayOf(now);
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(lastMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(lastSunday.getDate() - 1);
      return { start: lastMonday, end: endOfDay(lastSunday) };
    }
    case 'thisMonth':
      return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: null };
    case 'lastMonth': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      // Day 0 of "this month" is the last calendar day of the previous month.
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'custom':
    default: {
      const start = customStart ? new Date(`${customStart}T00:00:00`) : startOfDay(now);
      const end = customEnd ? new Date(`${customEnd}T23:59:59`) : null;
      return { start, end };
    }
  }
}
