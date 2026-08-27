// Shared math for the Coaching Suite's "1-on-1 Snapshot" (components/CoachingTab.tsx).
// -----------------------------------------------------------------------------
// Deliberately hyper-focused on the PRODUCER's own controllable numbers - no office- or
// agency-blended rates. This used to also surface office-level AEC pacing and office-level net
// lapse rate (offices.current_vc_rate / offices.ytd_lapse_cancel_rate) because there's no true
// per-producer AEC or lapse tracking in this schema, but a blended office number sitting on an
// individual 1-on-1 was actively misleading in a coaching context - a manager needs to know what
// THIS producer controls, not what the whole office/agency is doing. Those two cards were
// removed; everything below is either summed straight off this producer's own `policies` rows
// (filtered to `user_id === producer.id` before any math runs) or their own `activities` rows,
// same scoping.
import { resolveParentLine } from "./productLines";

export interface CoachingSnapshot {
  // --- Individual YTD Premium, split by parent product line ---
  ytdPremiumTotal: number;
  ytdAppsTotal: number;
  ytdPremiumByLine: { auto: number; fire: number; life: number; health: number };

  // --- Pipeline Potential: open (quoted + bound, not yet issued/declined) premium, this producer only ---
  pipelinePotential: number;
  pipelineCount: number;

  // --- Close Rate: individual quote -> bind conversion ---
  closeRate30: number; // trailing 30 days
  closeRateRecent: number; // trailing 7 days

  // --- Daily/Weekly Activity vs. this producer's own benchmarks (profiles.daily_target_*/weekly_target_*) ---
  dailyTouchpoints: number;
  dailyTouchpointTarget: number;
  dailyQuotes: number;
  dailyQuoteTarget: number;
  weeklyTouchpoints: number;
  weeklyTouchpointTarget: number;
  weeklyQuotes: number;
  weeklyQuoteTarget: number;
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function boundDate(pol: any): Date {
  return new Date(pol.bound_at || pol.written_at || pol.logged_at);
}

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfThisWeek(now: Date): Date {
  const d = new Date(now);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function computeCoachingSnapshot(
  producer: any,
  policies: any[],
  activities: any[] = [],
  customProductLines: any[] = []
): CoachingSnapshot {
  const now = new Date();
  const currentYear = now.getFullYear();
  const producerId = producer?.id;
  const producerPolicies = (policies || []).filter((p: any) => p.user_id === producerId);
  const producerActivities = (activities || []).filter((a: any) => a.user_id === producerId);

  let ytdPremiumTotal = 0;
  let ytdAppsTotal = 0;
  const ytdPremiumByLine = { auto: 0, fire: 0, life: 0, health: 0 };

  producerPolicies.forEach((p: any) => {
    if (!(p.status === "bound" || p.status === "issued")) return;
    const d = boundDate(p);
    if (d.getFullYear() !== currentYear) return;
    const prem = num(p.premium_amount);
    ytdPremiumTotal += prem;
    ytdAppsTotal += 1;
    const parent = resolveParentLine(p.product_line, customProductLines);
    if (parent === "Auto") ytdPremiumByLine.auto += prem;
    else if (parent === "Fire") ytdPremiumByLine.fire += prem;
    else if (parent === "Life") ytdPremiumByLine.life += prem;
    else if (parent === "Health") ytdPremiumByLine.health += prem;
  });

  // Pipeline Potential: strictly this producer's own open pipeline (quoted + bound - i.e. not
  // yet issued or declined by underwriting), same statuses the Active Pipeline table treats as
  // "open" (see fetchPipeline's openQuery in app/dashboard/page.tsx).
  const openPolicies = producerPolicies.filter((p: any) => p.status === "quoted" || p.status === "bound");
  const pipelinePotential = openPolicies.reduce((sum: number, p: any) => sum + num(p.premium_amount), 0);
  const pipelineCount = openPolicies.length;

  const rangeCloseRate = (days: number): number => {
    const floor = new Date(now);
    floor.setDate(floor.getDate() - days);
    const quoted = producerPolicies.filter((p: any) => new Date(p.logged_at) >= floor).length;
    const bound = producerPolicies.filter((p: any) => (p.status === "bound" || p.status === "issued") && boundDate(p) >= floor).length;
    return quoted > 0 ? (bound / quoted) * 100 : 0;
  };

  const dayFloor = startOfToday(now);
  const weekFloor = startOfThisWeek(now);
  const countActivity = (type: string, floor: Date) =>
    producerActivities.filter((a: any) => a.activity_type === type && new Date(a.logged_at) >= floor).length;

  return {
    ytdPremiumTotal,
    ytdAppsTotal,
    ytdPremiumByLine,
    pipelinePotential,
    pipelineCount,
    closeRate30: rangeCloseRate(30),
    closeRateRecent: rangeCloseRate(7),
    dailyTouchpoints: countActivity("touchpoint", dayFloor),
    dailyTouchpointTarget: num(producer?.daily_target_touchpoints),
    dailyQuotes: countActivity("quote", dayFloor),
    dailyQuoteTarget: num(producer?.daily_target_quotes),
    weeklyTouchpoints: countActivity("touchpoint", weekFloor),
    weeklyTouchpointTarget: num(producer?.weekly_target_touchpoints),
    weeklyQuotes: countActivity("quote", weekFloor),
    weeklyQuoteTarget: num(producer?.weekly_target_quotes),
  };
}
