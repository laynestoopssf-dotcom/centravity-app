// Shared math for the Coaching Suite's "1-on-1 Snapshot" (app/dashboard/coaching/page.tsx).
// -----------------------------------------------------------------------------
// Deliberately reuses fields that already exist elsewhere rather than re-deriving a parallel
// set of formulas that could drift from what the rest of the app shows:
//   - AEC rate is read directly off the producer's office (offices.current_vc_rate, same field
//     RevenueTab.tsx/the Cockpit read) - AEC itself is a single blended AGENCY/office rate, not
//     something computed per-producer, so this is that same rate plus this producer's own YTD
//     contribution toward it, not a separate "personal AEC %" that doesn't exist in the data model.
//   - Net lapse rate is read off the SAME office/agency-level `ytd_lapse_cancel_rate` fields
//     Settings -> Office Locations already collects - there is no per-producer lapse tracking in
//     this schema, so this is explicitly the office's (or agency's, if no office match) rate, not
//     a fabricated personal one. The snapshot UI labels it accordingly.
//   - Daily quoting target is simply `profiles.daily_target_quotes`, the exact field Settings ->
//     Team already sets per producer.
import { resolveParentLine } from "./productLines";

export interface CoachingSnapshot {
  ytdPremium: number;
  ytdApps: number;
  dailyQuoteTarget: number;
  aecRate: number;
  aecContributionApps: number; // this producer's own YTD Auto+Fire bound/issued app count
  aecContributionFsCommission: number; // proxy: Life+Health YTD premium (not a full commission-rate run)
  netLapseRate: number; // office-level (fallback: agency-level) - see header comment
  closeRateRecent: number; // last 7 days quote->bind %
  closeRate30: number; // trailing 30 days quote->bind %
}

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function boundDate(pol: any): Date {
  return new Date(pol.bound_at || pol.written_at || pol.logged_at);
}

export function computeCoachingSnapshot(
  producer: any,
  policies: any[],
  office: any | null,
  agency: any | null,
  customProductLines: any[] = []
): CoachingSnapshot {
  const now = new Date();
  const currentYear = now.getFullYear();
  const producerId = producer?.id;
  const producerPolicies = (policies || []).filter((p: any) => p.user_id === producerId);

  let ytdPremium = 0;
  let ytdApps = 0;
  let aecContributionApps = 0;
  let aecContributionFsCommission = 0;

  producerPolicies.forEach((p: any) => {
    if (!(p.status === "bound" || p.status === "issued")) return;
    const d = boundDate(p);
    if (d.getFullYear() !== currentYear) return;
    const prem = num(p.premium_amount);
    ytdPremium += prem;
    ytdApps += 1;
    const parent = resolveParentLine(p.product_line, customProductLines);
    if (parent === "Auto" || parent === "Fire") aecContributionApps += 1;
    if (parent === "Life" || parent === "Health") aecContributionFsCommission += prem;
  });

  const rangeCloseRate = (days: number): number => {
    const floor = new Date(now);
    floor.setDate(floor.getDate() - days);
    const quoted = producerPolicies.filter((p: any) => new Date(p.logged_at) >= floor).length;
    const bound = producerPolicies.filter((p: any) => (p.status === "bound" || p.status === "issued") && boundDate(p) >= floor).length;
    return quoted > 0 ? (bound / quoted) * 100 : 0;
  };

  return {
    ytdPremium,
    ytdApps,
    dailyQuoteTarget: num(producer?.daily_target_quotes),
    aecRate: num(office?.current_vc_rate, num(agency?.current_vc_rate)),
    aecContributionApps,
    aecContributionFsCommission,
    netLapseRate: num(office?.ytd_lapse_cancel_rate, num(agency?.ytd_lapse_cancel_rate)),
    closeRateRecent: rangeCloseRate(7),
    closeRate30: rangeCloseRate(30),
  };
}
