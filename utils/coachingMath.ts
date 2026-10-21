// Coaching Insights math: flags producers whose RECENT conversion is slipping relative to their own
// established history. Pure functions - no fetching, no React (see components/coaching/
// CoachingInsightsPanel.tsx for the queries that feed this).
//
// For each producer four funnel ratios are computed over two NON-OVERLAPPING windows:
//
//   Touch -> Contact = contacts / touches  (touches = outbound calls + texts, activity_type 'touchpoint';
//                                           contacts = two-way conversations, activity_type 'contact')
//   Contact -> Quote = quotes / contacts
//   Touch -> Quote   = quotes / touches    (the original Call -> Quote; the goal engine's bridge)
//   Quote -> App     = bound apps / quotes (bound = status 'bound' or 'issued')
//
// Contacts are secondary analytics ONLY - they are hand-logged and easy to forget, so they power these
// two coaching flags and nothing else (the goal math in utils/goalMath.ts never reads them). Every
// ratio is also capped at 100% (a quote logged without its Contact can push quotes > contacts) and
// guarded against a zero denominator.
//
//   Baseline = everything BEFORE the trailing-30-day boundary (all-time, excluding the last 30 days)
//   T30      = the trailing 30 days (boundary -> now)
//
// A metric is flagged when T30 is MORE THAN 15% (relative) below the baseline:
//   (baseline - t30) / baseline > RELATIVE_DROP_THRESHOLD     e.g. 20% -> 16% is a 20% relative drop.
//
// Sample-size guards (so noise never fires an alert, and nothing ever divides by zero):
//   - Baseline needs the same minimums the goal-setting math uses (utils/goalMath.ts):
//       Touch->Contact needs >= 50 touches AND >= 10 contacts;
//       Contact->Quote needs >= 10 contacts AND >= 10 quotes;
//       Touch->Quote   needs >= 50 touches  AND >= 10 quotes;
//       Quote->App     needs >= 10 quotes   AND >= 1 bound app.
//   - T30 needs its own (smaller, since it's only a month) minimums: Touch->Contact >= 20 touches;
//     Contact->Quote >= 5 contacts; Touch->Quote >= 20 touches; Quote->App >= 5 quotes. A producer who simply didn't work last
//     month (tiny T30 sample) is therefore never flagged for a "0%" that is really "no data".
//   - Contacts only exist from the day the Contact button shipped, so the two Contact metrics stay
//     silent (not flagged, not zero) until a producer has a real baseline of logged Contacts.
//   - If either window fails its minimum, that metric is skipped for that producer.
//
// SNOOZE / SUPPRESSION: once a manager acknowledges a flag (a row in coaching_insights_history),
// that exact (producer, metric) pair is suppressed for ACK_COOLDOWN_DAYS from the acknowledgement
// so the producer has time to act on the coaching without the manager seeing the same alert every
// day. The decision is made HERE, at flag-generation time, from the history rows passed in - flags
// are never stored, they're recomputed live, so "suppressed" simply means "not emitted".
import { MIN_QUOTES_FOR_LIVE_RATIO, MIN_TOUCHES_FOR_LIVE_RATIO } from "./goalMath";
import { conversionPct } from "./ratioMath";

/** Baseline needs this many logged Contacts before a Contact-based ratio counts as "established". */
export const MIN_CONTACTS_FOR_BASELINE = 10;

export const RELATIVE_DROP_THRESHOLD = 0.15;
export const T30_DAYS = 30;
export const MIN_T30_TOUCHES = 20;
export const MIN_T30_CONTACTS = 5;
export const MIN_T30_QUOTES = 5;
/** How long an acknowledged flag stays hidden before it's allowed to fire again. */
export const ACK_COOLDOWN_DAYS = 14;

export type CoachingMetric = "touchToContact" | "contactToQuote" | "touchToQuote" | "quoteToApp";

export interface WindowCounts {
  touches: number;
  contacts: number;
  quotes: number;
  bound: number;
}

