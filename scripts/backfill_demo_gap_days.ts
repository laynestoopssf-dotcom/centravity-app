// =============================================================================
// One-off (but re-runnable) healer for missed days in the Demo Agency's daily
// simulator. app/api/cron/simulate-demo/route.ts only ever generates "today" -
// if that cron didn't fire for a stretch of days (e.g. a misconfigured env
// var on the Vercel deployment - see the CRON_SECRET/DEMO_AGENCY_ID/
// DEMO_OFFICE_ID guards at the top of that route), this fills in exactly the
// missing calendar days using the SAME utils/demoSimulator.ts engine, at the
// SAME daily rate math, so the rolling 30-day charts don't show a dip.
//
// Same "kept in sync manually" ANNUAL_GOALS/PRODUCER_NAME_WEIGHTS/
// PIPELINE_DAILY_LAMBDA as app/api/cron/simulate-demo/route.ts - copy any
// future change there over here too (that route isn't importable here, same
// reason scripts/seed_demo_agency.ts's header comment gives: this runs under
// plain Node/tsx, not Next's bundler, and app/actions/supabaseAdmin.ts's
// `import "server-only"` throws outside of it).
//
// Idempotent per day: skips any date that already has activity rows for this
// agency, exactly like the cron's own guard - safe to re-run, safe to run
// with a date range that overlaps days that already succeeded.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/backfill_demo_gap_days.ts 2026-08-29 2026-08-31
//   (inclusive start/end, both required, both YYYY-MM-DD in the agency's own
//   local calendar days - not UTC)
// =============================================================================

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  LOB_LIST,
  type AnnualGoals,
  type LineOfBusiness,
  type ProducerWeight,
  computeAvgPremiumPerApp,
  generateDayOfProduction,
  generateOpenPipeline,
  poissonSample,
} from "../utils/demoSimulator";

