// Shared number/currency formatting helpers - single source of truth so `$10,000` (not
// `$10000` or `10,000`) looks the same whether it comes from a display cell, a table, or an
// input field. Previously every file (RevenueTab, cockpit, reveal, DashboardMetrics, ...) had
// its own copy-pasted `money()`/`formatCurrency()` one-liner, and several dollar fields
// (Settings sliders/targets, Commission bonus displays, RevenueTab VC thresholds) had none at
// all and just interpolated the raw number.

/** `$10,000` - always a `$` prefix, always comma-grouped, no decimals by default (matches how every currency figure in this app is quoted - whole-dollar premiums/targets/bonuses). */
export function formatDollars(value: number | string | null | undefined, opts?: { decimals?: number }): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0";
  const decimals = opts?.decimals ?? 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

/** `10,000` - comma-grouped, no `$` - for non-dollar counts (apps, credits, etc.) that still benefit from thousands separators. */
export function formatNumber(value: number | string | null | undefined, opts?: { decimals?: number }): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const decimals = opts?.decimals ?? 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
