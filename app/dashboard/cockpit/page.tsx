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
} from "lucide-react";
import { supabase } from "../../../utils/supabase";
import { resolveParentLine } from "../../../utils/productLines";
import { resolveCommissionRates, calculateLifeHealthRevenue, getLifeRate, getHealthRate } from "../../../utils/commissionRates";
import { getWorkingDaysRemainingInYear } from "../../../utils/pacing";

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
      const policiesRes = await supabase
        .from("policies")
        .select("id, user_id, office_id, status, premium_amount, payment_cycle, product_line, logged_at")
        .eq("agency_id", agencyId)
        .gte("logged_at", startOfYear)
        .limit(20000);

      if (!mounted) return;

      if (agencyRes.error) {
        console.error("[Cockpit] agency lookup failed", agencyRes.error);
        setErrorMsg("We couldn't load your agency settings.");
        setStatus("error");
        return;
      }

      setAgencySettings(agencyRes.data || null);
      setOffices(officesRes.data || []);
      setTeam(teamRes.data || []);
      setPolicies(policiesRes.data || []);
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
      const logDate = new Date(pol.logged_at);
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
    const vcMinAuto = num(agencySettings?.vc_min_auto_gain, 0);
    const vcMaxAuto = num(agencySettings?.vc_max_auto_gain, 100);
    const vcMinFire = num(agencySettings?.vc_min_fire_gain, 0);
    const vcMaxFire = num(agencySettings?.vc_max_fire_gain, 100);
    const vcMinFs = num(agencySettings?.vc_min_fs_comm, 0);
    const vcMaxFs = num(agencySettings?.vc_max_fs_comm, 10000);

    const bLifeAgency = num(agencySettings?.base_comm_life, 20) / 100;
    const bHealthAgency = num(agencySettings?.base_comm_health, 20) / 100;
    const ytdFsComm = agencyTotals.life.premium * bLifeAgency + agencyTotals.health.premium * bHealthAgency;

    const autoVcPts = calcPoints(netAutoApps, vcMinAuto, vcMaxAuto, 1.0);
    const fireVcPts = calcPoints(netFireApps, vcMinFire, vcMaxFire, 1.0);
    const fsVcPts = calcPoints(ytdFsComm, vcMinFs, vcMaxFs, 2.0);
    const currentVcTotal = Math.min(3.0, autoVcPts + fireVcPts + fsVcPts);

    // --- 4. Projected annual revenue (for the Cash Flow Architect) ---
    const bookSize = offices.reduce(
      (acc: any, o: any) => ({
        auto: acc.auto + num(o.book_size_auto),
        fire: acc.fire + num(o.book_size_fire),
        commercial: acc.commercial + num(o.book_size_commercial),
        life: acc.life + num(o.book_size_life),
        health: acc.health + num(o.book_size_health),
      }),
      { auto: 0, fire: 0, commercial: 0, life: 0, health: 0 }
    );

    const vcRateAgency = num(agencySettings?.current_vc_rate);
    const vcRateDecimal = vcRateAgency / 100;
    const bAutoAgency = num(agencySettings?.base_comm_auto, 8) / 100;
    const bFireAgency = num(agencySettings?.base_comm_fire, 8) / 100;
    const bCommAgency = bFireAgency;

    const totalRenRev = offices.reduce((sum: number, office: any) => {
      const vcOfficeRate = num(office?.current_vc_rate, vcRateAgency) / 100;
      const bAuto = num(office?.base_comm_auto, num(agencySettings?.base_comm_auto, 8)) / 100;
      const bFire = num(office?.base_comm_fire, num(agencySettings?.base_comm_fire, 8)) / 100;
      const bComm = bFire;
      const oAuto = num(office.book_size_auto);
      const oFire = num(office.book_size_fire);
      const oComm = num(office.book_size_commercial);
      const oLife = num(office.book_size_life);
      const oHealth = num(office.book_size_health);
      const { lifeRevenue: oLifeRev, healthRevenue: oHealthRev } = calculateLifeHealthRevenue({
        lifePremium: oLife,
        healthPremium: oHealth,
        phase: "renewal",
        rates: commissionRates,
      });
      return sum + oAuto * (bAuto + vcOfficeRate) + oFire * (bFire + vcOfficeRate) + oComm * (bComm + vcOfficeRate) + oLifeRev + oHealthRev;
    }, 0);

    const { lifeRevenue: nbLifeRev, healthRevenue: nbHealthRev } = calculateLifeHealthRevenue({
      lifePremium: agencyTotals.life.premium,
      healthPremium: agencyTotals.health.premium,
      phase: "new_business",
      rates: commissionRates,
    });
    const totalNbRev =
      agencyTotals.auto.premium * (bAutoAgency + vcRateDecimal) +
      agencyTotals.fire.premium * (bFireAgency + vcRateDecimal) +
      nbCommPrem * (bCommAgency + vcRateDecimal) +
      nbLifeRev +
      nbHealthRev;
    const projectedAnnualRevenue = totalNbRev + totalRenRev;

    // Slider reverse-math rates — Life/Health use the carrier table's
    // new-business rate (never VC); Auto/Fire use base + current VC rate.
    const sliderRates: Record<LineKey, number> = {
      auto: bAutoAgency + vcRateDecimal,
      fire: bFireAgency + vcRateDecimal,
      life: getLifeRate(commissionRates, "new_business"),
      health: getHealthRate(commissionRates, "new_business"),
    };

    return {
      memberTotals,
      agencyTotals,
      avgPremiumPerApp,
      historicalMix,
      netAutoApps,
      netFireApps,
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
      totalRenRev,
      vcRateAgency,
      sliderRates,
      globalCloseRate,
      productionDaysPerWeek,
    };
  }, [status, agencySettings, offices, team, policies]);

  // Default the target VC input to the next reasonable milestone above where the agency stands today.
  useEffect(() => {
    if (!model || targetVcInput !== "") return;
    setTargetVcInput((Math.min(3, Math.round((model.currentVcTotal + 0.5) * 10) / 10)).toFixed(1));
  }, [model, targetVcInput]);

  // Default + auto-distribute the target revenue once the model is ready (Tweak 2: "initially auto-distribute").
  const distributeSliders = (targetRevenue: number) => {
    if (!model) return;
    const gap = Math.max(0, targetRevenue - model.projectedAnnualRevenue);
    setSliders({
      auto: gap * model.historicalMix.auto,
      fire: gap * model.historicalMix.fire,
      life: gap * model.historicalMix.life,
      health: gap * model.historicalMix.health,
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
  const allocAuto = totalHeadroom > 0 ? gapPts * (headroomAuto / totalHeadroom) : 0;
  const allocFire = totalHeadroom > 0 ? gapPts * (headroomFire / totalHeadroom) : 0;
  const allocFs = totalHeadroom > 0 ? gapPts * (headroomFs / totalHeadroom) : 0;

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
  const sliderMax = Math.max(250000, Math.round((revenueGap || 100000) * 1.5));

  // --- Translation Layer: premium → required apps (Tweak 3) ---
  const requiredApps: Record<LineKey, number | null> = {
    auto: model.avgPremiumPerApp.auto ? Math.ceil(sliders.auto / model.avgPremiumPerApp.auto) : null,
    fire: model.avgPremiumPerApp.fire ? Math.ceil(sliders.fire / model.avgPremiumPerApp.fire) : null,
    life: model.avgPremiumPerApp.life ? Math.ceil(sliders.life / model.avgPremiumPerApp.life) : null,
    health: model.avgPremiumPerApp.health ? Math.ceil(sliders.health / model.avgPremiumPerApp.health) : null,
  };

  // --- Activity Pacing Engine (Tweak 4): required apps → required quotes → daily target ---
  const globalCloseRateDecimal = model.globalCloseRate / 100;
  const globalDailyTargets: Record<LineKey, number | null> = {
    auto: requiredApps.auto !== null && workingDaysRemaining > 0 ? Math.ceil(requiredApps.auto / globalCloseRateDecimal / workingDaysRemaining) : null,
    fire: requiredApps.fire !== null && workingDaysRemaining > 0 ? Math.ceil(requiredApps.fire / globalCloseRateDecimal / workingDaysRemaining) : null,
    life: requiredApps.life !== null && workingDaysRemaining > 0 ? Math.ceil(requiredApps.life / globalCloseRateDecimal / workingDaysRemaining) : null,
    health: requiredApps.health !== null && workingDaysRemaining > 0 ? Math.ceil(requiredApps.health / globalCloseRateDecimal / workingDaysRemaining) : null,
  };

  const producerBreakdown = team.map((m: any) => {
    const closeRate = num(m.close_rate, model.globalCloseRate) / 100;
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
    return { id: m.id, name: `${m.first_name} ${m.last_name}`, closeRatePct: num(m.close_rate, model.globalCloseRate), perLine };
  });

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
          {/* ============================= CARD 1: VC TIER SNIPER ============================= */}
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
                    max={sliderMax}
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
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Required Bound Apps</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {LINE_KEYS.map((k) => (
                  <div key={k} className="bg-slate-900/60 rounded-lg p-3 border border-slate-800 text-center">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">{LINE_LABELS[k]}</p>
                    <p className="text-lg font-black text-white">{requiredApps[k] ?? "—"}</p>
                    <p className="text-[9px] text-slate-500">
                      {model.avgPremiumPerApp[k] ? `@ $${money(model.avgPremiumPerApp[k]!)}/app` : "no YTD data"}
                    </p>
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
                      <td className="py-2.5 pr-4 text-slate-400">{p.closeRatePct}%</td>
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
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Net Renewals</p>
              <p className="text-lg font-black text-white">${money(model.totalRenRev)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
