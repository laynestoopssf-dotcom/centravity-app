"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  Crosshair,
  Rocket,
  ArrowLeft,
  TrendingUp,
  Sparkles,
  Wallet,
  Target,
  Sliders,
  Trophy,
  Zap,
  Gauge,
  Users,
  Plane,
} from "lucide-react";
import { supabase } from "../../../utils/supabase";
import { resolveParentLine } from "../../../utils/productLines";
import { resolveCommissionRates, getLifeRate, getHealthRate } from "../../../utils/commissionRates";
import { getWorkingDaysRemainingInYear } from "../../../utils/pacing";
import { sumOfficeBookSizes, totalBookPremiumOf } from "../../../utils/officeFields";
import { resolveOfficeRates, calculateEnterpriseRenewalRevenue, calculateNewBusinessRevenue } from "../../../utils/revenueEngine";

// =============================================================================
// Protected route: /dashboard/cockpit — the "Executive Cockpit" What-If Engine.
// -----------------------------------------------------------------------------
// A predictive modeling tool for the agency owner to run reverse-math on their
// goals, driven entirely by the agency's real historical YTD performance:
//   1. VC Tier Sniper       — reverse-math on the SAME Auto/Fire Gain + FS
//                             Commission points formula the Revenue & VC tab
//                             actually uses (calcPoints/vc_min_*/vc_max_* —
//                             see app/dashboard/page.tsx's calculateRev). VC
//                             is a 0–3.0 decimal, never a flat premium tier.
//   2. Cash Flow Architect  — a revenue target auto-distributed across New
//                             Auto/Fire/Life/Health premium sliders using the
//                             agency's own historical product mix, using the
//                             same carrier-accurate commission_rates engine
//                             as the rest of the app for Life/Health (never
//                             touches VC).
//   3. Translation Layer    — each slider's premium converted to required
//                             bound apps via the agency's own historical
//                             average premium/app per line.
//   4. Activity Pacing      — required apps reverse-engineered into required
//                             quotes (via Settings → Conversion Metrics close
//                             rates) and a daily target, both agency-wide and
//                             per producer (weighted by each producer's
//                             historical share of that line's production).
// Self-contained page (own light data fetch + own condensed math), mirroring
// app/dashboard/reveal/page.tsx's pattern.
// =============================================================================

const DEFAULT_PRODUCT_LINES = [
  { name: "Auto", parent: "Auto" },
  { name: "Fire", parent: "Fire" },
  { name: "Commercial", parent: "Commercial" },
  { name: "Life", parent: "Life" },
  { name: "Health", parent: "Health" },
];

type LoadState = "checking" | "loading" | "ready" | "error";
type LineKey = "auto" | "fire" | "life" | "health";
const LINE_KEYS: LineKey[] = ["auto", "fire", "life", "health"];
const LINE_LABELS: Record<LineKey, string> = { auto: "Auto", fire: "Fire", life: "Life", health: "Health" };

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const money = (n: number): string => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v).toLocaleString() : "0";
};

// calcPoints/inversePoints mirror app/dashboard/page.tsx's revenueOverviewData
// calcPoints exactly — the real formula behind current_vc_rate's scorecard.
const calcPoints = (actual: number, min: number, max: number, maxPct: number): number => {
  if (actual <= min) return 0;
  if (actual >= max) return maxPct;
  if (max === min) return 0;
  return ((actual - min) / (max - min)) * maxPct;
};

// Inverse of calcPoints: given a target point value, what raw "actual" value
// (apps or $) produces it.
const actualForPoints = (points: number, min: number, max: number, maxPct: number): number => {
  if (maxPct === 0) return min;
  const clamped = Math.max(0, Math.min(maxPct, points));
  return min + (clamped / maxPct) * (max - min);
};

// Water-fills a point gap across auto/fire/fs proportional to `weights` (the agency's real
// YTD point-earning velocity), capping each bucket at its remaining `caps` (headroom) and
// redistributing any overflow to the still-open buckets — so the suggested path is both
// tailored to how the agency actually earns points AND still respects each bucket's max.
const waterFillAllocate = (
  gap: number,
  weights: { auto: number; fire: number; fs: number },
  caps: { auto: number; fire: number; fs: number }
): { auto: number; fire: number; fs: number } => {
  const keys: Array<"auto" | "fire" | "fs"> = ["auto", "fire", "fs"];
  const alloc = { auto: 0, fire: 0, fs: 0 };
  let remaining = gap;
  let active = new Set(keys.filter((k) => caps[k] > 1e-9));
  // If every open bucket has zero weight (shouldn't normally happen — velocityWeights always
  // sums to 1 — but guard anyway), fall back to an even split so the gap still gets allocated.
  if (active.size > 0 && [...active].every((k) => weights[k] <= 0)) {
    active.forEach((k) => (weights = { ...weights, [k]: 1 }));
  }

  for (let iter = 0; iter < keys.length && remaining > 1e-9 && active.size > 0; iter++) {
    const totalWeight = [...active].reduce((s, k) => s + weights[k], 0);
    if (totalWeight <= 0) break;
    let anyOverflow = false;
    for (const k of Array.from(active)) {
      const proposed = remaining * (weights[k] / totalWeight);
      const room = caps[k] - alloc[k];
      if (proposed >= room - 1e-9) {
        alloc[k] += room;
        remaining -= room;
        active.delete(k);
        anyOverflow = true;
      }
    }
    if (!anyOverflow) {
      const finalTotalWeight = [...active].reduce((s, k) => s + weights[k], 0);
      active.forEach((k) => {
        alloc[k] += remaining * (weights[k] / finalTotalWeight);
      });
      remaining = 0;
    }
  }

  return alloc;
};

interface LineTotals {
  apps: number;
  premium: number;
}
type LineTotalsMap = Record<LineKey, LineTotals>;
const emptyLineTotals = (): LineTotalsMap => ({
  auto: { apps: 0, premium: 0 },
  fire: { apps: 0, premium: 0 },
  life: { apps: 0, premium: 0 },
  health: { apps: 0, premium: 0 },
});

