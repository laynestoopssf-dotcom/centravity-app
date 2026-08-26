"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, AlertCircle, ShieldAlert, Crown } from "lucide-react";
import { supabase } from "../utils/supabase";
import { resolveParentLine } from "../utils/productLines";
import { resolveCommissionRates } from "../utils/commissionRates";
import { calculateOfficeRenewalRevenue, calculateEnterpriseRenewalRevenue, calculateNewBusinessRevenue } from "../utils/revenueEngine";
import { num } from "../utils/officeFields";
import { enrichCustomTargets, type CustomTargetRow } from "../utils/customTargets";
import { useDashboardTab } from "./dashboard/DashboardShellContext";
import YtdTab from "./YtdTab";
import RevenueTab from "./RevenueTab";

// =============================================================================
// The "Agent Dashboard" — the Agency Owner's master command center. Merges
// the old standalone YTD Projections and Revenue & Variable Compensation
// tabs into a single, top-to-bottom flow: Year-to-Date macro pacing first,
// then Revenue/VC projections built off that same YTD data — so the owner
// reads it as one continuous story instead of two disconnected tabs.
// -----------------------------------------------------------------------------
// This used to live at its own route, app/dashboard/agent/page.tsx, but that
// forced a full page load every time an owner switched into it from the
// Scoreboard. It's now just another tab rendered by app/dashboard/page.tsx
// (activeTab === 'agent'), swapped in instantly like every other tab, with
// app/dashboard/layout.tsx defaulting owners straight into it on login.
// -----------------------------------------------------------------------------
// Access is intentionally narrower than every other "owner-ish" gate in this
// app. Everywhere else, isOwnerLevelRole() (utils/roles.ts) treats 'admin' as
// fully owner-equivalent. This tab is the one deliberate exception — same
// carve-out already established for Stripe billing (see roles.ts's header
// comment) — because it's a literal "only the person who owns this agency"
// command center, not a manage-the-agency permission. A hardcoded
// `profile.role === 'owner'` check, no custom_roles override, no 'admin'
// inclusion, on purpose. DashboardSidebar only ever offers this tab to a
// strict owner and app/dashboard/layout.tsx only ever defaults a strict
// owner into it, but this component re-checks independently rather than
// trusting its caller, so it can never leak data even if that ever drifts.
// -----------------------------------------------------------------------------
// Keeps its own light data fetch + own condensed math (mirroring
// app/dashboard/reveal/page.tsx and app/dashboard/cockpit/page.tsx's
// pattern) rather than reaching into app/dashboard/page.tsx's already-loaded
// state, which is filtered/shaped for very different (ledger, scoreboard)
// purposes. Delegates to the shared utils/revenueEngine.ts helpers wherever
// possible so the $ formulas themselves still can't drift from Reveal/Cockpit.
// =============================================================================

const DEFAULT_PRODUCT_LINES = [
  { name: "Auto", parent: "Auto" },
  { name: "Fire", parent: "Fire" },
  { name: "Commercial", parent: "Commercial" },
  { name: "Life", parent: "Life" },
  { name: "Health", parent: "Health" },
];

type LoadState = "loading" | "ready" | "error" | "forbidden";