export interface CoachingInsightFlag {
  id: string;
  producerId: string;
  producerName: string;
  metric: CoachingMetric;
  metricLabel: string;
  /** Decimals (0.12 = 12%). */
  t30Ratio: number;
  baselineRatio: number;
  /** Relative drop as a decimal (0.33 = T30 is 33% lower than baseline). */
  relativeDrop: number;
  /** Raw trailing-30-day volume behind t30Ratio, for the card's volume footer. */
  t30Counts: WindowCounts;
  message: string;
}

/** The value stored in coaching_insights_history.metric (DB check constraint uses these). */
export type StoredMetric = "touch-to-contact" | "contact-to-quote" | "call-to-quote" | "quote-to-app";
export const METRIC_DB_KEY: Record<CoachingMetric, StoredMetric> = {
  touchToContact: "touch-to-contact",
  contactToQuote: "contact-to-quote",
  // Touch -> Quote is the original Call -> Quote metric, so it keeps its original stored key: every
  // acknowledgement already on record for it keeps snoozing exactly as before.
  touchToQuote: "call-to-quote",
  quoteToApp: "quote-to-app",
};

/** Every metric the engine evaluates, in funnel order. */
export const COACHING_METRICS: CoachingMetric[] = ["touchToContact", "contactToQuote", "touchToQuote", "quoteToApp"];

/** Just the columns the snooze check needs from a coaching_insights_history row. */
export interface AcknowledgedRecord {
  producer_id: string;
  metric: string;
  resolved_at: string;
}