export default function CockpitPage() {
  const router = useRouter();
  const [status, setStatus] = useState<LoadState>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [agencySettings, setAgencySettings] = useState<any>(null);
  const [offices, setOffices] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  // --- Card 1: VC Tier Sniper ---
  const [targetVcInput, setTargetVcInput] = useState<string>("");

  // --- Card 2: Cash Flow Architect ---
  const [targetRevenueInput, setTargetRevenueInput] = useState<string>("");
  const [sliders, setSliders] = useState<Record<LineKey, number>>({ auto: 0, fire: 0, life: 0, health: 0 });
  const hasAutoDistributedOnce = useRef(false);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session?.user?.id) {
        router.replace("/");
        return;
      }

      setStatus("loading");

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (profErr || !prof?.agency_id) {
        console.error("[Cockpit] profile/agency lookup failed", profErr);
        setErrorMsg("We couldn't load your agency data.");
        setStatus("error");
        return;
      }

      const agencyId = prof.agency_id as string;

      const [agencyRes, officesRes, teamRes] = await Promise.all([
        supabase.from("agencies").select("*").eq("id", agencyId).maybeSingle(),
        supabase.from("offices").select("*").eq("agency_id", agencyId),
        supabase.from("profiles").select("*").eq("agency_id", agencyId).eq("is_archived", false),
      ]);

      const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
      const [policiesRes, activitiesRes] = await Promise.all([
        supabase
          .from("policies")
          .select("id, user_id, office_id, status, premium_amount, payment_cycle, product_line, logged_at, written_at, bound_at")
          .eq("agency_id", agencyId)
          .gte("logged_at", startOfYear)
          .limit(20000),
        // Fuels the Activity Pacing Engine's live-calculated close rate (Logged Quotes vs.
        // Bound Apps) for producers with no Settings override — see the producerBreakdown
        // 3-tier fallback below.
        supabase
          .from("activities")
          .select("user_id, activity_type, logged_at")
          .eq("agency_id", agencyId)
          .in("activity_type", ["quote", "complex_res"])
          .gte("logged_at", startOfYear)
          .limit(20000),
      ]);

      if (!mounted) return;

      if (agencyRes.error) {
        console.error("[Cockpit] agency lookup failed", agencyRes.error);
        setErrorMsg("We couldn't load your agency settings.");
        setStatus("error");
        return;
      }
      if (officesRes.error) {
        console.error("[Cockpit] offices lookup failed", officesRes.error);
        setErrorMsg("We couldn't load your office locations.");
        setStatus("error");
        return;
      }
      if (teamRes.error) {
        console.error("[Cockpit] team lookup failed", teamRes.error);
        setErrorMsg("We couldn't load your team roster.");
        setStatus("error");
        return;
      }
      if (policiesRes.error) {
        console.error("[Cockpit] policies lookup failed", policiesRes.error);
        setErrorMsg("We couldn't load your production data.");
        setStatus("error");
        return;
      }
      if (activitiesRes.error) {
        console.error("[Cockpit] activities lookup failed", activitiesRes.error);
        setErrorMsg("We couldn't load your activity data.");
        setStatus("error");
        return;
      }

      setAgencySettings(agencyRes.data || null);
      setOffices(officesRes.data || []);
      setTeam(teamRes.data || []);
      setPolicies(policiesRes.data || []);
      setActivities(activitiesRes.data || []);
      setStatus("ready");
    };

    load().catch((err) => {
      console.error("[Cockpit] unexpected error loading agency data", err);
      if (mounted) {
        setErrorMsg("Something went wrong loading the Cockpit.");
        setStatus("error");
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "SIGNED_OUT" || !sess) router.replace("/");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const model = useMemo(() => {
    if (status !== "ready") return null;

    const linesDict = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, linesDict);
    const commissionRates = resolveCommissionRates(agencySettings?.commission_rates);
    const today = new Date();
    const currentYear = today.getFullYear();
    const globalCloseRate = num(agencySettings?.global_close_rate, 20);
    const productionDaysPerWeek = num(agencySettings?.production_days_per_week, 5);

    // --- 1. Per-member, per-line YTD totals (baseline + real production) ---
    // This is the foundation for: historical product mix (Tweak 2), avg
    // premium/app (Tweak 3), and per-producer pacing shares (Tweak 4).
    const memberTotals = new Map<string, LineTotalsMap>();
    team.forEach((m: any) => {
      const t = emptyLineTotals();
      t.auto.apps += num(m.starting_ytd_auto_apps);
      t.auto.premium += num(m.starting_ytd_auto_premium);
      t.fire.apps += num(m.starting_ytd_fire_apps);
      t.fire.premium += num(m.starting_ytd_fire_premium);
      t.life.apps += num(m.starting_ytd_life_apps);
      t.life.premium += num(m.starting_ytd_life_premium);
      t.health.apps += num(m.starting_ytd_health_apps);
      t.health.premium += num(m.starting_ytd_health_premium);
      memberTotals.set(m.id, t);
    });

    // Commercial has no `starting_ytd_*` baseline (the onboarding wizard never
    // collected one) and isn't part of the Tweak 2/3 mix/sliders — tracked
    // separately here only so "Projected Annual Revenue" stays complete.
    let nbCommPrem = 0;
    policies.forEach((pol: any) => {
      // bound_at (stamped once, the moment status first becomes 'bound') - not raw logged_at,
      // which stays at quote time for an existing quote converted to bound later, and gets
      // re-stamped to "now" on a later bound -> issued transition - is what decides which year
      // this bound/issued app counts toward. Same fix/note as the Scoreboard's boundDate calc in
      // app/dashboard/page.tsx (fetchDashboardData).
      const logDate = new Date(pol.bound_at || pol.written_at || pol.logged_at);
      if (logDate.getFullYear() !== currentYear) return;
      if (!(pol.status === "bound" || pol.status === "issued")) return;
      const parentLine = getParentLine(pol.product_line);
      if (parentLine === "Commercial") {
        nbCommPrem += num(pol.premium_amount);
        return;
      }
      const key: LineKey | null = parentLine === "Auto" ? "auto" : parentLine === "Fire" ? "fire" : parentLine === "Life" ? "life" : parentLine === "Health" ? "health" : null;
      if (!key) return;
      const prem = num(pol.premium_amount);
      let t = memberTotals.get(pol.user_id);
      if (!t) {
        t = emptyLineTotals();
        memberTotals.set(pol.user_id, t);
      }
      t[key].apps += 1;
      t[key].premium += prem;
    });

    // Agency-wide totals across all members (baseline + production).
    const agencyTotals = emptyLineTotals();
    memberTotals.forEach((t) => {
      LINE_KEYS.forEach((k) => {
        agencyTotals[k].apps += t[k].apps;
        agencyTotals[k].premium += t[k].premium;
      });
    });

    // Per-producer YTD logged quotes (activity_type 'quote'/'complex_res') — tier 2 of the
    // Activity Pacing Engine's close-rate fallback chain (Settings override → live YTD rate →
    // agency global_close_rate).
    const memberQuoteCounts = new Map<string, number>();
    activities.forEach((act: any) => {
      const logDate = new Date(act.logged_at);
      if (logDate.getFullYear() !== currentYear) return;
      memberQuoteCounts.set(act.user_id, (memberQuoteCounts.get(act.user_id) || 0) + 1);
    });

    // Average premium/app per line — the "Translation Layer" (Tweak 3).
    const avgPremiumPerApp: Record<LineKey, number | null> = {
      auto: agencyTotals.auto.apps > 0 ? agencyTotals.auto.premium / agencyTotals.auto.apps : null,
      fire: agencyTotals.fire.apps > 0 ? agencyTotals.fire.premium / agencyTotals.fire.apps : null,
      life: agencyTotals.life.apps > 0 ? agencyTotals.life.premium / agencyTotals.life.apps : null,
      health: agencyTotals.health.apps > 0 ? agencyTotals.health.premium / agencyTotals.health.apps : null,
    };

    // Historical product mix (Tweak 2's Auto-Distribution) — each line's
    // share of combined Auto+Fire+Life+Health YTD premium. Falls back to an
    // even split if there's no premium history yet (brand-new agency).
    const mixTotalPremium = agencyTotals.auto.premium + agencyTotals.fire.premium + agencyTotals.life.premium + agencyTotals.health.premium;
    const historicalMix: Record<LineKey, number> =
      mixTotalPremium > 0
        ? {
            auto: agencyTotals.auto.premium / mixTotalPremium,
            fire: agencyTotals.fire.premium / mixTotalPremium,
            life: agencyTotals.life.premium / mixTotalPremium,
            health: agencyTotals.health.premium / mixTotalPremium,
          }
        : { auto: 0.25, fire: 0.25, life: 0.25, health: 0.25 };

    // --- 2. Net Auto/Fire apps (post-lapse) — feeds the REAL VC formula ---
    const startOfYear = new Date(currentYear, 0, 1);
    const daysPassed = Math.max(1, Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)));
    const daysInYear = 365;
    const ytdTimeFraction = daysPassed / daysInYear;

    const avgLapseAuto = offices.length
      ? offices.reduce((s: number, o: any) => s + num(o.ytd_lapse_cancel_auto, num(agencySettings?.ytd_lapse_cancel_auto)), 0) / offices.length
      : num(agencySettings?.ytd_lapse_cancel_auto);
    const avgLapseFire = offices.length
      ? offices.reduce((s: number, o: any) => s + num(o.ytd_lapse_cancel_fire, num(agencySettings?.ytd_lapse_cancel_fire)), 0) / offices.length
      : num(agencySettings?.ytd_lapse_cancel_fire);
    const priorPifAuto = offices.reduce((s: number, o: any) => s + num(o.prior_pif_auto), 0);
    const priorPifFire = offices.reduce((s: number, o: any) => s + num(o.prior_pif_fire), 0);
    const lostAuto = priorPifAuto * (avgLapseAuto / 100) * ytdTimeFraction;
    const lostFire = priorPifFire * (avgLapseFire / 100) * ytdTimeFraction;
    const netAutoApps = Math.round(agencyTotals.auto.apps - lostAuto);
    const netFireApps = Math.round(agencyTotals.fire.apps - lostFire);

    // --- 3. The REAL VC points formula (Auto Gain + Fire Gain + FS Comm) ---
    // Exactly mirrors app/dashboard/page.tsx revenueOverviewData.calculateRev.
    // IMPORTANT: vc_min_*/vc_max_*/current_vc_rate/base_comm_* are per-office settings —
    // Settings → Office Locations writes them onto `offices`, never onto `agencies`. Reading
    // straight off agencySettings (as this used to) meant these were almost always undefined
    // or a stale onboarding-time snapshot, producing wildly wrong VC gain % and a Projected
    // Revenue that could never match the Revenue & VC dashboard. Fall back to the primary
    // office's live values first, exactly like Reveal's identical primaryOffice convention.
    const primaryOffice = offices[0] || null;
    const vcMinAuto = num(primaryOffice?.vc_min_auto_gain, num(agencySettings?.vc_min_auto_gain, 0));
    const vcMaxAuto = num(primaryOffice?.vc_max_auto_gain, num(agencySettings?.vc_max_auto_gain, 100));
    const vcMinFire = num(primaryOffice?.vc_min_fire_gain, num(agencySettings?.vc_min_fire_gain, 0));
    const vcMaxFire = num(primaryOffice?.vc_max_fire_gain, num(agencySettings?.vc_max_fire_gain, 100));
    const vcMinFs = num(primaryOffice?.vc_min_fs_comm, num(agencySettings?.vc_min_fs_comm, 0));
    const vcMaxFs = num(primaryOffice?.vc_max_fs_comm, num(agencySettings?.vc_max_fs_comm, 10000));

    const bLifeAgency = num(primaryOffice?.base_comm_life, num(agencySettings?.base_comm_life, 20)) / 100;
    const bHealthAgency = num(primaryOffice?.base_comm_health, num(agencySettings?.base_comm_health, 20)) / 100;
    const ytdFsComm = agencyTotals.life.premium * bLifeAgency + agencyTotals.health.premium * bHealthAgency;

    const autoVcPts = calcPoints(netAutoApps, vcMinAuto, vcMaxAuto, 1.0);
    const fireVcPts = calcPoints(netFireApps, vcMinFire, vcMaxFire, 1.0);
    const fsVcPts = calcPoints(ytdFsComm, vcMinFs, vcMaxFs, 2.0);
    const currentVcTotal = Math.min(3.0, autoVcPts + fireVcPts + fsVcPts);

    // Tailored blended pathing: weight the VC Tier Sniper's suggested path by how the agency
    // has ACTUALLY been earning points YTD (Auto/Fire/FS Comm ratio), not an even/headroom-only
    // split — an agency that earns points primarily via P&C gain should see the gap pushed
    // toward more Auto/Fire apps, not an unrealistic FS commission ask. Falls back to an even
    // split only for a brand-new agency with zero points earned yet.
    const totalPtsSoFar = autoVcPts + fireVcPts + fsVcPts;
    const velocityWeights =
      totalPtsSoFar > 0
        ? { auto: autoVcPts / totalPtsSoFar, fire: fireVcPts / totalPtsSoFar, fs: fsVcPts / totalPtsSoFar }
        : { auto: 1 / 3, fire: 1 / 3, fs: 1 / 3 };

    // --- 4. Projected annual revenue (for the Cash Flow Architect) — delegates to the
    // same shared formula the main dashboard and Reveal use (utils/revenueEngine.ts /
    // officeFields.ts), so this can never silently drift from those pages' math.
    const bookSizeSummed = sumOfficeBookSizes(offices);
    const bookSize = {
      auto: bookSizeSummed.book_size_auto,
      fire: bookSizeSummed.book_size_fire,
      commercial: bookSizeSummed.book_size_commercial,
      life: bookSizeSummed.book_size_life,
      health: bookSizeSummed.book_size_health,
    };

    // Cockpit is always Enterprise-wide, but current_vc_rate/base_comm_auto/base_comm_fire
    // are per-office settings — pass primaryOffice (not null) so resolveOfficeRates() picks
    // up the live, actually-edited values instead of degrading straight to the stale/unset
    // agency-wide columns. Same primaryOffice convention as Reveal, so both baselines match.
    const { vcRate: vcRateDecimal, bAuto: bAutoAgency, bFire: bFireAgency } = resolveOfficeRates(primaryOffice, agencySettings);
    const vcRateAgency = vcRateDecimal * 100;

    const { totalRenRev, pncRenRev, lifeHealthRenRev } = calculateEnterpriseRenewalRevenue(offices, agencySettings, commissionRates, ytdTimeFraction);

    const { totalNbRev, pncNbRev, lifeHealthNbRev } = calculateNewBusinessRevenue(
      {
        autoPremium: agencyTotals.auto.premium,
        firePremium: agencyTotals.fire.premium,
        commercialPremium: nbCommPrem,
        lifePremium: agencyTotals.life.premium,
        healthPremium: agencyTotals.health.premium,
      },
      primaryOffice,
      agencySettings,
      commissionRates
    );
    const projectedAnnualRevenue = totalNbRev + totalRenRev;

    // Slider reverse-math rates — Life/Health use the carrier table's
    // new-business rate (never VC); Auto/Fire use base + current VC rate.
    const sliderRates: Record<LineKey, number> = {
      auto: bAutoAgency + vcRateDecimal,
      fire: bFireAgency + vcRateDecimal,
      life: getLifeRate(commissionRates, "new_business"),
      health: getHealthRate(commissionRates, "new_business"),
    };

    // --- 5. Travel & Incentive Qualifier baseline — mirrors app/dashboard/page.tsx's
    // calculateStats() travel-credit logic exactly (same proration rules for monthly-pay
    // policies, same issued-vs-bound/quoted split), so the Cockpit's qualification tier and
    // "real" pipeline numbers can never drift from what the YTD Projections tab shows. The
    // What-If layer (Cash Flow Architect sliders) is blended in below, outside this useMemo,
    // since it needs to react instantly as the user drags a slider.
    const currentMonthRemaining = 12 - today.getMonth();
    let issuedLifeCred = 0;
    let carryOverCred = 0;
    let pendingLifeCred = 0;
    let pendingCarryOver = 0;
    let pendingLifeApps = 0;
    let issuedHealthCred = 0;
    let pendingHealthCred = 0;
    policies.forEach((pol) => {
      // Same bound_at fallback as the Commercial-premium loop above - quoted rows have no
      // bound_at yet, so this naturally falls back to written_at (their quote date), unchanged
      // from before; bound/issued rows now key off their real bind date.
      const logDate = new Date(pol.bound_at || pol.written_at || pol.logged_at);
      if (logDate.getFullYear() !== currentYear) return;
      const prem = num(pol.premium_amount);
      const isAnnual = pol.payment_cycle === "annual";
      const parentLine = getParentLine(pol.product_line);
      if (parentLine === "Life") {
        let earnedThisYear = 0;
        let carryOver = 0;
        if (pol.status === "issued") {
          if (isAnnual) {
            earnedThisYear = prem;
          } else {
            earnedThisYear = (prem / 12) * (12 - logDate.getMonth());
            carryOver = prem - earnedThisYear;
          }
          issuedLifeCred += earnedThisYear;
          carryOverCred += carryOver;
        } else if (pol.status === "bound" || pol.status === "quoted") {
          if (pol.status !== "quoted") pendingLifeApps++;
          if (isAnnual) {
            earnedThisYear = prem;
          } else {
            earnedThisYear = (prem / 12) * currentMonthRemaining;
            carryOver = prem - earnedThisYear;
          }
          pendingLifeCred += earnedThisYear;
          pendingCarryOver += carryOver;
        }
      } else if (parentLine === "Health") {
        if (pol.status === "issued") issuedHealthCred += prem;
        else if (pol.status === "bound" || pol.status === "quoted") pendingHealthCred += prem;
      }
    });

    // Baseline (onboarding starting_ytd_*) Life/Health premium is already-earned credit, same
    // treatment as the dashboard's calculateStats() baseline blend.
    const baselineLifePremium = team.reduce((s: number, m) => s + num(m.starting_ytd_life_premium), 0);
    const baselineHealthPremium = team.reduce((s: number, m) => s + num(m.starting_ytd_health_premium), 0);
    issuedLifeCred += baselineLifePremium;
    issuedHealthCred += baselineHealthPremium;

    // No hardcoded sample-program fallbacks here (previously 70 apps/$41,300/etc., one specific
    // carrier's real numbers baked in as defaults) - an agency that hasn't configured its own
    // Travel benchmarks in Settings gets a hard 0 threshold per tier, not someone else's program.
    const travelTiers = [
      { name: "Level 1", apps: num(agencySettings?.travel_lvl1_apps), lifeCred: num(agencySettings?.travel_lvl1_life_cred), totalCred: num(agencySettings?.travel_lvl1_total_cred) },
      { name: "Level 2", apps: num(agencySettings?.travel_lvl2_apps), lifeCred: num(agencySettings?.travel_lvl2_life_cred), totalCred: num(agencySettings?.travel_lvl2_total_cred) },
      { name: "Level 3", apps: num(agencySettings?.travel_lvl3_apps), lifeCred: num(agencySettings?.travel_lvl3_life_cred), totalCred: num(agencySettings?.travel_lvl3_total_cred) },
      { name: "Exotic", apps: num(agencySettings?.travel_exotic_apps), lifeCred: num(agencySettings?.travel_exotic_life_cred), totalCred: num(agencySettings?.travel_exotic_total_cred) },
      { name: "Exotic Plus", apps: num(agencySettings?.travel_exotic_plus_apps), lifeCred: num(agencySettings?.travel_exotic_plus_life_cred), totalCred: num(agencySettings?.travel_exotic_plus_total_cred) },
    ];

    // Qualification is strictly REAL production (issued credit, bound+issued gross apps) —
    // exactly like the dashboard — never influenced by the hypothetical What-If sliders.
    let travelTierIndex = -1;
    for (let i = 0; i < travelTiers.length; i++) {
      if (agencyTotals.life.apps >= travelTiers[i].apps && issuedLifeCred >= travelTiers[i].lifeCred && issuedLifeCred + issuedHealthCred >= travelTiers[i].totalCred) {
        travelTierIndex = i;
      }
    }
    const travelTargetTierIndex = travelTierIndex < travelTiers.length - 1 ? travelTierIndex + 1 : travelTiers.length - 1;

    return {
      memberTotals,
      memberQuoteCounts,
      agencyTotals,
      avgPremiumPerApp,
      historicalMix,
      netAutoApps,
      netFireApps,
      velocityWeights,
      vcMinAuto,
      vcMaxAuto,
      vcMinFire,
      vcMaxFire,
      vcMinFs,
      vcMaxFs,
      ytdFsComm,
      autoVcPts,
      fireVcPts,
      fsVcPts,
      currentVcTotal,
      bookSize,
      totalBookPremium: bookSize.auto + bookSize.fire + bookSize.commercial + bookSize.life + bookSize.health,
      projectedAnnualRevenue,
      totalNbRev,
      pncNbRev,
      lifeHealthNbRev,
      totalRenRev,
      pncRenRev,
      lifeHealthRenRev,
      vcRateAgency,
      sliderRates,
      globalCloseRate,
      productionDaysPerWeek,
      travelTiers,
      travelTierIndex,
      travelTargetTierIndex,
      issuedLifeApps: agencyTotals.life.apps,
      pendingLifeApps,
      issuedLifeCred,
      pendingLifeCred,
      issuedHealthCred,
      pendingHealthCred,
      carryOverCred,
      pendingCarryOver,
    };
  }, [status, agencySettings, offices, team, policies, activities]);

  // Default the target VC input to the next reasonable milestone above where the agency stands today.
  useEffect(() => {
    if (!model || targetVcInput !== "") return;
    setTargetVcInput((Math.min(3, Math.round((model.currentVcTotal + 0.5) * 10) / 10)).toFixed(1));
  }, [model, targetVcInput]);

  // Default + auto-distribute the target revenue once the model is ready (Tweak 2: "initially
  // auto-distribute"). IMPORTANT: historicalMix is a REVENUE-dollar mix, but sliders are
  // PREMIUM-dollar values converted to revenue at each line's own commission rate (which
  // differs — P&C's base+VC rate vs. Life/Health's carrier rate). Splitting the gap by mix and
  // handing each line the raw dollars as premium (the old behavior) under/over-shot the gap
  // once each line's differing rate was applied. Instead: split the gap by mix IN REVENUE
  // terms, then convert each line's revenue share back to premium via ITS OWN rate — so
  // fills[k] = sliders[k] * sliderRates[k] reconstructs exactly the intended revenue share,
  // and the sum across all four lines is always exactly 100% of the gap.
  const distributeSliders = (targetRevenue: number) => {
    if (!model) return;
    const gap = Math.max(0, targetRevenue - model.projectedAnnualRevenue);
    const revenueShare: Record<LineKey, number> = {
      auto: gap * model.historicalMix.auto,
      fire: gap * model.historicalMix.fire,
      life: gap * model.historicalMix.life,
      health: gap * model.historicalMix.health,
    };
    setSliders({
      auto: model.sliderRates.auto > 0 ? revenueShare.auto / model.sliderRates.auto : 0,
      fire: model.sliderRates.fire > 0 ? revenueShare.fire / model.sliderRates.fire : 0,
      life: model.sliderRates.life > 0 ? revenueShare.life / model.sliderRates.life : 0,
      health: model.sliderRates.health > 0 ? revenueShare.health / model.sliderRates.health : 0,
    });
  };

  useEffect(() => {
    if (!model || hasAutoDistributedOnce.current) return;
    hasAutoDistributedOnce.current = true;
    const defaultTarget = Math.round(model.projectedAnnualRevenue * 1.2);
    setTargetRevenueInput(String(defaultTarget));
    distributeSliders(defaultTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  if (status === "checking" || status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4">
        <Loader2 className="h-10 w-10 animate-spin text-cyan-400" aria-hidden="true" />
        <p className="mt-6 text-sm font-semibold text-slate-400">Booting up the Cockpit…</p>
      </div>
    );
  }

  if (status === "error" || !model) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 px-4 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" aria-hidden="true" />
        <p className="max-w-md text-sm font-semibold text-slate-400">{errorMsg || "We couldn't load the Cockpit."}</p>
        <button
          onClick={() => router.replace("/dashboard")}
          className="mt-2 rounded-xl bg-cyan-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-cyan-500"
        >
          Back To Dashboard
        </button>
      </div>
    );
  }

  const { workingDaysRemaining, weeksRemaining, monthsRemaining } = getWorkingDaysRemainingInYear(model.productionDaysPerWeek);

  // --- VC Tier Sniper reverse-math ---
  const targetVc = Math.max(0, num(targetVcInput, model.currentVcTotal));
  const rawGapPts = Math.max(0, targetVc - model.currentVcTotal);
  const headroomAuto = Math.max(0, 1.0 - model.autoVcPts);
  const headroomFire = Math.max(0, 1.0 - model.fireVcPts);
  const headroomFs = Math.max(0, 2.0 - model.fsVcPts);
  const totalHeadroom = headroomAuto + headroomFire + headroomFs;
  const gapPts = Math.min(rawGapPts, totalHeadroom);
  const isMaxedOut = rawGapPts > totalHeadroom + 0.0001;
  // Tailored blended pathing: weight by the agency's real YTD point velocity (model.velocityWeights),
  // water-filled against each bucket's remaining headroom — see waterFillAllocate above.
  const { auto: allocAuto, fire: allocFire, fs: allocFs } = waterFillAllocate(
    gapPts,
    model.velocityWeights,
    { auto: headroomAuto, fire: headroomFire, fs: headroomFs }
  );

  const newAutoApps = actualForPoints(model.autoVcPts + allocAuto, model.vcMinAuto, model.vcMaxAuto, 1.0);
  const newFireApps = actualForPoints(model.fireVcPts + allocFire, model.vcMinFire, model.vcMaxFire, 1.0);
  const newFsComm = actualForPoints(model.fsVcPts + allocFs, model.vcMinFs, model.vcMaxFs, 2.0);
  const additionalAutoApps = Math.max(0, Math.ceil(newAutoApps - model.netAutoApps));
  const additionalFireApps = Math.max(0, Math.ceil(newFireApps - model.netFireApps));
  const additionalFsComm = Math.max(0, newFsComm - model.ytdFsComm);
  const additionalAutoPremium = model.avgPremiumPerApp.auto ? additionalAutoApps * model.avgPremiumPerApp.auto : null;
  const additionalFirePremium = model.avgPremiumPerApp.fire ? additionalFireApps * model.avgPremiumPerApp.fire : null;

  const alreadyHitTarget = rawGapPts === 0;

  // --- Cash Flow Architect ---
  const targetRevenue = num(targetRevenueInput, model.projectedAnnualRevenue);
  const revenueGap = Math.max(0, targetRevenue - model.projectedAnnualRevenue);
  const fills: Record<LineKey, number> = {
    auto: sliders.auto * model.sliderRates.auto,
    fire: sliders.fire * model.sliderRates.fire,
    life: sliders.life * model.sliderRates.life,
    health: sliders.health * model.sliderRates.health,
  };
  const totalFill = fills.auto + fills.fire + fills.life + fills.health;
  const remainingGapAfterSliders = Math.max(0, revenueGap - totalFill);
  const fillPct = revenueGap > 0 ? Math.min(100, (totalFill / revenueGap) * 100) : 100;
  // Sliders hold PREMIUM dollars (revenue / rate), which can run well above the revenue gap
  // itself once divided by a line's own rate (e.g. a 9% P&C rate inflates premium ~11x vs.
  // revenue) — each line gets its own ceiling sized off the FULL revenue gap converted through
  // ITS OWN rate (with generous 1.5x headroom), not the raw revenue gap in dollars.
  //
  // BUG FIX: this used to derive `max` from `Math.max(sliders.auto, sliders.fire, ...)` — i.e.
  // the CURRENTLY DRAGGED value of whichever slider was highest, shared across all four inputs.
  // That created a feedback loop: dragging a slider raised its own value, which raised the
  // shared max, which shifted the value/max ratio the browser uses to place the thumb — so the
  // handle would jump/stutter mid-drag instead of tracking the cursor, and moving ONE slider
  // could visibly shift the other three (since they all shared that same live-computed max).
  // Deriving the ceiling from `revenueGap` (only changes when the Target Revenue input changes)
  // and each line's own static rate keeps every slider's scale fixed while the user is dragging.
  const sliderMaxFor = (k: LineKey) => {
    const rate = model.sliderRates[k];
    const gapBasedCeiling = rate > 0 ? (revenueGap / rate) * 1.5 : 0;
    return Math.max(Math.round(gapBasedCeiling), 100000);
  };

  // --- Translation Layer: premium → required apps (Tweak 3) ---
  const requiredApps: Record<LineKey, number | null> = {
    auto: model.avgPremiumPerApp.auto ? Math.ceil(sliders.auto / model.avgPremiumPerApp.auto) : null,
    fire: model.avgPremiumPerApp.fire ? Math.ceil(sliders.fire / model.avgPremiumPerApp.fire) : null,
    life: model.avgPremiumPerApp.life ? Math.ceil(sliders.life / model.avgPremiumPerApp.life) : null,
    health: model.avgPremiumPerApp.health ? Math.ceil(sliders.health / model.avgPremiumPerApp.health) : null,
  };

  // --- Activity Pacing Engine (Tweak 4): required apps → required quotes → daily target ---
  const globalCloseRateDecimal = model.globalCloseRate / 100;
  const canPace = globalCloseRateDecimal > 0 && workingDaysRemaining > 0;
  const globalDailyTargets: Record<LineKey, number | null> = {
    auto: requiredApps.auto !== null && canPace ? Math.ceil(requiredApps.auto / globalCloseRateDecimal / workingDaysRemaining) : null,
    fire: requiredApps.fire !== null && canPace ? Math.ceil(requiredApps.fire / globalCloseRateDecimal / workingDaysRemaining) : null,
    life: requiredApps.life !== null && canPace ? Math.ceil(requiredApps.life / globalCloseRateDecimal / workingDaysRemaining) : null,
    health: requiredApps.health !== null && canPace ? Math.ceil(requiredApps.health / globalCloseRateDecimal / workingDaysRemaining) : null,
  };

  // 3-tier close-rate fallback: Settings override (profiles.close_rate) → live-calculated YTD
  // rate (logged quotes vs. bound apps, from model.memberQuoteCounts/memberTotals) →
  // agencies.global_close_rate. Each producer's daily quote target below always uses this
  // resolved rate, not a flat agency-wide number.
  const resolveProducerCloseRate = (m: any): { pct: number; source: "override" | "live" | "global" } => {
    if (m.close_rate !== null && m.close_rate !== undefined && m.close_rate !== "") {
      const v = num(m.close_rate, model.globalCloseRate);
      return { pct: v, source: "override" };
    }
    const memberQuotes = model.memberQuoteCounts.get(m.id) ?? 0;
    if (memberQuotes > 0) {
      const memberBoundApps = LINE_KEYS.reduce((sum, k) => sum + (model.memberTotals.get(m.id)?.[k]?.apps ?? 0), 0);
      return { pct: (memberBoundApps / memberQuotes) * 100, source: "live" };
    }
    return { pct: model.globalCloseRate, source: "global" };
  };

  const producerBreakdown = team.map((m: any) => {
    const resolved = resolveProducerCloseRate(m);
    const closeRate = resolved.pct / 100;
    const perLine: Record<LineKey, number | null> = { auto: null, fire: null, life: null, health: null };
    LINE_KEYS.forEach((k) => {
      const reqApps = requiredApps[k];
      if (reqApps === null || workingDaysRemaining <= 0) return;
      const lineTotalApps = model.agencyTotals[k].apps;
      const memberLineApps = model.memberTotals.get(m.id)?.[k]?.apps ?? 0;
      const share = lineTotalApps > 0 ? memberLineApps / lineTotalApps : 1 / Math.max(1, team.length);
      const memberRequiredApps = reqApps * share;
      const memberRequiredQuotes = closeRate > 0 ? memberRequiredApps / closeRate : 0;
      perLine[k] = Math.ceil(memberRequiredQuotes / workingDaysRemaining);
    });
    return { id: m.id, name: `${m.first_name} ${m.last_name}`, closeRatePct: resolved.pct, closeRateSource: resolved.source, perLine };
  });

  // --- Travel & Incentive Qualifier: blend the real baseline (issued + real pipeline, from
  // model's dashboard-mirrored travel math) with the Cash Flow Architect's hypothetical
  // sliders, so this recalculates live as the user models "what if I write $X more" scenarios.
  // Qualification tier itself (travelTierIndex/travelTargetTierIndex) is always real-only —
  // only the progress bars/gap-to-close react to the sliders.
  const travelTargetTier = model.travelTiers[model.travelTargetTierIndex];
  const travelCurrentTierName = model.travelTierIndex >= 0 ? model.travelTiers[model.travelTierIndex].name : "Unqualified";
  const travelMaxedOut = model.travelTierIndex === model.travelTiers.length - 1;
  const travelWhatIfLifeApps = model.avgPremiumPerApp.life ? sliders.life / model.avgPremiumPerApp.life : 0;

  const travelMetrics = (
    [
      {
        key: "apps" as const,
        label: "Life Apps",
        current: model.issuedLifeApps + model.pendingLifeApps,
        gain: travelWhatIfLifeApps,
        target: travelTargetTier.apps,
        format: "apps" as const,
      },
      {
        key: "lifeCred" as const,
        label: "Life Credit",
        current: model.issuedLifeCred + model.pendingLifeCred,
        gain: sliders.life,
        target: travelTargetTier.lifeCred,
        format: "money" as const,
      },
      {
        key: "totalCred" as const,
        label: "Total Credit (Life + Health)",
        current: model.issuedLifeCred + model.pendingLifeCred + model.issuedHealthCred + model.pendingHealthCred,
        gain: sliders.life + sliders.health,
        target: travelTargetTier.totalCred,
        format: "money" as const,
      },
    ]
  ).map((m) => {
    const projected = m.current + m.gain;
    const progressReal = m.target > 0 ? Math.min(100, (m.current / m.target) * 100) : 100;
    const progressProjected = m.target > 0 ? Math.min(100, (projected / m.target) * 100) : 100;
    const gapProjected = Math.max(0, m.target - projected);
    return { ...m, projected, progressReal, progressProjected, gapProjected };
  });

  // The bottleneck — whichever metric is furthest from its target even after the What-If
  // gain — is the true rate-limiter for reaching the next tier, and drives the pacing line.
  const travelBottleneck = travelMetrics.reduce((worst, m) => (m.progressProjected < worst.progressProjected ? m : worst), travelMetrics[0]);
  const travelFullyQualifiedWithWhatIf = travelMetrics.every((m) => m.gapProjected <= 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 py-10 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors mb-3"
            >
              <ArrowLeft size={14} /> Back To Dashboard
            </button>
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-cyan-400 mb-3">
              <Crosshair size={14} /> Executive Cockpit
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white">The What-If Engine</h1>
            <p className="text-slate-500 mt-2 max-w-xl">
              Run reverse-math on your goals — pick a VC tier or a revenue target, and see exactly what it takes to
              get there, built from your actual YTD performance.
            </p>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* LEFT COLUMN: VC Tier Sniper stacked above the Travel & Incentive Qualifier, so this
              column's total height balances against the taller Cash Flow Architect on the right. */}
          <div className="flex flex-col gap-6">
          {/* Corporate Targets toggles (Settings -> Corporate Targets, agencies.target_vc_active /
              target_travel_active) - default off for carrier-agnostic compliance. */}
          {!agencySettings?.target_vc_active && !agencySettings?.target_travel_active && (
            <div className="bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl p-10 text-center">
              <p className="text-sm font-semibold text-slate-500">VC and Travel Target Tracking are currently disabled for this agency.</p>
              <p className="text-xs text-slate-600 mt-1">An owner can turn them on under Settings → Corporate Targets.</p>
            </div>
          )}

          {/* ============================= CARD 1: VC TIER SNIPER ============================= */}
          {agencySettings?.target_vc_active && (
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl border border-cyan-900/50 shadow-[0_0_40px_-15px_rgba(34,211,238,0.3)] p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-cyan-500/10 text-cyan-400 rounded-xl">
                <Crosshair size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">VC Tier Sniper</h2>
                <p className="text-xs text-slate-500">Auto/Fire Gain + FS Commission → your Variable Comp rate</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Auto Gain</p>
                <p className="text-xl font-black text-white">{model.autoVcPts.toFixed(2)}<span className="text-xs text-slate-500"> / 1.0</span></p>
                <p className="text-[10px] text-slate-500 mt-0.5">{model.netAutoApps} net apps</p>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Fire Gain</p>
                <p className="text-xl font-black text-white">{model.fireVcPts.toFixed(2)}<span className="text-xs text-slate-500"> / 1.0</span></p>
                <p className="text-[10px] text-slate-500 mt-0.5">{model.netFireApps} net apps</p>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-3.5 border border-slate-800">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">FS Comm</p>
                <p className="text-xl font-black text-white">{model.fsVcPts.toFixed(2)}<span className="text-xs text-slate-500"> / 2.0</span></p>
                <p className="text-[10px] text-slate-500 mt-0.5">${money(model.ytdFsComm)}</p>
              </div>
            </div>

            <div className="bg-slate-900/80 rounded-xl border border-cyan-900/40 p-4 mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mb-1">Current VC Rate</p>
                <p className="text-3xl font-black text-white">{model.currentVcTotal.toFixed(2)}%</p>
              </div>
              <div className="text-right">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                  Target Year-End VC (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="3"
                  value={targetVcInput}
                  onChange={(e) => setTargetVcInput(e.target.value)}
                  className="w-24 p-2 bg-slate-800 border border-slate-700 rounded-lg text-lg font-black text-white text-right outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            {alreadyHitTarget ? (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-5 flex items-center gap-3">
                <Trophy className="text-emerald-400 shrink-0" size={28} />
                <p className="text-emerald-300 font-bold">
                  You&apos;ve already cleared the {targetVc.toFixed(2)}% target. Lock it in!
                </p>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-cyan-400" />
                  <p className="text-sm font-bold text-slate-200">
                    Blended path to close <span className="text-cyan-400">{gapPts.toFixed(2)} pts</span>
                    {isMaxedOut && <span className="text-amber-400"> (capped — {(model.currentVcTotal + totalHeadroom).toFixed(2)}% is the max reachable with current min/max settings)</span>}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">More Auto Apps</p>
                    <p className="text-lg font-black text-white">+{additionalAutoApps}</p>
                    {additionalAutoPremium !== null && <p className="text-[10px] text-slate-500">~${money(additionalAutoPremium)} premium</p>}
                    <p className="text-[10px] text-cyan-400 mt-1">{(additionalAutoApps / Math.max(1, weeksRemaining)).toFixed(1)}/week</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">More Fire Apps</p>
                    <p className="text-lg font-black text-white">+{additionalFireApps}</p>
                    {additionalFirePremium !== null && <p className="text-[10px] text-slate-500">~${money(additionalFirePremium)} premium</p>}
                    <p className="text-[10px] text-cyan-400 mt-1">{(additionalFireApps / Math.max(1, weeksRemaining)).toFixed(1)}/week</p>
                  </div>
                  <div className="bg-slate-800/60 rounded-lg p-3">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">More FS Commission</p>
                    <p className="text-lg font-black text-white">+${money(additionalFsComm)}</p>
                    <p className="text-[10px] text-slate-500">Life/Health commission $</p>
                    <p className="text-[10px] text-cyan-400 mt-1">${money(additionalFsComm / Math.max(1, weeksRemaining))}/week</p>
                  </div>
                </div>

                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700"
                    style={{ width: `${Math.min(100, (model.currentVcTotal / Math.max(targetVc, 0.01)) * 100)}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-500">
                  {Math.round(workingDaysRemaining)} working days left this year · {monthsRemaining.toFixed(1)} months
                </p>
              </div>
            )}
          </div>
          )}

          {/* ============================= CARD 1B: TRAVEL & INCENTIVE QUALIFIER ============================= */}
          {agencySettings?.target_travel_active && (
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl border border-amber-900/50 shadow-[0_0_40px_-15px_rgba(245,158,11,0.3)] p-7">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 text-amber-400 rounded-xl">
                  <Plane size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Travel &amp; Incentive Qualifier</h2>
                  <p className="text-xs text-slate-500">Real YTD pipeline + Cash Flow Architect What-If</p>
                </div>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                  model.travelTierIndex >= 0
                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                    : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}
              >
                {model.travelTierIndex >= 0 ? `${travelCurrentTierName} Qualified` : "Unqualified"}
              </span>
            </div>

            {travelMaxedOut ? (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-5 flex items-center gap-3">
                <Trophy className="text-emerald-400 shrink-0" size={28} />
                <p className="text-emerald-300 font-bold">Top tier unlocked — {travelCurrentTierName} secured!</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Next Milestone</p>
                  <p className="text-sm font-black text-amber-400">{travelTargetTier.name}</p>
                </div>

                <div className="space-y-4 mb-5">
                  {travelMetrics.map((m) => (
                    <div key={m.key}>
                      <div className="flex justify-between items-baseline mb-1.5">
                        <span className="text-xs font-bold text-slate-400">{m.label}</span>
                        <span className="text-xs font-black text-white">
                          {m.format === "money" ? `$${money(m.current)}` : Math.round(m.current)}
                          {m.gain > 0.5 && (
                            <span className="text-emerald-400"> +{m.format === "money" ? `$${money(m.gain)}` : Math.round(m.gain)}</span>
                          )}
                          <span className="text-slate-500 font-semibold"> / {m.format === "money" ? `$${money(m.target)}` : m.target}</span>
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                        <div className="h-full bg-amber-500" style={{ width: `${m.progressReal}%` }} />
                        <div className="h-full bg-amber-300/60" style={{ width: `${Math.max(0, m.progressProjected - m.progressReal)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>

                {travelFullyQualifiedWithWhatIf ? (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-center gap-3">
                    <Sparkles className="text-emerald-400 shrink-0" size={20} />
                    <p className="text-emerald-300 text-sm font-bold">Your What-If plan clears {travelTargetTier.name} — lock it in!</p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-900/80 border border-slate-800 p-4">
                    <p className="text-xs font-bold text-slate-400 mb-1.5">
                      Bottleneck: <span className="text-amber-400">{travelBottleneck.label}</span>
                    </p>
                    <p className="text-sm text-slate-300">
                      <span className="text-white font-black">
                        {travelBottleneck.format === "money" ? `$${money(travelBottleneck.gapProjected)}` : Math.ceil(travelBottleneck.gapProjected)}
                      </span>{" "}
                      more needed to reach {travelTargetTier.name}
                    </p>
                    <p className="text-[10px] text-amber-400 mt-1.5">
                      {travelBottleneck.format === "money"
                        ? `$${money(travelBottleneck.gapProjected / Math.max(1, weeksRemaining))}/week`
                        : `${(travelBottleneck.gapProjected / Math.max(1, weeksRemaining)).toFixed(1)} apps/week`}{" "}
                      needed the rest of the year
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
          )}
          </div>

          {/* ============================= CARD 2: CASH FLOW ARCHITECT ============================= */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl border border-purple-900/50 shadow-[0_0_40px_-15px_rgba(168,85,247,0.3)] p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl">
                <Rocket size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Cash Flow Architect</h2>
                <p className="text-xs text-slate-500">Auto-distributed by your historical product mix</p>
              </div>
            </div>

            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Target Annual Gross Revenue
            </label>
            <div className="relative mb-5">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
              <input
                type="number"
                step="1000"
                value={targetRevenueInput}
                onChange={(e) => {
                  setTargetRevenueInput(e.target.value);
                  distributeSliders(num(e.target.value, model.projectedAnnualRevenue));
                }}
                className="w-full pl-8 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-lg font-bold text-white outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Projected Revenue</p>
                <p className="text-xl font-black text-white">${money(model.projectedAnnualRevenue)}</p>
              </div>
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-800">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Revenue Gap</p>
                <p className="text-xl font-black text-orange-400">${money(revenueGap)}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <Sliders size={14} className="text-purple-400" />
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Fill the gap with new production
                </p>
              </div>
              <button
                onClick={() => distributeSliders(targetRevenue)}
                className="text-[10px] font-bold text-purple-400 hover:text-purple-300 transition-colors"
              >
                Reset to Auto-Distribute
              </button>
            </div>

            <div className="space-y-5">
              {LINE_KEYS.map((k) => (
                <div key={k}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-sm font-bold text-slate-300">New {LINE_LABELS[k]} Premium</span>
                    <span className="text-sm font-black text-white">${money(sliders[k])}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={sliderMaxFor(k)}
                    step={1000}
                    value={sliders[k]}
                    onChange={(e) => setSliders((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-800 accent-purple-500"
                  />
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-slate-500">@ {(model.sliderRates[k] * 100).toFixed(1)}% rate</span>
                    <span className="text-[10px] text-slate-400 font-bold">+${money(fills[k])} revenue</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-5 border-t border-slate-800">
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Gap Filled</span>
                <span className="text-sm font-black text-white">
                  ${money(totalFill)} / ${money(revenueGap)}
                </span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${fillPct}%` }}
                />
              </div>
              {remainingGapAfterSliders === 0 ? (
                <p className="mt-3 flex items-center gap-2 text-sm font-bold text-emerald-400">
                  <Sparkles size={16} /> Gap fully closed — this mix hits your target revenue.
                </p>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  <span className="text-white font-bold">${money(remainingGapAfterSliders)}</span> still needed to hit
                  your target.
                </p>
              )}
            </div>

            {/* TRANSLATION LAYER (Tweak 3): premium → required apps */}
            <div className="mt-6 pt-5 border-t border-slate-800">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Total Year-End Bound Apps Required</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {LINE_KEYS.map((k) => (
                  <div key={k} className="bg-slate-900/60 rounded-lg p-3 border border-slate-800 text-center">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{LINE_LABELS[k]}</p>
                    <p className="text-lg font-black text-white">{requiredApps[k] ?? "—"}</p>
                    <p className="text-[9px] text-slate-500">
                      {model.avgPremiumPerApp[k] ? `@ $${money(model.avgPremiumPerApp[k]!)}/app` : "no YTD data"}
                    </p>
                    {requiredApps[k] !== null && (
                      <p className="text-[9px] text-purple-400 font-bold mt-0.5">
                        {(requiredApps[k]! / Math.max(1, weeksRemaining)).toFixed(1)} apps / week
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ============================= ACTIVITY PACING ENGINE (Tweak 4) ============================= */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl border border-emerald-900/50 shadow-[0_0_40px_-15px_rgba(16,185,129,0.25)] p-7">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Gauge size={22} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Activity Pacing Engine</h2>
              <p className="text-xs text-slate-500">Required apps above, reverse-engineered into daily quotes</p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {LINE_KEYS.map((k) => (
              <div key={k} className="bg-slate-900/60 rounded-xl p-4 border border-slate-800 text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{LINE_LABELS[k]} Quotes/Day</p>
                <p className="text-2xl font-black text-emerald-400">{globalDailyTargets[k] ?? "—"}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">agency-wide @ {model.globalCloseRate}% close rate</p>
              </div>
            ))}
          </div>

          {team.length > 0 && (
            <div className="overflow-x-auto">
              <div className="flex items-center gap-2 mb-3">
                <Users size={14} className="text-emerald-400" />
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Per-Producer Daily Quote Targets</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-800">
                    <th className="pb-2 pr-4">Producer</th>
                    <th className="pb-2 pr-4">Close Rate</th>
                    {LINE_KEYS.map((k) => (
                      <th key={k} className="pb-2 pr-4">{LINE_LABELS[k]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {producerBreakdown.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 pr-4 font-bold text-white whitespace-nowrap">{p.name}</td>
                      <td className="py-2.5 pr-4 text-slate-400">
                        {p.closeRatePct.toFixed(1)}%{" "}
                        <span
                          className="text-[9px] font-bold uppercase tracking-wide text-slate-600"
                          title={
                            p.closeRateSource === "override"
                              ? "Set manually in Settings → Conversion Metrics"
                              : p.closeRateSource === "live"
                              ? "Live YTD rate: logged quotes vs. bound apps"
                              : "Agency-wide global fallback (no individual data yet)"
                          }
                        >
                          {p.closeRateSource === "override" ? "(set)" : p.closeRateSource === "live" ? "(live)" : "(global)"}
                        </span>
                      </td>
                      {LINE_KEYS.map((k) => (
                        <td key={k} className="py-2.5 pr-4 text-slate-300 font-bold">{p.perLine[k] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SUMMARY STRIP */}
        <div className="bg-slate-900/60 rounded-2xl border border-slate-800 p-6 flex flex-wrap gap-6 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
              <Wallet size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Annual Book Premium</p>
              <p className="text-lg font-black text-white">${money(model.totalBookPremium)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
              <TrendingUp size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Business (YTD)</p>
              <p className="text-lg font-black text-white">${money(model.totalNbRev)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
              <Target size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Net Renewals (P&amp;C)</p>
              <p className="text-lg font-black text-white">${money(model.pncRenRev)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-800 rounded-lg text-slate-400">
              <Target size={18} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Life/Health Renewals</p>
              <p className="text-lg font-black text-white">${money(model.lifeHealthRenRev)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
