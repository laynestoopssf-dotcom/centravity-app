"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Sparkles,
  DollarSign,
  TrendingUp,
  Mountain,
  Trophy,
  Target,
  RefreshCw,
  ArrowRight,
  Briefcase,
  AlertCircle,
} from "lucide-react";
import { supabase } from "../../../utils/supabase";
import { resolveParentLine } from "../../../utils/productLines";
import { resolveCommissionRates, calculateLifeHealthRevenue } from "../../../utils/commissionRates";

// =============================================================================
// Protected route: /dashboard/reveal
// -----------------------------------------------------------------------------
// The one-time "Agency Health" overview shown immediately after the
// OnboardingWizard finishes (see app/onboarding/page.tsx's onSuccess wiring).
// It's intentionally a self-contained page rather than a tab bolted onto the
// giant app/dashboard/page.tsx component: it does its own light data fetch
// (agency, offices, active team, this-year policies) and its own condensed
// version of the same math the YTD Projections / Revenue & VC tabs use, so a
// brand-new agency — which on Day 1 usually has zero real `policies` rows
// logged yet — still gets an immediate, high-impact forecast built entirely
// from what the owner just entered in the wizard:
//   - Step 3 (YTD Starting Line) → profiles.starting_ytd_* (the "baseline")
//   - Step 4 (Agency Baseline)   → offices.book_size_*, prior_pif_*, lapse %s
//   - Step 5 (Goals & Comp)      → offices.annual_target_*, base_comm_*, VC %
// Any real production logged in-app this year is blended in on top, so this
// same page stays accurate even if a few real policies exist by the time the
// owner lands here.
// =============================================================================

const DEFAULT_PRODUCT_LINES = [
  { name: "Auto", parent: "Auto" },
  { name: "Fire", parent: "Fire" },
  { name: "Commercial", parent: "Commercial" },
  { name: "Life", parent: "Life" },
  { name: "Health", parent: "Health" },
];

type LoadState = "checking" | "loading" | "ready" | "error";

const num = (v: unknown, fallback = 0): number => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const money = (n: number): string => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v).toLocaleString() : "0";
};