/** When an acknowledgement at `resolvedAt` stops suppressing its flag. */
export function snoozeUntil(resolvedAt: string | Date): Date {
  return new Date(new Date(resolvedAt).getTime() + ACK_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Latest still-active snooze for this producer + metric, or null. Active means the acknowledgement
 * is newer than (now - ACK_COOLDOWN_DAYS) - equivalently, snoozeUntil is still in the future. Only
 * the MOST RECENT acknowledgement matters, so re-acknowledging simply restarts the clock.
 */
export function activeSnooze(
  producerId: string,
  metric: CoachingMetric,
  history: AcknowledgedRecord[],
  now: Date = new Date()
): Date | null {
  const key = METRIC_DB_KEY[metric];
  let latest: Date | null = null;
  history.forEach((h) => {
    if (h.producer_id !== producerId || h.metric !== key) return;
    const until = snoozeUntil(h.resolved_at);
    if (Number.isNaN(until.getTime())) return;
    if (until.getTime() > now.getTime() && (!latest || until > latest)) latest = until;
  });
  return latest;
}

const METRIC_LABEL: Record<CoachingMetric, string> = {
  touchToContact: "Touch-to-Contact",
  contactToQuote: "Contact-to-Quote",
  touchToQuote: "Touch-to-Quote",
  quoteToApp: "Quote-to-App",
};

/** The instant separating Baseline (strictly before) from T30 (at or after). One value, used by every query. */
export function getT30Boundary(now: Date = new Date()): Date {
  return new Date(now.getTime() - T30_DAYS * 24 * 60 * 60 * 1000);
}

/** num / den as a decimal, guarded against a zero denominator (0) and capped at 1 (100%). */
const capRatio = (num: number, den: number) => conversionPct(num, den) / 100;

/** Returns the ratio, or null when the window doesn't meet the sample minimums for that metric. */
export function ratioFor(
  metric: CoachingMetric,
  counts: WindowCounts | undefined,
  window: "baseline" | "t30"
): number | null {
  if (!counts) return null;
  const { touches, contacts, quotes, bound } = counts;
  if (metric === "touchToContact") {
    const minTouches = window === "baseline" ? MIN_TOUCHES_FOR_LIVE_RATIO : MIN_T30_TOUCHES;
    // Baseline also needs a real numerator so a producer who only just started logging Contacts
    // (e.g. 2 contacts over hundreds of touches) never produces a bogus "established" baseline.
    const minContacts = window === "baseline" ? MIN_CONTACTS_FOR_BASELINE : 0;
    if (touches < minTouches || contacts < minContacts) return null;
    return capRatio(contacts, touches);
  }
  if (metric === "contactToQuote") {
    const minContacts = window === "baseline" ? MIN_CONTACTS_FOR_BASELINE : MIN_T30_CONTACTS;
    const minQuotes = window === "baseline" ? MIN_QUOTES_FOR_LIVE_RATIO : 0;
    if (contacts < minContacts || quotes < minQuotes) return null;
    return capRatio(quotes, contacts);
  }
  if (metric === "touchToQuote") {
    const minTouches = window === "baseline" ? MIN_TOUCHES_FOR_LIVE_RATIO : MIN_T30_TOUCHES;
    const minQuotes = window === "baseline" ? MIN_QUOTES_FOR_LIVE_RATIO : 0;
    if (touches < minTouches || quotes < minQuotes) return null;
    return capRatio(quotes, touches);
  }
  const minQuotes = window === "baseline" ? MIN_QUOTES_FOR_LIVE_RATIO : MIN_T30_QUOTES;
  if (quotes < minQuotes) return null;
  // A baseline with zero bound apps isn't an "established" close rate to drop from.
  if (window === "baseline" && bound <= 0) return null;
  return capRatio(bound, quotes);
}

/** Shared by the sentence below and the card UI so both always show identical numbers. */
export const formatPct = (r: number) => `${(r * 100).toFixed(r < 0.1 ? 1 : 0)}%`;
const pct = formatPct;

export interface SnoozedFlag {
  flag: CoachingInsightFlag;
  snoozedUntil: Date;
}

export interface CoachingInsightsResult {
  /** Live flags the manager should see. */
  flags: CoachingInsightFlag[];
  /** Flags that WOULD have fired but are inside an acknowledgement's cooldown (hidden from the cards). */
  snoozed: SnoozedFlag[];
}

export function computeCoachingInsights(
  producers: { id: string; first_name?: string | null; last_name?: string | null }[],
  baseline: Record<string, WindowCounts | undefined>,
  t30: Record<string, WindowCounts | undefined>,
  history: AcknowledgedRecord[] = [],
  now: Date = new Date()
): CoachingInsightsResult {
  const flags: CoachingInsightFlag[] = [];
  const snoozed: SnoozedFlag[] = [];

  producers.forEach((p) => {
    const first = (p.first_name || "").trim() || "This producer";
    const fullName = `${(p.first_name || "").trim()} ${(p.last_name || "").trim()}`.trim() || "Unnamed producer";

    COACHING_METRICS.forEach((metric) => {
      const base = ratioFor(metric, baseline[p.id], "baseline");
      const recent = ratioFor(metric, t30[p.id], "t30");
      if (base === null || recent === null || base <= 0) return;

      const relativeDrop = (base - recent) / base;
      if (relativeDrop > RELATIVE_DROP_THRESHOLD) {
        const flag: CoachingInsightFlag = {
          id: `${p.id}:${metric}`,
          producerId: p.id,
          producerName: fullName,
          metric,
          metricLabel: METRIC_LABEL[metric],
          t30Ratio: recent,
          baselineRatio: base,
          relativeDrop,
          t30Counts: { ...(t30[p.id] as WindowCounts) },
          message: `${first}'s ${METRIC_LABEL[metric]} ratio dropped to ${pct(recent)} over the last 30 days, compared to a historical baseline of ${pct(base)}.`,
        };
        // Suppression: acknowledged within the cooldown -> not shown (but remembered, so the UI can say so).
        const until = activeSnooze(p.id, metric, history, now);
        if (until) snoozed.push({ flag, snoozedUntil: until });
        else flags.push(flag);
      }
    });
  });

  // Worst slide first.
  return { flags: flags.sort((a, b) => b.relativeDrop - a.relativeDrop), snoozed };
}