export default function AgentDashboardTab() {
  const { setActiveTab } = useDashboardTab();
  const [status, setStatus] = useState<LoadState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [ownerFirstName, setOwnerFirstName] = useState("");

  const [agencySettings, setAgencySettings] = useState<any>(null);
  const [offices, setOffices] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [customTargets, setCustomTargets] = useState<CustomTargetRow[]>([]);
  const [customTargetActivities, setCustomTargetActivities] = useState<any[]>([]);
  const [customTargetPolicies, setCustomTargetPolicies] = useState<any[]>([]);
  const [officeFilter, setOfficeFilter] = useState("all");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!mounted) return;

      if (!session?.user?.id) {
        setErrorMsg("Your session expired. Please sign in again.");
        setStatus("error");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .maybeSingle();

      if (!mounted) return;

      if (profErr || !prof?.agency_id) {
        console.error("[AgentDashboardTab] profile/agency lookup failed", profErr);
        setErrorMsg("We couldn't load your profile.");
        setStatus("error");
        return;
      }

      // Strict, literal owner-only gate — see header comment. No data is
      // fetched at all for anyone else, so a non-owner can never "see" this
      // tab's data even via devtools/network tab.
      if (prof.role !== "owner") {
        setStatus("forbidden");
        return;
      }

      setOwnerFirstName(prof.first_name || "");

      const agencyId = prof.agency_id as string;
      const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();

      const [agencyRes, officesRes, teamRes, policiesRes, targetsRes, targetActsRes, targetPolsRes] = await Promise.all([
        supabase.from("agencies").select("*").eq("id", agencyId).maybeSingle(),
        supabase.from("offices").select("*").eq("agency_id", agencyId),
        supabase.from("profiles").select("*").eq("agency_id", agencyId).eq("is_archived", false),
        supabase
          .from("policies")
          .select("id, user_id, office_id, status, premium_amount, payment_cycle, product_line, logged_at, written_at, bound_at")
          .eq("agency_id", agencyId)
          .gte("logged_at", startOfYear)
          .limit(20000),
        supabase
          .from("agency_custom_targets")
          .select("*")
          .eq("agency_id", agencyId)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: true }),
        supabase.from("activities").select("activity_type, logged_at, office_id").eq("agency_id", agencyId).gte("logged_at", startOfYear).limit(100000),
        supabase
          .from("policies")
          .select("product_line, status, premium_amount, logged_at, written_at, bound_at, office_id")
          .eq("agency_id", agencyId)
          .gte("logged_at", startOfYear)
          .limit(100000),
      ]);

      if (!mounted) return;

      if (agencyRes.error || officesRes.error || teamRes.error || policiesRes.error) {
        console.error("[AgentDashboardTab] fetch failed", {
          agency: agencyRes.error,
          offices: officesRes.error,
          team: teamRes.error,
          policies: policiesRes.error,
        });
        setErrorMsg("We couldn't load your agency data.");
        setStatus("error");
        return;
      }
      if (targetsRes.error) console.error("[AgentDashboardTab] custom targets fetch failed", targetsRes.error);
      if (targetActsRes.error) console.error("[AgentDashboardTab] custom target activities fetch failed", targetActsRes.error);
      if (targetPolsRes.error) console.error("[AgentDashboardTab] custom target policies fetch failed", targetPolsRes.error);

      setAgencySettings(agencyRes.data || null);
      setOffices(officesRes.data || []);
      setTeam(teamRes.data || []);
      setPolicies(policiesRes.data || []);
      setCustomTargets((targetsRes.data as CustomTargetRow[]) || []);
      setCustomTargetActivities(targetActsRes.data || []);
      setCustomTargetPolicies(targetPolsRes.data || []);
      setStatus("ready");
    };

    load().catch((err) => {
      console.error("[AgentDashboardTab] unexpected error loading agent dashboard", err);
      if (mounted) {
        setErrorMsg("Something went wrong loading the Agent Dashboard.");
        setStatus("error");
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  // Faithful port of the old ytdOverviewData useMemo (calculateStats),
  // scoped to whichever office `officeFilter` selects.
  const ytdOverviewData = useMemo(() => {
    if (status !== "ready") return null;

    const linesDict = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, linesDict);

    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const daysPassed = Math.max(1, Math.floor((today.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24)));
    const daysInYear = 365;
    const currentMonthRemaining = 12 - today.getMonth();

    const calculateStats = (pols: any[], name: string, specificOffice?: any) => {
      const totals = { ytdBound: 0, ytdPremium: 0, ytdLifeApps: 0, ytdLifePremium: 0, ytdAutoApps: 0, ytdFireApps: 0, ytdCommercialApps: 0, ytdHealthApps: 0, ytdHealthPremium: 0 };
      let issuedLifeCred = 0, carryOverCred = 0, pendingLifeCred = 0, pendingCarryOver = 0, pendingLifeApps = 0, issuedHealthCred = 0, pendingHealthCred = 0;

      pols.forEach((pol) => {
        const logDate = new Date(pol.bound_at || pol.written_at || pol.logged_at);
        if (logDate.getFullYear() === today.getFullYear()) {
          const prem = Number(pol.premium_amount);
          const isBoundOrIssued = pol.status === "bound" || pol.status === "issued";
          const isAnnual = pol.payment_cycle === "annual";
          const parentLine = getParentLine(pol.product_line);

          if (isBoundOrIssued) {
            totals.ytdBound++;
            totals.ytdPremium += prem;

            if (parentLine === "Life") { totals.ytdLifeApps++; totals.ytdLifePremium += prem; }
            else if (parentLine === "Auto") totals.ytdAutoApps++;
            else if (parentLine === "Fire") totals.ytdFireApps++;
            else if (parentLine === "Commercial") totals.ytdCommercialApps++;
            else if (parentLine === "Health") { totals.ytdHealthApps++; totals.ytdHealthPremium += prem; }
          }

          if (parentLine === "Life") {
            let earnedThisYear = 0, carryOver = 0;
            if (pol.status === "issued") {
              if (isAnnual) { earnedThisYear = prem; carryOver = 0; } else { earnedThisYear = (prem / 12) * (12 - logDate.getMonth()); carryOver = prem - earnedThisYear; }
              issuedLifeCred += earnedThisYear; carryOverCred += carryOver;
            } else if (pol.status === "bound" || pol.status === "quoted") {
              if (pol.status !== "quoted") pendingLifeApps++;
              if (isAnnual) { earnedThisYear = prem; carryOver = 0; } else { earnedThisYear = (prem / 12) * currentMonthRemaining; carryOver = prem - earnedThisYear; }
              pendingLifeCred += earnedThisYear; pendingCarryOver += carryOver;
            }
          } else if (parentLine === "Health") {
            if (pol.status === "issued") issuedHealthCred += prem;
            else if (pol.status === "bound" || pol.status === "quoted") pendingHealthCred += prem;
          }
        }
      });

      const baselineMembers = specificOffice ? team.filter((t: any) => t.office_id === specificOffice.id) : team;
      const baseline = baselineMembers.reduce(
        (acc: any, m: any) => ({
          autoApps: acc.autoApps + (Number(m.starting_ytd_auto_apps) || 0),
          autoPremium: acc.autoPremium + (Number(m.starting_ytd_auto_premium) || 0),
          fireApps: acc.fireApps + (Number(m.starting_ytd_fire_apps) || 0),
          firePremium: acc.firePremium + (Number(m.starting_ytd_fire_premium) || 0),
          lifeApps: acc.lifeApps + (Number(m.starting_ytd_life_apps) || 0),
          lifePremium: acc.lifePremium + (Number(m.starting_ytd_life_premium) || 0),
          healthApps: acc.healthApps + (Number(m.starting_ytd_health_apps) || 0),
          healthPremium: acc.healthPremium + (Number(m.starting_ytd_health_premium) || 0),
        }),
        { autoApps: 0, autoPremium: 0, fireApps: 0, firePremium: 0, lifeApps: 0, lifePremium: 0, healthApps: 0, healthPremium: 0 }
      );

      totals.ytdAutoApps += baseline.autoApps;
      totals.ytdFireApps += baseline.fireApps;
      totals.ytdLifeApps += baseline.lifeApps;
      totals.ytdLifePremium += baseline.lifePremium;
      totals.ytdHealthApps += baseline.healthApps;
      totals.ytdHealthPremium += baseline.healthPremium;
      totals.ytdPremium += baseline.autoPremium + baseline.firePremium + baseline.lifePremium + baseline.healthPremium;
      totals.ytdBound += baseline.autoApps + baseline.fireApps + baseline.lifeApps + baseline.healthApps;

      issuedLifeCred += baseline.lifePremium;
      issuedHealthCred += baseline.healthPremium;

      const travelTiers = [
        { name: "Level 1", apps: agencySettings?.travel_lvl1_apps || 0, lifeCred: agencySettings?.travel_lvl1_life_cred || 0, totalCred: agencySettings?.travel_lvl1_total_cred || 0 },
        { name: "Level 2", apps: agencySettings?.travel_lvl2_apps || 0, lifeCred: agencySettings?.travel_lvl2_life_cred || 0, totalCred: agencySettings?.travel_lvl2_total_cred || 0 },
        { name: "Level 3", apps: agencySettings?.travel_lvl3_apps || 0, lifeCred: agencySettings?.travel_lvl3_life_cred || 0, totalCred: agencySettings?.travel_lvl3_total_cred || 0 },
        { name: "Exotic", apps: agencySettings?.travel_exotic_apps || 0, lifeCred: agencySettings?.travel_exotic_life_cred || 0, totalCred: agencySettings?.travel_exotic_total_cred || 0 },
        { name: "Exotic Plus", apps: agencySettings?.travel_exotic_plus_apps || 0, lifeCred: agencySettings?.travel_exotic_plus_life_cred || 0, totalCred: agencySettings?.travel_exotic_plus_total_cred || 0 },
      ];

      let currentTierIndex = -1;
      for (let i = 0; i < travelTiers.length; i++) {
        if (totals.ytdLifeApps >= travelTiers[i].apps && issuedLifeCred >= travelTiers[i].lifeCred && (issuedLifeCred + issuedHealthCred) >= travelTiers[i].totalCred) {
          currentTierIndex = i;
        }
      }

      const targetTier = currentTierIndex < travelTiers.length - 1 ? travelTiers[currentTierIndex + 1] : travelTiers[travelTiers.length - 1];
      const currentTierName = currentTierIndex >= 0 ? travelTiers[currentTierIndex].name : "Not Qualified";
      const travelStatus = { currentTierName, targetTierName: targetTier.name, issuedLifeApps: totals.ytdLifeApps, pendingLifeApps, targetLifeApps: targetTier.apps, issuedLifeCred, pendingLifeCred, targetLifeCred: targetTier.lifeCred, issuedTotalCred: issuedLifeCred + issuedHealthCred, pendingTotalCred: pendingLifeCred + pendingHealthCred, targetTotalCred: targetTier.totalCred, carryOverCred, pendingCarryOver };

      const targetLifeApps = specificOffice ? (specificOffice.annual_target_life_apps || 0) : offices.reduce((sum, o) => sum + (o.annual_target_life_apps || 0), 0);
      const targetPremium = specificOffice ? (specificOffice.annual_target_premium || 0) : offices.reduce((sum, o) => sum + (o.annual_target_premium || 0), 0);
      const targetAuto = specificOffice ? (specificOffice.annual_target_auto_apps || 0) : offices.reduce((sum, o) => sum + (o.annual_target_auto_apps || 0), 0);
      const targetFire = specificOffice ? (specificOffice.annual_target_fire_apps || 0) : offices.reduce((sum, o) => sum + (o.annual_target_fire_apps || 0), 0);
      const targetCommercial = specificOffice ? (specificOffice.annual_target_commercial_apps || 0) : offices.reduce((sum, o) => sum + (o.annual_target_commercial_apps || 0), 0);
      const targetHealth = specificOffice ? (specificOffice.annual_target_health_apps || 0) : offices.reduce((sum, o) => sum + (o.annual_target_health_apps || 0), 0);

      const teamSumTargets = team.reduce((acc, curr: any) => { acc.lifeApps += (curr.annual_target_life_apps || 0); acc.totalPremium += (curr.monthly_target_premium || 0) * 12; return acc; }, { lifeApps: 0, totalPremium: 0 });

      // Lapse/cancellation rates (ytd_lapse_cancel_rate/_auto/_fire/_commercial/_health)
      // live ONLY on `offices` (Settings -> Office Goals writes them there via
      // handleSaveOfficeGoals in app/dashboard/page.tsx) — there's no UI that
      // ever writes them onto `agencies`, so agencySettings?.ytd_lapse_cancel_*
      // is always undefined. That made the "All Locations" / Enterprise view
      // (specificOffice === null) permanently show 0% no matter what an owner
      // entered per-office. For a single office we still read that office's own
      // value directly; for "All Locations" we average every office's value —
      // same convention already used for avgLapseAuto/avgLapseFire in
      // app/dashboard/cockpit/page.tsx.
      const avgOfficeLapseRate = (field: string): number => {
        if (!offices.length) return num(agencySettings?.[field]);
        return offices.reduce((sum: number, o: any) => sum + num(o?.[field], num(agencySettings?.[field])), 0) / offices.length;
      };

      const agencyTargets = {
        lifeApps: targetLifeApps || teamSumTargets.lifeApps,
        totalPremium: targetPremium || teamSumTargets.totalPremium,
        lapseRateGlobal: specificOffice ? num(specificOffice?.ytd_lapse_cancel_rate, num(agencySettings?.ytd_lapse_cancel_rate)) : avgOfficeLapseRate('ytd_lapse_cancel_rate'),
        autoApps: targetAuto,
        lapseAuto: specificOffice ? num(specificOffice?.ytd_lapse_cancel_auto, num(agencySettings?.ytd_lapse_cancel_auto)) : avgOfficeLapseRate('ytd_lapse_cancel_auto'),
        fireApps: targetFire,
        lapseFire: specificOffice ? num(specificOffice?.ytd_lapse_cancel_fire, num(agencySettings?.ytd_lapse_cancel_fire)) : avgOfficeLapseRate('ytd_lapse_cancel_fire'),
        commercialApps: targetCommercial,
        lapseCommercial: specificOffice ? num(specificOffice?.ytd_lapse_cancel_commercial, num(agencySettings?.ytd_lapse_cancel_commercial)) : avgOfficeLapseRate('ytd_lapse_cancel_commercial'),
        healthApps: targetHealth,
        lapseHealth: specificOffice ? num(specificOffice?.ytd_lapse_cancel_health, num(agencySettings?.ytd_lapse_cancel_health)) : avgOfficeLapseRate('ytd_lapse_cancel_health'),
      };

      const ytdTimeFraction = daysPassed / daysInYear;

      const globalMultiplier = 1 - ((agencyTargets.lapseRateGlobal / 100) * ytdTimeFraction);
      const netYtdPremium = totals.ytdPremium * globalMultiplier;
      const netYtdLifeApps = Math.round(totals.ytdLifeApps * globalMultiplier);

      const priorYearAutoPif = specificOffice?.prior_pif_auto ?? agencySettings?.prior_pif_auto ?? 0;
      const priorYearFirePif = specificOffice?.prior_pif_fire ?? agencySettings?.prior_pif_fire ?? 0;

      const lostAuto = priorYearAutoPif * (agencyTargets.lapseAuto / 100) * ytdTimeFraction;
      const lostFire = priorYearFirePif * (agencyTargets.lapseFire / 100) * ytdTimeFraction;

      const netYtdAutoApps = Math.round(totals.ytdAutoApps - lostAuto);
      const netYtdFireApps = Math.round(totals.ytdFireApps - lostFire);

      const netYtdCommercialApps = Math.round(totals.ytdCommercialApps * (1 - ((agencyTargets.lapseCommercial / 100) * ytdTimeFraction)));
      const netYtdHealthApps = Math.round(totals.ytdHealthApps * (1 - ((agencyTargets.lapseHealth / 100) * ytdTimeFraction)));

      const runRateTotalPremium = (netYtdPremium / daysPassed) * daysInYear;
      const runRateLifeApps = Math.round((netYtdLifeApps / daysPassed) * daysInYear);
      const runRateAutoApps = Math.round((netYtdAutoApps / daysPassed) * daysInYear);
      const runRateFireApps = Math.round((netYtdFireApps / daysPassed) * daysInYear);
      const runRateCommercialApps = Math.round((netYtdCommercialApps / daysPassed) * daysInYear);
      const runRateHealthApps = Math.round((netYtdHealthApps / daysPassed) * daysInYear);

      return { name, totals, targets: agencyTargets, globalMultiplier, netYtdPremium, netYtdLifeApps, netYtdAutoApps, netYtdFireApps, netYtdCommercialApps, netYtdHealthApps, runRateTotalPremium, runRateLifeApps, runRateAutoApps, runRateFireApps, runRateCommercialApps, runRateHealthApps, daysPassed, daysInYear, travelStatus };
    };

    const filteredPolicies = officeFilter === "all" ? policies : policies.filter((p) => p.office_id === officeFilter);
    const globalName = officeFilter === "all" ? "Enterprise Global" : offices.find((o) => o.id === officeFilter)?.name || "Office";
    const globalOfficeObj = officeFilter === "all" ? null : offices.find((o) => o.id === officeFilter);
    const globalStats = calculateStats(filteredPolicies, globalName, globalOfficeObj);

    const locationsStats: any[] = [];
    if (officeFilter === "all") {
      offices.forEach((office) => {
        const officePolicies = policies.filter((p) => p.office_id === office.id);
        locationsStats.push(calculateStats(officePolicies, office.name, office));
      });
    } else {
      locationsStats.push(globalStats);
    }

    return { global: globalStats, locations: locationsStats };
  }, [status, policies, offices, team, agencySettings, officeFilter]);

  // Faithful port of the old revenueOverviewData useMemo (calculateRev),
  // delegating to the same shared utils/revenueEngine.ts helpers so the $
  // math can never drift from the main dashboard's.
  const revenueOverviewData = useMemo(() => {
    if (!ytdOverviewData || status !== "ready") return null;

    const linesDict = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const getParentLine = (line: string) => resolveParentLine(line, linesDict);
    const commissionRates = resolveCommissionRates(agencySettings?.commission_rates);
    const primaryOffice = offices[0] || null;

    const calcPoints = (actual: number, min: number, max: number, maxPct: number) => {
      if (actual <= min) return 0;
      if (actual >= max) return maxPct;
      return ((actual - min) / (max - min)) * maxPct;
    };

    const calculateRev = (ytdNode: any, pols: any[], name: string, specificOffice?: any) => {
      const rateOffice = specificOffice ?? primaryOffice;
      const autoVc = calcPoints(ytdNode.netYtdAutoApps, rateOffice?.vc_min_auto_gain ?? agencySettings?.vc_min_auto_gain ?? 0, rateOffice?.vc_max_auto_gain ?? agencySettings?.vc_max_auto_gain ?? 100, 1.0);
      const fireVc = calcPoints(ytdNode.netYtdFireApps, rateOffice?.vc_min_fire_gain ?? agencySettings?.vc_min_fire_gain ?? 0, rateOffice?.vc_max_fire_gain ?? agencySettings?.vc_max_fire_gain ?? 100, 1.0);

      const bLife = (rateOffice?.base_comm_life ?? agencySettings?.base_comm_life ?? 20) / 100;
      const bHealth = (rateOffice?.base_comm_health ?? agencySettings?.base_comm_health ?? 20) / 100;
      const ytdFsComm = (ytdNode.totals.ytdLifePremium * bLife) + ((ytdNode.totals.ytdHealthPremium || 0) * bHealth);

      const fsVc = calcPoints(ytdFsComm, rateOffice?.vc_min_fs_comm ?? agencySettings?.vc_min_fs_comm ?? 0, rateOffice?.vc_max_fs_comm ?? agencySettings?.vc_max_fs_comm ?? 10000, 2.0);
      const projectedVc = Math.min(3.0, autoVc + fireVc + fsVc);

      const runRateFsComm = (ytdFsComm / ytdNode.daysPassed) * ytdNode.daysInYear;
      const runRateAutoVc = calcPoints(ytdNode.runRateAutoApps, rateOffice?.vc_min_auto_gain ?? agencySettings?.vc_min_auto_gain ?? 0, rateOffice?.vc_max_auto_gain ?? agencySettings?.vc_max_auto_gain ?? 100, 1.0);
      const runRateFireVc = calcPoints(ytdNode.runRateFireApps, rateOffice?.vc_min_fire_gain ?? agencySettings?.vc_min_fire_gain ?? 0, rateOffice?.vc_max_fire_gain ?? agencySettings?.vc_max_fire_gain ?? 100, 1.0);
      const runRateFsVc = calcPoints(runRateFsComm, rateOffice?.vc_min_fs_comm ?? agencySettings?.vc_min_fs_comm ?? 0, rateOffice?.vc_max_fs_comm ?? agencySettings?.vc_max_fs_comm ?? 10000, 2.0);
      const runRateProjectedVc = Math.min(3.0, runRateAutoVc + runRateFireVc + runRateFsVc);

      let nbAutoPrem = 0, nbFirePrem = 0, nbCommPrem = 0, nbLifePrem = 0, nbHealthPrem = 0;
      const currentYear = new Date().getFullYear();
      pols.forEach((pol) => {
        const logDate = new Date(pol.bound_at || pol.written_at || pol.logged_at);
        if (logDate.getFullYear() === currentYear && (pol.status === "bound" || pol.status === "issued")) {
          const prem = Number(pol.premium_amount);
          const parentLine = getParentLine(pol.product_line);

          if (parentLine === "Auto") nbAutoPrem += prem;
          else if (parentLine === "Fire") nbFirePrem += prem;
          else if (parentLine === "Commercial") nbCommPrem += prem;
          else if (parentLine === "Life") nbLifePrem += prem;
          else if (parentLine === "Health") nbHealthPrem += prem;
        }
      });

      const nbBaselineMembers = specificOffice ? team.filter((t: any) => t.office_id === specificOffice.id) : team;
      const nbBaseline = nbBaselineMembers.reduce(
        (acc: any, m: any) => ({
          autoPremium: acc.autoPremium + (Number(m.starting_ytd_auto_premium) || 0),
          firePremium: acc.firePremium + (Number(m.starting_ytd_fire_premium) || 0),
          lifePremium: acc.lifePremium + (Number(m.starting_ytd_life_premium) || 0),
          healthPremium: acc.healthPremium + (Number(m.starting_ytd_health_premium) || 0),
        }),
        { autoPremium: 0, firePremium: 0, lifePremium: 0, healthPremium: 0 }
      );
      nbAutoPrem += nbBaseline.autoPremium;
      nbFirePrem += nbBaseline.firePremium;
      nbLifePrem += nbBaseline.lifePremium;
      nbHealthPrem += nbBaseline.healthPremium;

      const { totalNbRev, pncNbRev, lifeHealthNbRev } = calculateNewBusinessRevenue(
        { autoPremium: nbAutoPrem, firePremium: nbFirePrem, commercialPremium: nbCommPrem, lifePremium: nbLifePrem, healthPremium: nbHealthPrem },
        specificOffice || primaryOffice,
        agencySettings,
        commissionRates
      );

      const ytdTimeFraction = ytdNode.daysPassed / ytdNode.daysInYear;

      const { totalBookPremium, totalRenRev, pncRenRev, lifeHealthRenRev } = specificOffice
        ? calculateOfficeRenewalRevenue(specificOffice, agencySettings, commissionRates, ytdTimeFraction)
        : calculateEnterpriseRenewalRevenue(offices, agencySettings, commissionRates, ytdTimeFraction);

      return {
        name, projectedVc, autoVc, fireVc, fsVc, ytdFsComm,
        runRateAutoVc, runRateFireVc, runRateFsVc, runRateProjectedVc, runRateFsComm,
        runRateAutoApps: ytdNode.runRateAutoApps, runRateFireApps: ytdNode.runRateFireApps,
        lifeVc: fsVc, ytdLifePremium: ytdFsComm, totalNbRev, pncNbRev, lifeHealthNbRev,
        totalRenRev, pncRenRev, lifeHealthRenRev, totalBookPremium,
        totalAgencyRev: totalNbRev + totalRenRev, netYtdAutoApps: ytdNode.netYtdAutoApps, netYtdFireApps: ytdNode.netYtdFireApps,
      };
    };

    const filteredPolicies = officeFilter === "all" ? policies : policies.filter((p) => p.office_id === officeFilter);
    const globalName = officeFilter === "all" ? "Enterprise Global" : offices.find((o) => o.id === officeFilter)?.name || "Office";
    const globalOfficeObj = officeFilter === "all" ? null : offices.find((o) => o.id === officeFilter);
    const globalRev = calculateRev(ytdOverviewData.global, filteredPolicies, globalName, globalOfficeObj);

    const locationsRev: any[] = [];
    if (officeFilter === "all") {
      offices.forEach((office, i) => {
        const officePolicies = policies.filter((p) => p.office_id === office.id);
        const locNode = ytdOverviewData.locations?.[i] || ytdOverviewData.global;
        locationsRev.push(calculateRev(locNode, officePolicies, office.name, office));
      });
    } else {
      locationsRev.push(globalRev);
    }

    return { global: globalRev, locations: locationsRev };
  }, [status, policies, offices, team, agencySettings, ytdOverviewData, officeFilter]);

  const revenueCustomTargets = useMemo(() => {
    if (status !== "ready") return [];
    const linesDict = agencySettings?.custom_product_lines || DEFAULT_PRODUCT_LINES;
    const enriched = enrichCustomTargets(customTargets, customTargetActivities, customTargetPolicies, linesDict, offices);
    return enriched.filter((t) => t.display_location === "revenue");
  }, [status, customTargets, customTargetActivities, customTargetPolicies, agencySettings, offices]);

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" aria-hidden="true" />
        <p className="mt-6 text-sm font-semibold text-gray-500">Assembling your Agent Dashboard…</p>
      </div>
    );
  }

  if (status === "forbidden") {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 px-4 text-center">
        <ShieldAlert className="h-10 w-10 text-amber-500" aria-hidden="true" />
        <h1 className="text-xl font-black text-gray-900">Owners Only</h1>
        <p className="max-w-md text-sm font-semibold text-gray-500">
          The Agent Dashboard is reserved for this agency&apos;s Owner. If you believe you should have access, ask your agency owner to check your role in Settings → Team.
        </p>
        <button
          onClick={() => setActiveTab("dashboard")}
          className="mt-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-indigo-700"
        >
          Back To Scoreboard
        </button>
      </div>
    );
  }

  if (status === "error" || !ytdOverviewData || !revenueOverviewData) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 px-4 text-center">
        <AlertCircle className="h-10 w-10 text-red-500" aria-hidden="true" />
        <p className="max-w-md text-sm font-semibold text-gray-500">{errorMsg || "We couldn't load the Agent Dashboard."}</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700 mb-3">
            <Crown size={14} /> Agent Dashboard · Owner Command Center
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-gray-900">
            {ownerFirstName ? `${ownerFirstName}'s` : "Your"} Master Command Center
          </h1>
          <p className="text-gray-500 mt-2 max-w-2xl">
            Everything the standalone Year-to-Date (YTD) Projections and Revenue &amp; Variable Compensation tabs used to
            show, combined into one continuous view — macro pacing at the top, flowing down into what it means for
            cash flow and next year&apos;s Variable Compensation (VC) tier.
          </p>
        </div>

        {offices.length > 1 && (
          <div className="w-full sm:w-64 shrink-0">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 block">Location View</label>
            <select
              value={officeFilter}
              onChange={(e) => setOfficeFilter(e.target.value)}
              className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 outline-none focus:ring-2 focus:ring-indigo-600 shadow-sm"
            >
              <option value="all">🌍 All Locations</option>
              {offices.map((o: any) => (
                <option key={o.id} value={o.id}>📍 {o.name}</option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* YEAR-TO-DATE MACRO PACING (top of the funnel) */}
      <YtdTab ytdOverviewData={ytdOverviewData} agencySettings={agencySettings} />

      {/* REVENUE & VARIABLE COMPENSATION PROJECTIONS (flows from the YTD data above) */}
      <RevenueTab
        revenueOverviewData={revenueOverviewData}
        ytdOverviewData={ytdOverviewData}
        agencySettings={agencySettings}
        primaryOffice={offices[0] || null}
        customTargets={revenueCustomTargets}
      />
    </div>
  );
}
