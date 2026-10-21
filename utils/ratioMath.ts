// Display-safe conversion ratios, shared by every conversion panel (Scoreboard Daily/MTD tiles, My
// Performance, Settings -> Conversion Metrics).
//
// Funnel stages are logged by hand, so a numerator can legitimately outrun its denominator (a quote
// gets logged but the Contact that led to it was forgotten -> 166 quotes / 1 contact = "16600%").
// Two guards keep the dashboards sane:
//   1. Division by zero (or any non-finite / negative input) -> 0, never NaN / Infinity.
//   2. A hard ceiling of 100%: no conversion ratio is ever displayed above it.
// This is DISPLAY-only protection; the goal engine (utils/goalMath.ts) has its own clamping and
// doesn't use Contacts at all.

/** numerator / denominator as a percentage in [0, 100]. 0 when the denominator isn't a positive number. */
export function conversionPct(numerator: unknown, denominator: unknown): number {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0 || n <= 0) return 0;
  return Math.min(100, (n / d) * 100);
}

/** conversionPct as a 1-decimal string ("0.0" .. "100.0") - the format the dashboard panels already used. */
export function formatConversionPct(numerator: unknown, denominator: unknown): string {
  return conversionPct(numerator, denominator).toFixed(1);
}
