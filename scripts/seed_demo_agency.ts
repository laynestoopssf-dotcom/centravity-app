// =============================================================================
// DEMO AGENCY SIMULATOR — two-stage historical seed
// -----------------------------------------------------------------------------
// Builds a fully isolated, walled-off demo agency: 1 owner, 1 producing office
// manager, 3 dedicated producers, 2 non-producing service team members, all
// scoped to the single DEMO_AGENCY_ID / DEMO_OFFICE_ID pair pinned in
// .env.local. No code path in this file ever queries or writes "all
// agencies" — every read/write below is filtered by those two fixed ids.
//
// Re-runnable: wipes any prior demo rows (auth users, profiles, policies,
// activities, office, agency) scoped to DEMO_AGENCY_ID, then rebuilds from
// scratch. Safe to run again after changing the goals below.
//
// Run with:  npm run seed:demo
// (= `tsx --env-file=.env.local scripts/seed_demo_agency.ts`)
//
// Deliberately does NOT import app/actions/supabaseAdmin.ts — that module
// does `import "server-only"`, which throws when resolved by plain Node/tsx
// outside of Next's bundler (Next's webpack/turbopack maps that import to a
// no-op via the "react-server" export condition; plain Node has no such
// condition and resolves to the throwing default instead). This script builds
// its own minimal admin client for the same reason app/api/cron/simulate-demo
// gets to reuse the real shared one (it runs inside Next).
// =============================================================================

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  LOB_LIST,
  type AnnualGoals,
  type LineOfBusiness,
  type ProducerWeight,
  type GeneratedActivityRow,
  type GeneratedPolicyRow,
  computeAvgPremiumPerApp,
  generateDayOfProduction,
  generateOpenPipeline,
} from "../utils/demoSimulator";
import { DEFAULT_STATE_FARM_PRODUCT_LINES } from "../utils/defaultProductLines";

