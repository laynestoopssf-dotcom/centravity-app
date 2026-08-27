// Trend Alerts (Feature 4 of the Coaching Suite) - pure functions, no fetching, no React -
// see app/dashboard/coaching/page.tsx for where these render as the red "Suggested Action"
// banner at the top of a producer's 1-on-1 Snapshot.
import { resolveParentLine } from "./productLines";

export interface CoachingAlert {
  id: string;
  message: string;
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function boundDate(pol: any): Date {
  return new Date(pol.bound_at || pol.written_at || pol.logged_at);
}

// Minimum recent-window quote volume before a close-rate comparison is trusted - without this,
// a producer with e.g. 1 quote and 0 binds in the last 7 days shows a "0%" rate that's really
// just too little data, not a real trend, and would fire this alert on almost everyone.
const MIN_RECENT_QUOTES_FOR_CLOSE_RATE_ALERT = 3;
const CLOSE_RATE_DROP_THRESHOLD_POINTS = 15;
const LIFE_QUOTE_LOOKBACK_DAYS = 4;

export function computeTrendAlerts(
  producer: any,
  policies: any[],
  customProductLines: any[] = []
): CoachingAlert[] {
  if (!producer?.id) return [];
  const now = new Date();
  const producerPolicies = (policies || []).filter((p: any) => p.user_id === producer.id);
  const alerts: CoachingAlert[] = [];

  // --- 1. Close rate 15+ points below trailing 30-day average ---
  const floor30 = new Date(now);
  floor30.setDate(floor30.getDate() - 30);
  const floor7 = new Date(now);
  floor7.setDate(floor7.getDate() - 7);

  const quoted30 = producerPolicies.filter((p: any) => new Date(p.logged_at) >= floor30);
  const bound30 = quoted30.filter((p: any) => p.status === "bound" || p.status === "issued").length;
  const closeRate30 = quoted30.length > 0 ? (bound30 / quoted30.length) * 100 : null;

  const quoted7 = producerPolicies.filter((p: any) => new Date(p.logged_at) >= floor7);
  const bound7 = quoted7.filter((p: any) => (p.status === "bound" || p.status === "issued") && boundDate(p) >= floor7).length;
  const closeRate7 = quoted7.length > 0 ? (bound7 / quoted7.length) * 100 : null;

  if (
    closeRate30 !== null &&
    closeRate7 !== null &&
    quoted7.length >= MIN_RECENT_QUOTES_FOR_CLOSE_RATE_ALERT &&
    closeRate30 - closeRate7 >= CLOSE_RATE_DROP_THRESHOLD_POINTS
  ) {
    alerts.push({
      id: "close-rate-drop",
      message: `Close rate has dropped to ${closeRate7.toFixed(0)}% this week, down from a ${closeRate30.toFixed(0)}% 30-day average - a ${(closeRate30 - closeRate7).toFixed(0)}-point drop.`,
    });
  }

  // --- 2. Zero Life quotes in the last N days (only for producers actually tasked with Life) ---
  const isTaskedWithLife = num(producer.annual_target_life_apps) > 0;
  if (isTaskedWithLife) {
    const lifeFloor = new Date(now);
    lifeFloor.setDate(lifeFloor.getDate() - LIFE_QUOTE_LOOKBACK_DAYS);
    const recentLifeQuotes = producerPolicies.filter((p: any) => {
      if (new Date(p.logged_at) < lifeFloor) return false;
      return resolveParentLine(p.product_line, customProductLines) === "Life";
    });
    if (recentLifeQuotes.length === 0) {
      alerts.push({
        id: "no-life-quotes",
        message: `Zero Life quotes logged in the last ${LIFE_QUOTE_LOOKBACK_DAYS} days.`,
      });
    }
  }

  return alerts;
}
