// Shared calendar-pacing helpers for the Executive Cockpit (see
// app/dashboard/cockpit/page.tsx) — used by both the VC Tier Sniper's
// weekly/monthly pace and the Activity Pacing Engine's daily quote targets.

export interface WorkingDaysRemaining {
  calendarDaysRemaining: number;
  workingDaysRemaining: number;
  weeksRemaining: number;
  monthsRemaining: number;
}

// Working days remaining in the current calendar year, prorated by the
// agency's own production_days_per_week (defaults to 5 — matches every other
// consumer of this field, e.g. app/dashboard/page.tsx pacing math).
export function getWorkingDaysRemainingInYear(productionDaysPerWeek: number = 5, today: Date = new Date()): WorkingDaysRemaining {
  const prodDays = productionDaysPerWeek > 0 ? productionDaysPerWeek : 5;
  const endOfYear = new Date(today.getFullYear(), 11, 31);
  const msPerDay = 1000 * 60 * 60 * 24;
  const calendarDaysRemaining = Math.max(0, Math.ceil((endOfYear.getTime() - today.getTime()) / msPerDay));
  const workingDaysRemaining = calendarDaysRemaining * (prodDays / 7);
  const weeksRemaining = Math.max(workingDaysRemaining / prodDays, 0);
  const monthsRemaining = Math.max(calendarDaysRemaining / (365 / 12), 0);
  return { calendarDaysRemaining, workingDaysRemaining, weeksRemaining, monthsRemaining };
}