// -----------------------------------------------------------------------------
// Env / admin client
// -----------------------------------------------------------------------------

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
const DEMO_LOGIN_PASSWORD = process.env.DEMO_LOGIN_PASSWORD || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run via `npm run seed:demo` (loads .env.local).");
  process.exit(1);
}
if (!DEMO_AGENCY_ID || !DEMO_OFFICE_ID || !DEMO_LOGIN_PASSWORD) {
  console.error("Missing DEMO_AGENCY_ID / DEMO_OFFICE_ID / DEMO_LOGIN_PASSWORD in .env.local.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// -----------------------------------------------------------------------------
// The roster
// -----------------------------------------------------------------------------

type RosterRole = "owner" | "manager" | "producer" | "service";

interface RosterMember {
  firstName: string;
  lastName: string;
  email: string;
  role: RosterRole;
  /** Fraction of team production this producer carries. Only set for the 4 producing roles; sums to 1. */
  weight?: number;
  closeRate?: number;
  quoteRate?: number;
}

// All emails use the IETF-reserved (RFC 2606) .invalid TLD, guaranteed to
// never resolve/deliver — so the existing hourly eod_brief Edge Function
// (which emails every agency owner by real address) always fails closed for
// this owner instead of ever reaching a real inbox. Zero changes needed there.
const ROSTER: RosterMember[] = [
  { firstName: "Morgan", lastName: "Ellis", email: "morgan.ellis@centravitydemo.invalid", role: "owner" },
  { firstName: "Jordan", lastName: "Price", email: "jordan.price@centravitydemo.invalid", role: "manager", weight: 0.2, closeRate: 0.22, quoteRate: 0.32 },
  { firstName: "Casey", lastName: "Rivera", email: "casey.rivera@centravitydemo.invalid", role: "producer", weight: 0.3, closeRate: 0.26, quoteRate: 0.34 },
  { firstName: "Taylor", lastName: "Brooks", email: "taylor.brooks@centravitydemo.invalid", role: "producer", weight: 0.28, closeRate: 0.23, quoteRate: 0.3 },
  { firstName: "Sam", lastName: "Whitfield", email: "sam.whitfield@centravitydemo.invalid", role: "producer", weight: 0.22, closeRate: 0.2, quoteRate: 0.28 },
  { firstName: "Riley", lastName: "Chen", email: "riley.chen@centravitydemo.invalid", role: "service" },
  { firstName: "Avery", lastName: "Nguyen", email: "avery.nguyen@centravitydemo.invalid", role: "service" },
];

const PRODUCING_ROSTER = ROSTER.filter((r) => r.weight != null);

// -----------------------------------------------------------------------------
// The Annual Model
// -----------------------------------------------------------------------------

const ANNUAL_GOALS: AnnualGoals = {
  Auto: { apps: 650, premium: 550_000 },
  Fire: { apps: 550, premium: 660_000 },
  Commercial: { apps: 30, premium: 36_000 },
  Life: { apps: 90, premium: 79_000 },
  Health: { apps: 30, premium: 25_000 },
};

const TOTAL_ANNUAL_APPS = LOB_LIST.reduce((sum, lob) => sum + ANNUAL_GOALS[lob].apps, 0);
const TOTAL_ANNUAL_PREMIUM = LOB_LIST.reduce((sum, lob) => sum + ANNUAL_GOALS[lob].premium, 0);
const AVG_PREMIUM_PER_APP = computeAvgPremiumPerApp(ANNUAL_GOALS);

// Currently-open ("quoted", never bound/issued) pipeline, sized so Pipeline
// Potential / Active Pipeline widgets (app/dashboard/cockpit's
// pendingCarryOver/pendingLifeCred/pendingHealthCred, and the "Active
// Pipeline"/"Pending Pipeline" list views in components/DashboardTab.tsx,
// LifeTab.tsx, CommissionTab.tsx, LedgerTab.tsx) have something real to show,
// on top of the closed-won production Stage 1/2 generate above. Kept as a
// fixed, roughly-steady-state pool (see generateOpenPipeline's own doc
// comment) rather than scaled off the full annual goal, so it reads as
// "what's actively being worked right now" instead of ballooning with the
// agency's overall size.
const OPEN_PIPELINE_COUNTS: Record<LineOfBusiness, number> = {
  Auto: 14,
  Fire: 12,
  Commercial: 3,
  Life: 8,
  Health: 4,
};
const OPEN_PIPELINE_WINDOW_DAYS = 21;

// Office-level fields, written to offices.id = DEMO_OFFICE_ID (the canonical,
// actively-read location for annual targets/book/lapse/comm/vc app-wide — see
// app/actions/onboarding.ts saveStep4Baseline/saveStep5Goals and
// app/dashboard/page.tsx handleSaveOfficeGoals). Prior-book + comp assumptions
// aren't given explicitly by the spec; these are plausible values sized so
// the lapse rates below produce a visible effect on Net YTD apps and renewal
// revenue math (an agency this size plausibly carries ~$5M combined book).
const OFFICE_FIELDS = {
  name: "Demo HQ",
  city: "Scottsdale",
  state: "AZ",

  annual_target_premium: TOTAL_ANNUAL_PREMIUM,
  annual_target_auto_apps: ANNUAL_GOALS.Auto.apps,
  annual_target_fire_apps: ANNUAL_GOALS.Fire.apps,
  annual_target_commercial_apps: ANNUAL_GOALS.Commercial.apps,
  annual_target_life_apps: ANNUAL_GOALS.Life.apps,
  annual_target_health_apps: ANNUAL_GOALS.Health.apps,

  ytd_lapse_cancel_rate: 10,
  ytd_lapse_cancel_auto: 11,
  ytd_lapse_cancel_fire: 12,
  ytd_lapse_cancel_commercial: 9,
  ytd_lapse_cancel_health: 7,
  prev_month_lapse_auto: 12,
  prev_month_lapse_fire: 13,

  prior_pif_auto: 1800,
  prior_pif_fire: 1500,
  book_size_auto: 2_200_000,
  book_size_fire: 2_600_000,
  book_size_commercial: 140_000,
  book_size_life: 300_000,
  book_size_health: 95_000,

  base_comm_auto: 10,
  base_comm_fire: 10,
  base_comm_life: 55,
  base_comm_health: 20,

  current_vc_rate: 1.8,
  vc_min_auto_gain: 0,
  vc_max_auto_gain: 100,
  vc_min_fire_gain: 0,
  vc_max_fire_gain: 100,
  vc_min_fs_comm: 0,
  vc_max_fs_comm: 10_000,
};

// Agency-level fields — Roam Qualifier tiers (travel_lvl*) and the Corporate
// Targets toggles are agency-only (see components/YtdTab.tsx, app/dashboard/
// cockpit/page.tsx). Lapse/book/vc are mirrored here too since
// utils/revenueEngine.ts falls back office → agency for those.
const AGENCY_FIELDS = {
  name: "Centravity Demo Agency",
  timezone: "America/Los_Angeles",
  production_days_per_week: 5,
  target_vc_active: true,
  target_travel_active: true,

  // Same catalog real new agencies get on first creation (see
  // app/actions/onboarding.ts's saveStep1Foundation + utils/defaultProductLines.ts) -
  // without this, the demo's Scoreboard logging dropdowns fell back to the generic
  // 5-line placeholder set instead of showing the real State Farm sub-lines a
  // prospect touring the demo would actually expect to see.
  custom_product_lines: DEFAULT_STATE_FARM_PRODUCT_LINES,

  current_vc_rate: 1.8,
  ytd_lapse_cancel_rate: 10,
  ytd_lapse_cancel_auto: 11,
  ytd_lapse_cancel_fire: 12,
  ytd_lapse_cancel_commercial: 9,
  ytd_lapse_cancel_health: 7,
  prev_month_lapse_auto: 12,
  prev_month_lapse_fire: 13,
  book_size_auto: 2_200_000,
  book_size_fire: 2_600_000,
  book_size_commercial: 140_000,
  book_size_life: 300_000,
  book_size_health: 95_000,

  // "Roam Qualifier": Level 1 given exactly as 70 Life apps + $41,300 combined
  // life/health premium. Levels 2+ aren't specified — filled in with a
  // sensible escalating ladder so the tier-progression UI shows real partial
  // credit instead of every level above 1 defaulting to a 0-app threshold.
  travel_lvl1_apps: 70,
  travel_lvl1_life_cred: 25_000,
  travel_lvl1_total_cred: 41_300,
  travel_lvl2_apps: 100,
  travel_lvl2_life_cred: 35_000,
  travel_lvl2_total_cred: 58_000,
  travel_lvl3_apps: 140,
  travel_lvl3_life_cred: 50_000,
  travel_lvl3_total_cred: 82_000,
  travel_exotic_apps: 180,
  travel_exotic_life_cred: 65_000,
  travel_exotic_total_cred: 105_000,
  travel_exotic_plus_apps: 220,
  travel_exotic_plus_life_cred: 80_000,
  travel_exotic_plus_total_cred: 130_000,
};

// -----------------------------------------------------------------------------
// Per-producer targets, derived from their weight share of the office model
// -----------------------------------------------------------------------------

function buildProfileTargets(member: RosterMember) {
  const weight = member.weight || 0;
  const closeRate = member.closeRate || 0.22;
  const quoteRate = member.quoteRate || 0.3;

  const monthlyTargetPremium = Math.round((weight * TOTAL_ANNUAL_PREMIUM) / 12);
  const monthlyTargetBound = Math.round((weight * TOTAL_ANNUAL_APPS) / 12);
  const weeklyTargetBound = Math.max(1, Math.round(weight === 0 ? 0 : (monthlyTargetBound * 12) / 52));
  const dailyTargetBound = Math.max(1, Math.round(weeklyTargetBound / 5));
  const dailyTargetQuotes = Math.max(1, Math.round(dailyTargetBound / closeRate));
  const dailyTargetTouchpoints = Math.max(1, Math.round(dailyTargetQuotes / quoteRate));

  return {
    monthly_target_premium: monthlyTargetPremium,
    monthly_target_bound: monthlyTargetBound,
    weekly_target_bound: weeklyTargetBound,
    weekly_target_quotes: dailyTargetQuotes * 5,
    weekly_target_touchpoints: dailyTargetTouchpoints * 5,
    daily_target_bound: dailyTargetBound,
    daily_target_quotes: dailyTargetQuotes,
    daily_target_touchpoints: dailyTargetTouchpoints,
    annual_target_life_apps: Math.round(weight * ANNUAL_GOALS.Life.apps),
    annual_target_life_premium: Math.round(weight * ANNUAL_GOALS.Life.premium),
    monthly_base_salary: member.role === "manager" ? 3000 : member.role === "owner" ? 4500 : member.role === "service" ? 2800 : 0,
  };
}

// -----------------------------------------------------------------------------
// Step 1 — wipe any prior demo rows
// -----------------------------------------------------------------------------

async function wipeExistingDemoData() {
  console.log("Wiping any prior demo agency data...");

  // Children first, then parents — a run that died partway through (e.g. the
  // activities insert failing after policies/profiles/auth users were already
  // created) leaves rows at every level, and deleting profiles/auth users
  // before their referencing policies/activities would risk an FK violation
  // instead of a clean wipe. Every delete below is scoped to
  // DEMO_AGENCY_ID/DEMO_OFFICE_ID, so this is safe to run against a fully
  // fresh project too (each delete is just a no-op).
  await supabaseAdmin.from("policies").delete().eq("agency_id", DEMO_AGENCY_ID);
  await supabaseAdmin.from("activities").delete().eq("agency_id", DEMO_AGENCY_ID);

  const { data: existingProfiles } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("agency_id", DEMO_AGENCY_ID);

  for (const p of existingProfiles || []) {
    const { error } = await supabaseAdmin.auth.admin.deleteUser(p.id);
    if (error) console.warn(`  (non-fatal) failed to delete auth user ${p.id}:`, error.message);
  }

  // Known-fixed demo emails too, in case a profile row was ever deleted out from under its auth user.
  for (const member of ROSTER) {
    const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
    const match = existing?.users?.find((u) => u.email?.toLowerCase() === member.email);
    if (match) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(match.id);
      if (error) console.warn(`  (non-fatal) failed to delete stray auth user ${member.email}:`, error.message);
    }
  }

  await supabaseAdmin.from("profiles").delete().eq("agency_id", DEMO_AGENCY_ID);
  await supabaseAdmin.from("offices").delete().eq("id", DEMO_OFFICE_ID);
  await supabaseAdmin.from("agencies").delete().eq("id", DEMO_AGENCY_ID);

  console.log("  done.");
}

// -----------------------------------------------------------------------------
// Step 2 — rebuild agency, office, roster
// -----------------------------------------------------------------------------

async function createAgencyAndOffice() {
  console.log("Creating demo agency + office...");

  const { error: agencyError } = await supabaseAdmin
    .from("agencies")
    .insert([{ id: DEMO_AGENCY_ID, ...AGENCY_FIELDS }]);
  if (agencyError) throw new Error(`agency insert failed: ${agencyError.message}`);

  const { error: officeError } = await supabaseAdmin
    .from("offices")
    .insert([{ id: DEMO_OFFICE_ID, agency_id: DEMO_AGENCY_ID, ...OFFICE_FIELDS }]);
  if (officeError) throw new Error(`office insert failed: ${officeError.message}`);

  console.log("  done.");
}

async function createRoster(): Promise<Map<string, string>> {
  console.log("Creating 7 demo profiles (real Supabase Auth logins)...");
  const emailToId = new Map<string, string>();

  for (const member of ROSTER) {
    const { data: createdAuth, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: member.email,
      password: DEMO_LOGIN_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: `${member.firstName} ${member.lastName}` },
    });

    if (createUserError || !createdAuth?.user) {
      throw new Error(`createUser failed for ${member.email}: ${createUserError?.message}`);
    }

    const userId = createdAuth.user.id;
    emailToId.set(member.email, userId);

    const targets = buildProfileTargets(member);

    const { error: profileError } = await supabaseAdmin.from("profiles").insert([
      {
        id: userId,
        agency_id: DEMO_AGENCY_ID,
        office_id: DEMO_OFFICE_ID,
        first_name: member.firstName,
        last_name: member.lastName,
        role: member.role,
        is_archived: false,
        is_floater: false,
        onboarding_completed: true,
        ...targets,
      },
    ]);

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(`profile insert failed for ${member.email}: ${profileError.message}`);
    }

    console.log(`  ${member.firstName} ${member.lastName} (${member.role}) -> ${member.email}`);
  }

  return emailToId;
}