function normalizeSupabaseUrl(raw: string): string {
  let url = (raw || "").trim().replace(/['"]/g, "");
  url = url.replace(/\/rest\/v1\/?$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

const SUPABASE_URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DEMO_AGENCY_ID = process.env.DEMO_AGENCY_ID || "";
const DEMO_OFFICE_ID = process.env.DEMO_OFFICE_ID || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DEMO_AGENCY_ID || !DEMO_OFFICE_ID) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DEMO_AGENCY_ID / DEMO_OFFICE_ID. Run with --env-file=.env.local.");
  process.exit(1);
}

const [startArg, endArg] = process.argv.slice(2);
if (!startArg || !endArg || !/^\d{4}-\d{2}-\d{2}$/.test(startArg) || !/^\d{4}-\d{2}-\d{2}$/.test(endArg)) {
  console.error("Usage: npx tsx --env-file=.env.local scripts/backfill_demo_gap_days.ts YYYY-MM-DD YYYY-MM-DD");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// Mirrors app/api/cron/simulate-demo/route.ts exactly.
const ANNUAL_GOALS: AnnualGoals = {
  Auto: { apps: 650, premium: 550_000 },
  Fire: { apps: 550, premium: 660_000 },
  Commercial: { apps: 30, premium: 36_000 },
  Life: { apps: 90, premium: 79_000 },
  Health: { apps: 30, premium: 25_000 },
};

const PRODUCER_NAME_WEIGHTS: { firstName: string; lastName: string; weight: number; closeRate: number; quoteRate: number }[] = [
  { firstName: "Jordan", lastName: "Price", weight: 0.2, closeRate: 0.22, quoteRate: 0.32 },
  { firstName: "Casey", lastName: "Rivera", weight: 0.3, closeRate: 0.26, quoteRate: 0.34 },
  { firstName: "Taylor", lastName: "Brooks", weight: 0.28, closeRate: 0.23, quoteRate: 0.3 },
  { firstName: "Sam", lastName: "Whitfield", weight: 0.22, closeRate: 0.2, quoteRate: 0.28 },
];

const PRODUCTION_DAYS_PER_WEEK = 5;

const PIPELINE_DAILY_LAMBDA: Record<LineOfBusiness, number> = {
  Auto: 0.67,
  Fire: 0.57,
  Commercial: 0.14,
  Life: 0.38,
  Health: 0.19,
};

function countBusinessDaysInRange(start: Date, end: Date, productionDaysPerWeek: number): number {
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const day = cursor.getDay();
    const isBiz = day === 0 ? false : day === 6 ? productionDaysPerWeek >= 6 : true;
    if (isBiz) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

async function resolveProducers(): Promise<ProducerWeight[]> {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("agency_id", DEMO_AGENCY_ID)
    .in("role", ["producer", "manager"]);
  if (error) throw new Error(`failed to load producer profiles: ${error.message}`);

  const nameToWeights = new Map(PRODUCER_NAME_WEIGHTS.map((p) => [`${p.firstName.toLowerCase()} ${p.lastName.toLowerCase()}`, p]));
  const producers: ProducerWeight[] = [];
  for (const profile of profiles || []) {
    const key = `${(profile.first_name || "").toLowerCase()} ${(profile.last_name || "").toLowerCase()}`;
    const match = nameToWeights.get(key);
    if (match) producers.push({ userId: profile.id, weight: match.weight, closeRate: match.closeRate, quoteRate: match.quoteRate });
  }
  return producers;
}

async function dayAlreadyHasData(dayStart: Date, dayEnd: Date): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("agency_id", DEMO_AGENCY_ID)
    .gte("logged_at", dayStart.toISOString())
    .lte("logged_at", dayEnd.toISOString());
  if (error) throw new Error(`idempotency check failed: ${error.message}`);
  return (count || 0) > 0;
}

async function main() {
  const producers = await resolveProducers();
  if (producers.length !== PRODUCER_NAME_WEIGHTS.length) {
    console.error(`Expected ${PRODUCER_NAME_WEIGHTS.length} producers, found ${producers.length} - has the demo agency been seeded?`);
    process.exit(1);
  }

  const avgPremiumPerApp = computeAvgPremiumPerApp(ANNUAL_GOALS);
  const [startY, startM, startD] = startArg.split("-").map(Number);
  const [endY, endM, endD] = endArg.split("-").map(Number);
  const cursor = new Date(startY, startM - 1, startD);
  const rangeEnd = new Date(endY, endM - 1, endD);

  while (cursor <= rangeEnd) {
    const dayStart = new Date(cursor);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setHours(23, 59, 59, 999);

    if (await dayAlreadyHasData(dayStart, dayEnd)) {
      console.log(`${cursor.toDateString()}: already has data - skipping.`);
      cursor.setDate(cursor.getDate() + 1);
      continue;
    }

    const year = cursor.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const fullYearEnd = new Date(year, 11, 31);
    const fullYearBusinessDays = Math.max(1, countBusinessDaysInRange(jan1, fullYearEnd, PRODUCTION_DAYS_PER_WEEK));

    const dailyTeamRate: Record<LineOfBusiness, number> = {} as Record<LineOfBusiness, number>;
    for (const lob of LOB_LIST) {
      const hotMultiplier = 1.05 + Math.random() * 0.1;
      dailyTeamRate[lob] = (ANNUAL_GOALS[lob].apps / fullYearBusinessDays) * hotMultiplier;
    }

    const { policies, activities } = generateDayOfProduction({
      date: cursor,
      agencyId: DEMO_AGENCY_ID,
      officeId: DEMO_OFFICE_ID,
      producers,
      avgPremiumPerApp,
      dailyTeamRate,
      productionDaysPerWeek: PRODUCTION_DAYS_PER_WEEK,
      policyStatus: "issued", // fully in the past - the "still bound, not yet issued" 3-day-recency window doesn't apply
      makeId: () => randomUUID(),
      earliestDate: dayStart,
      latestDate: dayEnd,
    });

    const newPipelineCountByLob: Record<LineOfBusiness, number> = {} as Record<LineOfBusiness, number>;
    for (const lob of LOB_LIST) newPipelineCountByLob[lob] = poissonSample(PIPELINE_DAILY_LAMBDA[lob]);
    const openPipeline = generateOpenPipeline({
      agencyId: DEMO_AGENCY_ID,
      officeId: DEMO_OFFICE_ID,
      producers,
      avgPremiumPerApp,
      countByLob: newPipelineCountByLob,
      earliestDate: dayStart,
      latestDate: dayEnd,
      makeId: () => randomUUID(),
    });
    policies.push(...openPipeline);

    if (policies.length > 0) {
      const { error: policiesError } = await supabaseAdmin.from("policies").insert(policies);
      if (policiesError) throw new Error(`policy insert failed for ${cursor.toDateString()}: ${policiesError.message}`);
    }
    if (activities.length > 0) {
      const { error: activitiesError } = await supabaseAdmin.from("activities").insert(activities);
      if (activitiesError) throw new Error(`activity insert failed for ${cursor.toDateString()}: ${activitiesError.message}`);
    }

    console.log(`${cursor.toDateString()}: inserted ${policies.length} policies (incl. ${openPipeline.length} open pipeline), ${activities.length} activities.`);
    cursor.setDate(cursor.getDate() + 1);
  }

  console.log("Backfill complete.");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