export default function RevealPage() {
  const router = useRouter();
  const [status, setStatus] = useState<LoadState>("checking");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [agencyName, setAgencyName] = useState("Your Agency");
  const [agencySettings, setAgencySettings] = useState<any>(null);
  const [offices, setOffices] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);

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

      if (profErr) {
        console.error("[Reveal] profile lookup failed", profErr);
        setErrorMsg("We couldn't load your profile.");
        setStatus("error");
        return;
      }

      if (!prof?.agency_id) {
        // No agency yet (or no profile row at all) — the wizard hasn't actually
        // finished. Fail safe back into onboarding rather than showing a blank
        // or broken reveal.
        console.warn("[Reveal] no agency_id on profile — sending back to /onboarding", prof);
        router.replace("/onboarding");
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

      console.log("[Reveal] fetch results", {
        agencyId,
        agencyError: agencyRes.error,
        officesError: officesRes.error,
        teamError: teamRes.error,
        policiesError: policiesRes.error,
        officesCount: officesRes.data?.length ?? 0,
        teamCount: teamRes.data?.length ?? 0,
        policiesCount: policiesRes.data?.length ?? 0,
      });

      if (agencyRes.error) {
        console.error("[Reveal] agency lookup failed", agencyRes.error);
        setErrorMsg("We couldn't load your agency settings.");
        setStatus("error");
        return;
      }

      setAgencyName(agencyRes.data?.name || "Your Agency");
      setAgencySettings(agencyRes.data || null);
      setOffices(officesRes.data || []);
      setTeam(teamRes.data || []);
      setPolicies(policiesRes.data || []);
      setStatus("ready");
    };

    load().catch((err) => {
      console.error("[Reveal] unexpected error loading agency health", err);
      if (mounted) {
        setErrorMsg("Something went wrong loading your dashboard preview.");
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

  const health = useMemo(() => {
    if (status !== "ready") return null;

    const linesDict = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, linesDict);

    // Carrier-accurate Life/Health commission table (agencies.commission_rates) — Life & Health
    // revenue is intentionally decoupled from current_vc_rate entirely; see utils/commissionRates.ts.
    const commissionRates = resolveCommissionRates(agencySettings?.commission_rates);

    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const daysPassed = Math.max(1, Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)));
    const daysInYear = 365;
    const ytdTimeFraction = daysPassed / daysInYear;

    // 1. The onboarding baseline — production that already existed before the
    // agency started logging activity in Centravity (profiles.starting_ytd_*,
    // written by OnboardingWizard Step 3 → saveStep3YTD).
    const baseline = team.reduce(
      (acc, m) => {
        acc.autoApps += num(m.starting_ytd_auto_apps);
        acc.autoPremium += num(m.starting_ytd_auto_premium);
        acc.fireApps += num(m.starting_ytd_fire_apps);
        acc.firePremium += num(m.starting_ytd_fire_premium);
        acc.lifeApps += num(m.starting_ytd_life_apps);
        acc.lifePremium += num(m.starting_ytd_life_premium);
        acc.healthApps += num(m.starting_ytd_health_apps);
        acc.healthPremium += num(m.starting_ytd_health_premium);
        return acc;
      },
      { autoApps: 0, autoPremium: 0, fireApps: 0, firePremium: 0, lifeApps: 0, lifePremium: 0, healthApps: 0, healthPremium: 0 }
    );

    // 2. Any real production actually logged in-app this year, blended on top
    // of the baseline (bound/issued only — matches the main dashboard's rule).
    const production = policies.reduce(
      (acc, pol) => {
        const logDate = new Date(pol.logged_at);
        if (logDate.getFullYear() !== today.getFullYear()) return acc;
        if (!(pol.status === "bound" || pol.status === "issued")) return acc;
        const prem = num(pol.premium_amount);
        const parentLine = getParentLine(pol.product_line);
        acc.totalBound++;
        acc.totalPremium += prem;
        if (parentLine === "Auto") acc.autoApps++;
        else if (parentLine === "Fire") acc.fireApps++;
        else if (parentLine === "Commercial") acc.commercialApps++;
        else if (parentLine === "Life") {
          acc.lifeApps++;
          acc.lifePremium += prem;
        } else if (parentLine === "Health") {
          acc.healthApps++;
          acc.healthPremium += prem;
        }
        return acc;
      },
      { autoApps: 0, fireApps: 0, commercialApps: 0, lifeApps: 0, lifePremium: 0, healthApps: 0, healthPremium: 0, totalBound: 0, totalPremium: 0 }
    );

    const totals = {
      autoApps: baseline.autoApps + production.autoApps,
      fireApps: baseline.fireApps + production.fireApps,
      commercialApps: production.commercialApps,
      lifeApps: baseline.lifeApps + production.lifeApps,
      lifePremium: baseline.lifePremium + production.lifePremium,
      healthApps: baseline.healthApps + production.healthApps,
      healthPremium: baseline.healthPremium + production.healthPremium,
      totalBound: baseline.autoApps + baseline.fireApps + baseline.lifeApps + baseline.healthApps + production.totalBound,
      totalPremium:
        baseline.autoPremium + baseline.firePremium + baseline.lifePremium + baseline.healthPremium + production.totalPremium,
    };

    // 3. Production targets — apps-based per line, set in Step 5 and stored on
    // `offices` (never a $ premium target, since the wizard never collects one).
    const targets = offices.reduce(
      (acc, o) => {
        acc.autoApps += num(o.annual_target_auto_apps);
        acc.fireApps += num(o.annual_target_fire_apps);
        acc.lifeApps += num(o.annual_target_life_apps);
        acc.healthApps += num(o.annual_target_health_apps);
        acc.commercialApps += num(o.annual_target_commercial_apps);
        return acc;
      },
      { autoApps: 0, fireApps: 0, lifeApps: 0, healthApps: 0, commercialApps: 0 }
    );

    // 4. Net apps after projected book attrition — same "gross minus projected
    // lapse" model the YTD Projections tab uses, driven by each office's own
    // retention/lapse % (Step 4) and prior policy count (Step 4's "Policy Count").
    const officeCount = offices.length || 1;
    const avgLapseAuto = offices.length
      ? offices.reduce((s, o) => s + num(o.ytd_lapse_cancel_auto, num(agencySettings?.ytd_lapse_cancel_auto)), 0) / officeCount
      : num(agencySettings?.ytd_lapse_cancel_auto);
    const avgLapseFire = offices.length
      ? offices.reduce((s, o) => s + num(o.ytd_lapse_cancel_fire, num(agencySettings?.ytd_lapse_cancel_fire)), 0) / officeCount
      : num(agencySettings?.ytd_lapse_cancel_fire);

    const priorPifAuto = offices.reduce((s, o) => s + num(o.prior_pif_auto), 0);
    const priorPifFire = offices.reduce((s, o) => s + num(o.prior_pif_fire), 0);
    const lostAuto = priorPifAuto * (avgLapseAuto / 100) * ytdTimeFraction;
    const lostFire = priorPifFire * (avgLapseFire / 100) * ytdTimeFraction;
    const netAutoApps = Math.round(totals.autoApps - lostAuto);
    const netFireApps = Math.round(totals.fireApps - lostFire);

    // 5. Book size, renewals & VC — mirrors RevenueTab's
    // sumOfficeBookSizes()/calculateEnterpriseBookAndRenewals() exactly, just
    // condensed into one pass since this page is always "Enterprise-wide."
    const bookSize = offices.reduce(
      (acc, o) => ({
        auto: acc.auto + num(o.book_size_auto),
        fire: acc.fire + num(o.book_size_fire),
        commercial: acc.commercial + num(o.book_size_commercial),
        life: acc.life + num(o.book_size_life),
        health: acc.health + num(o.book_size_health),
      }),
      { auto: 0, fire: 0, commercial: 0, life: 0, health: 0 }
    );
    const totalBookPremium = bookSize.auto + bookSize.fire + bookSize.commercial + bookSize.life + bookSize.health;

    const vcRateAgency = num(agencySettings?.current_vc_rate);
    const totalRenRev = offices.reduce((sum, office) => {
      const autoLapse = (num(office?.ytd_lapse_cancel_auto, num(agencySettings?.ytd_lapse_cancel_auto)) / 100) * ytdTimeFraction;
      const fireLapse = (num(office?.ytd_lapse_cancel_fire, num(agencySettings?.ytd_lapse_cancel_fire)) / 100) * ytdTimeFraction;
      const commLapse =
        (num(office?.ytd_lapse_cancel_commercial, num(agencySettings?.ytd_lapse_cancel_commercial)) / 100) * ytdTimeFraction;

      // vcRate applies STRICTLY to P&C (Auto/Fire/Commercial) — never to Life/Health.
      const vcRate = num(office?.current_vc_rate, vcRateAgency) / 100;
      const bAuto = num(office?.base_comm_auto, num(agencySettings?.base_comm_auto, 8)) / 100;
      const bFire = num(office?.base_comm_fire, num(agencySettings?.base_comm_fire, 8)) / 100;
      const bComm = bFire; // matches the existing Revenue & VC engine's convention

      const oAuto = num(office.book_size_auto);
      const oFire = num(office.book_size_fire);
      const oComm = num(office.book_size_commercial);
      const oLife = num(office.book_size_life);
      const oHealth = num(office.book_size_health);

      // Existing book = "renewal" phase → servicing / year2_to_5 carrier rates, no VC.
      const { lifeRevenue: oLifeRev, healthRevenue: oHealthRev } = calculateLifeHealthRevenue({
        lifePremium: oLife,
        healthPremium: oHealth,
        phase: "renewal",
        rates: commissionRates,
      });

      return (
        sum +
        oAuto * (1 - autoLapse) * (bAuto + vcRate) +
        oFire * (1 - fireLapse) * (bFire + vcRate) +
        oComm * (1 - commLapse) * (bComm + vcRate) +
        oLifeRev +
        oHealthRev
      );
    }, 0);

    // 6. New business (real production only — near-zero on Day 1, but kept
    // accurate for whenever the owner actually lands on this page).
    const bAutoAgency = num(agencySettings?.base_comm_auto, 8) / 100;
    const bFireAgency = num(agencySettings?.base_comm_fire, 8) / 100;
    const bCommAgency = bFireAgency;
    // Display-only base comp %s (baseCompLife/baseCompHealth below) — no longer feed totalNbRev,
    // which is computed via the carrier-rate engine (calculateLifeHealthRevenue) below instead.
    const bLifeAgency = num(agencySettings?.base_comm_life, 20) / 100;
    const bHealthAgency = num(agencySettings?.base_comm_health, 20) / 100;
    const vcRate = vcRateAgency / 100;

    let nbAutoPrem = 0,
      nbFirePrem = 0,
      nbCommPrem = 0,
      nbLifePrem = 0,
      nbHealthPrem = 0;
    policies.forEach((pol) => {
      const logDate = new Date(pol.logged_at);
      if (logDate.getFullYear() !== today.getFullYear()) return;
      if (!(pol.status === "bound" || pol.status === "issued")) return;
      const prem = num(pol.premium_amount);
      const parentLine = getParentLine(pol.product_line);
      if (parentLine === "Auto") nbAutoPrem += prem;
      else if (parentLine === "Fire") nbFirePrem += prem;
      else if (parentLine === "Commercial") nbCommPrem += prem;
      else if (parentLine === "Life") nbLifePrem += prem;
      else if (parentLine === "Health") nbHealthPrem += prem;
    });

    // Fold in the onboarding "starting YTD" baseline premium — same fix as the main dashboard's
    // calculateRev(). No baseline exists for Commercial (never collected by the wizard).
    nbAutoPrem += baseline.autoPremium;
    nbFirePrem += baseline.firePremium;
    nbLifePrem += baseline.lifePremium;
    nbHealthPrem += baseline.healthPremium;

    // New business = "new_business" phase → year1 / first_year carrier rates, no VC.
    const { lifeRevenue: nbLifeRev, healthRevenue: nbHealthRev } = calculateLifeHealthRevenue({
      lifePremium: nbLifePrem,
      healthPremium: nbHealthPrem,
      phase: "new_business",
      rates: commissionRates,
    });

    const totalNbRev =
      nbAutoPrem * (bAutoAgency + vcRate) +
      nbFirePrem * (bFireAgency + vcRate) +
      nbCommPrem * (bCommAgency + vcRate) +
      nbLifeRev +
      nbHealthRev;

    const totalAgencyRev = totalNbRev + totalRenRev;

    // Base Comp %s and VC Rate are per-office settings (Step 5 writes them onto
    // `offices`, not `agencies`) — read off the first/primary office, which is
    // the one the wizard actually created in Step 1.
    const primaryOffice = offices[0] || null;

    console.log("[Reveal] computed agency health", {
      baseline,
      production,
      totals,
      targets,
      netAutoApps,
      netFireApps,
      bookSize,
      totalBookPremium,
      totalRenRev,
      totalNbRev,
      totalAgencyRev,
    });

    return {
      daysPassed,
      daysInYear,
      totals,
      targets,
      netAutoApps,
      netFireApps,
      totalBookPremium,
      totalRenRev,
      totalNbRev,
      totalAgencyRev,
      vcRate: primaryOffice ? num(primaryOffice.current_vc_rate, vcRateAgency) : vcRateAgency,
      baseCompAuto: primaryOffice ? num(primaryOffice.base_comm_auto, bAutoAgency * 100) : bAutoAgency * 100,
      baseCompFire: primaryOffice ? num(primaryOffice.base_comm_fire, bFireAgency * 100) : bFireAgency * 100,
      baseCompLife: primaryOffice ? num(primaryOffice.base_comm_life, bLifeAgency * 100) : bLifeAgency * 100,
      baseCompHealth: primaryOffice ? num(primaryOffice.base_comm_health, bHealthAgency * 100) : bHealthAgency * 100,
    };
  }, [status, agencySettings, offices, team, policies]);

  if (status === "checking" || status === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 px-4">
        <Loader2 className="h-10 w-10 animate-spin text-purple-400" aria-hidden="true" />
        <p className="mt-6 text-sm font-semibold text-slate-300">Building your agency snapshot…</p>
      </div>
    );
  }

  if (status === "error" || !health) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-900 px-4 text-center">
        <AlertCircle className="h-10 w-10 text-red-400" aria-hidden="true" />
        <p className="max-w-md text-sm font-semibold text-slate-300">
          {errorMsg || "We couldn't build your agency snapshot right now."}
        </p>
        <button
          onClick={() => router.replace("/dashboard")}
          className="mt-2 rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-purple-700"
        >
          Take Me To My Dashboard
        </button>
      </div>
    );
  }

  const yearPct = Math.round((health.daysPassed / health.daysInYear) * 100);

  const lobCard = (
    label: string,
    apps: number,
    targetApps: number,
    accent: string,
    premium?: number
  ) => (
    <div className="p-5 bg-gray-50 rounded-xl border border-gray-200 flex flex-col justify-between">
      <div>
        <h4 className="font-bold text-gray-700 mb-1">{label}</h4>
        <div className="mt-2 mb-2">
          <span className={`text-3xl font-black ${accent}`}>{apps}</span>
          <span className="text-sm font-medium text-gray-400"> apps</span>
        </div>
        {typeof premium === "number" && (
          <p className="text-sm text-gray-600 mb-2">${money(premium)} premium</p>
        )}
      </div>
      <div>
        <div className="flex justify-between text-xs font-bold text-gray-500 mb-1">
          <span>YTD: {apps}</span>
          <span>Goal: {targetApps || "—"}</span>
        </div>
        <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${accent.replace("text-", "bg-")}`}
            style={{ width: `${Math.min(100, (apps / (targetApps || 1)) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-12">
        <header className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-purple-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-purple-700 mb-4">
            <Sparkles size={14} /> Your Agency Is Live
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900">{agencyName}&apos;s Financial Snapshot</h1>
          <p className="text-gray-500 mt-2 max-w-2xl mx-auto">
            Built entirely from what you just entered — book size, retention, targets, and comp. This is a one-time
            preview; your live Scoreboard is one click away.
          </p>
        </header>

        {/* HERO REVENUE CARD */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-gradient-to-br from-emerald-900 to-gray-900 rounded-2xl shadow-lg border border-emerald-800 p-8 flex flex-col justify-center text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-10 pointer-events-none">
              <DollarSign size={150} />
            </div>
            <h3 className="text-sm font-bold text-emerald-400 mb-2 uppercase tracking-wider">Estimated Annual Revenue</h3>
            <div className="text-6xl font-black mb-4">${money(health.totalAgencyRev)}</div>
            <div className="flex flex-wrap gap-6 mt-2 border-t border-emerald-800/50 pt-4">
              <div>
                <p className="text-xs text-emerald-300 font-semibold mb-1 uppercase">Annual Book Premium</p>
                <p className="text-xl font-bold">${money(health.totalBookPremium)}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-300 font-semibold mb-1 uppercase">New Business (YTD)</p>
                <p className="text-xl font-bold">${money(health.totalNbRev)}</p>
              </div>
              <div>
                <p className="text-xs text-emerald-300 font-semibold mb-1 uppercase">Net Renewals</p>
                <p className="text-xl font-bold">${money(health.totalRenRev)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col justify-center text-center">
            <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase tracking-wider">Current VC Rate</h3>
            <div className="text-5xl font-black text-gray-900 mb-2">{health.vcRate}%</div>
            <p className="text-sm text-gray-500 font-medium">Applied to Auto & Fire base commissions.</p>
            <div className="mt-5 pt-5 border-t border-gray-100 grid grid-cols-2 gap-2 text-left">
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">Base Auto</p>
                <p className="text-sm font-black text-gray-800">{health.baseCompAuto}%</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">Base Fire</p>
                <p className="text-sm font-black text-gray-800">{health.baseCompFire}%</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">Base Life</p>
                <p className="text-sm font-black text-gray-800">{health.baseCompLife}%</p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">Base Health</p>
                <p className="text-sm font-black text-gray-800">{health.baseCompHealth}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* YTD PRODUCTION GRID */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <h3 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
            <Briefcase size={20} className="text-gray-500" /> YTD Production
          </h3>
          <p className="text-gray-500 mb-6 text-sm">
            Your Step 3 starting line, blended with anything already logged in Centravity this year.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {lobCard("Auto", health.totals.autoApps, health.targets.autoApps, "text-blue-600")}
            {lobCard("Fire", health.totals.fireApps, health.targets.fireApps, "text-red-500")}
            {lobCard("Life", health.totals.lifeApps, health.targets.lifeApps, "text-purple-600", health.totals.lifePremium)}
            {lobCard("Health", health.totals.healthApps, health.targets.healthApps, "text-emerald-500", health.totals.healthPremium)}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-100">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Net Auto (post-lapse)</p>
              <p className="text-xl font-black text-gray-900">{health.netAutoApps}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Net Fire (post-lapse)</p>
              <p className="text-xl font-black text-gray-900">{health.netFireApps}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Policies YTD</p>
              <p className="text-xl font-black text-gray-900">{health.totals.totalBound}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Total Premium YTD</p>
              <p className="text-xl font-black text-gray-900">${money(health.totals.totalPremium)}</p>
            </div>
          </div>
        </div>

        {/* CALENDAR PACING */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <Mountain size={200} />
          </div>
          <h3 className="text-2xl font-black text-gray-900 mb-1 flex items-center justify-center gap-2">
            <TrendingUp size={22} className="text-indigo-600" /> Where You Stand Today
          </h3>
          <p className="text-gray-500 mb-8 max-w-2xl mx-auto">
            Day {health.daysPassed} of {health.daysInYear} — {yearPct}% of the year is behind you.
          </p>
          <div className="relative pt-2 pb-4 px-4">
            <div className="h-4 w-full bg-gray-100 rounded-full relative overflow-hidden shadow-inner">
              <div
                className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${yearPct}%` }}
              />
            </div>
            <div className="absolute right-0 top-0 flex flex-col items-center translate-x-4 -translate-y-8">
              <Trophy className="text-yellow-500 mb-1" size={24} />
              <span className="text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-1 rounded-md">YEAR END</span>
            </div>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-gray-500">
            <Target size={16} className="text-indigo-500" />
            Keep logging activity in Centravity daily — your Scoreboard updates the moment you do.
          </div>
        </div>

        {/* VC PACING NOTE */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 shadow-lg p-8 text-white">
          <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
            <RefreshCw size={22} className="text-blue-400" /> Your VC Engine Is Armed
          </h3>
          <p className="text-gray-400 max-w-3xl">
            Auto and Fire net gains, plus Life &amp; Health commission, feed straight into your Variable Comp tier —
            up to <strong className="text-white">3%</strong> total. Head to the full Revenue &amp; VC tab on your
            dashboard to watch it move in real time as your team logs production.
          </p>
        </div>

        <div className="flex justify-center pt-2">
          <button
            onClick={() => router.replace("/dashboard")}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-8 py-3.5 text-base font-bold text-white shadow-lg transition hover:bg-purple-700"
          >
            Take Me To My Dashboard
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