// -----------------------------------------------------------------------------
// Step 3 — two-stage historical production
// -----------------------------------------------------------------------------

function toProducerWeights(emailToId: Map<string, string>): ProducerWeight[] {
  return PRODUCING_ROSTER.map((m) => ({
    userId: emailToId.get(m.email)!,
    weight: m.weight!,
    closeRate: m.closeRate!,
    quoteRate: m.quoteRate!,
  }));
}

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

async function insertChunked(table: "policies" | "activities", rows: (GeneratedPolicyRow | GeneratedActivityRow)[]) {
  const CHUNK_SIZE = 500;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabaseAdmin.from(table).insert(chunk);
    if (error) throw new Error(`bulk insert into ${table} failed: ${error.message}`);
  }
}

async function generateHistory(emailToId: Map<string, string>) {
  const producers = toProducerWeights(emailToId);
  const now = new Date();
  const year = now.getFullYear();

  const jan1 = new Date(year, 0, 1);
  const jul15 = new Date(year, 6, 15);
  const today = new Date(now);
  today.setHours(23, 59, 59, 0);

  const stage1End = jul15 < today ? jul15 : today;
  const productionDaysPerWeek = AGENCY_FIELDS.production_days_per_week;

  console.log(`Stage 1: ${jan1.toDateString()} -> ${stage1End.toDateString()} (target: 60-65% of annual goals)`);

  // Randomized-but-fixed per-LOB fraction in [0.60, 0.65] so the team lands
  // organically spread across that band instead of every LOB landing at
  // exactly the same round number.
  const stage1Fraction: Record<LineOfBusiness, number> = {} as Record<LineOfBusiness, number>;
  for (const lob of LOB_LIST) stage1Fraction[lob] = 0.6 + Math.random() * 0.05;

  const stage1BusinessDays = Math.max(1, countBusinessDaysInRange(jan1, stage1End, productionDaysPerWeek));
  const stage1DailyTeamRate: Record<LineOfBusiness, number> = {} as Record<LineOfBusiness, number>;
  for (const lob of LOB_LIST) {
    stage1DailyTeamRate[lob] = (ANNUAL_GOALS[lob].apps * stage1Fraction[lob]) / stage1BusinessDays;
  }

  const allPolicies: GeneratedPolicyRow[] = [];
  const allActivities: GeneratedActivityRow[] = [];

  const cursor = new Date(jan1);
  while (cursor <= stage1End) {
    const { policies, activities } = generateDayOfProduction({
      date: new Date(cursor),
      agencyId: DEMO_AGENCY_ID,
      officeId: DEMO_OFFICE_ID,
      producers,
      avgPremiumPerApp: AVG_PREMIUM_PER_APP,
      dailyTeamRate: stage1DailyTeamRate,
      productionDaysPerWeek,
      policyStatus: "issued",
      makeId: randomUUID,
      earliestDate: jan1,
      latestDate: stage1End,
    });
    allPolicies.push(...policies);
    allActivities.push(...activities);
    cursor.setDate(cursor.getDate() + 1);
  }

  const stage1TotalsByLob: Record<LineOfBusiness, number> = { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 };
  for (const p of allPolicies) stage1TotalsByLob[p.product_line]++;

  // Stage 2 only runs if today is actually after Stage 1's end (normal case).
  if (today > stage1End) {
    const stage2Start = new Date(stage1End);
    stage2Start.setDate(stage2Start.getDate() + 1);
    console.log(`Stage 2: ${stage2Start.toDateString()} -> ${today.toDateString()} (organic day-by-day at ~1.05-1.15x run-rate)`);

    const fullYearEnd = new Date(year, 11, 31);
    const fullYearBusinessDays = Math.max(1, countBusinessDaysInRange(jan1, fullYearEnd, productionDaysPerWeek));

    const hotMultiplier: Record<LineOfBusiness, number> = {} as Record<LineOfBusiness, number>;
    for (const lob of LOB_LIST) hotMultiplier[lob] = 1.05 + Math.random() * 0.1;

    const stage2DailyTeamRate: Record<LineOfBusiness, number> = {} as Record<LineOfBusiness, number>;
    for (const lob of LOB_LIST) {
      stage2DailyTeamRate[lob] = (ANNUAL_GOALS[lob].apps / fullYearBusinessDays) * hotMultiplier[lob];
    }

    // The most recent 3 days read as "bound" (not yet carrier-issued) for realism.
    const recentCutoff = new Date(today);
    recentCutoff.setDate(recentCutoff.getDate() - 3);

    const stage2Cursor = new Date(stage2Start);
    while (stage2Cursor <= today) {
      const status: "bound" | "issued" = stage2Cursor >= recentCutoff ? "bound" : "issued";
      const { policies, activities } = generateDayOfProduction({
        date: new Date(stage2Cursor),
        agencyId: DEMO_AGENCY_ID,
        officeId: DEMO_OFFICE_ID,
        producers,
        avgPremiumPerApp: AVG_PREMIUM_PER_APP,
        dailyTeamRate: stage2DailyTeamRate,
        productionDaysPerWeek,
        policyStatus: status,
        makeId: randomUUID,
        earliestDate: stage2Start,
        latestDate: today,
      });
      allPolicies.push(...policies);
      allActivities.push(...activities);
      stage2Cursor.setDate(stage2Cursor.getDate() + 1);
    }
  }

  // Open ("quoted") pipeline — a fixed, recent-dated pool on top of the
  // closed-won history above. Scoped to the same 4 producers so their
  // individual pipeline views look as populated as the agency-wide one (see
  // OPEN_PIPELINE_COUNTS' doc comment for why this isn't folded into the
  // day-by-day Stage 2 loop).
  const pipelineEarliest = new Date(today);
  pipelineEarliest.setDate(pipelineEarliest.getDate() - OPEN_PIPELINE_WINDOW_DAYS);
  const openPipeline = generateOpenPipeline({
    agencyId: DEMO_AGENCY_ID,
    officeId: DEMO_OFFICE_ID,
    producers,
    avgPremiumPerApp: AVG_PREMIUM_PER_APP,
    countByLob: OPEN_PIPELINE_COUNTS,
    earliestDate: pipelineEarliest,
    latestDate: today,
    makeId: randomUUID,
  });
  allPolicies.push(...openPipeline);

  console.log(`Generated ${allPolicies.length} policies (incl. ${openPipeline.length} open pipeline) and ${allActivities.length} activities. Inserting...`);
  await insertChunked("policies", allPolicies);
  await insertChunked("activities", allActivities);
  console.log("  done.");

  return { allPolicies };
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

function printSummary(policies: GeneratedPolicyRow[]) {
  console.log("\n=============================================================");
  console.log("DEMO AGENCY SEEDED SUCCESSFULLY");
  console.log("=============================================================");
  console.log(`Agency ID: ${DEMO_AGENCY_ID}`);
  console.log(`Office ID: ${DEMO_OFFICE_ID}`);
  console.log("\nLogins (shared password below):");
  console.log("  Name              Role       Email");
  for (const m of ROSTER) {
    console.log(`  ${m.firstName} ${m.lastName}`.padEnd(20) + `${m.role}`.padEnd(11) + m.email);
  }
  console.log(`\nShared password: ${DEMO_LOGIN_PASSWORD}`);

  console.log("\n%-of-annual-goal reached (closed-won only, today):");
  const countsByLob: Record<LineOfBusiness, number> = { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 };
  const pipelineByLob: Record<LineOfBusiness, number> = { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 };
  const pipelinePremiumByLob: Record<LineOfBusiness, number> = { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 };
  for (const p of policies) {
    if (p.status === "quoted") {
      pipelineByLob[p.product_line]++;
      pipelinePremiumByLob[p.product_line] += p.premium_amount;
    } else {
      countsByLob[p.product_line]++;
    }
  }
  for (const lob of LOB_LIST) {
    const pct = ((countsByLob[lob] / ANNUAL_GOALS[lob].apps) * 100).toFixed(1);
    console.log(`  ${lob.padEnd(12)} ${countsByLob[lob]}/${ANNUAL_GOALS[lob].apps} apps (${pct}%)`);
  }

  console.log("\nOpen pipeline (still-quoted, not yet bound/issued):");
  for (const lob of LOB_LIST) {
    console.log(`  ${lob.padEnd(12)} ${pipelineByLob[lob]} quotes, $${Math.round(pipelinePremiumByLob[lob]).toLocaleString()} premium`);
  }
  console.log("=============================================================\n");
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main() {
  await wipeExistingDemoData();
  await createAgencyAndOffice();
  const emailToId = await createRoster();
  const { allPolicies } = await generateHistory(emailToId);
  printSummary(allPolicies);
}

main().catch((err) => {
  console.error("\nSeed script failed:", err);
  process.exit(1);
});
