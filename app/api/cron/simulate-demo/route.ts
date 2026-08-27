import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "../../../actions/supabaseAdmin";
import {
  LOB_LIST,
  type AnnualGoals,
  type LineOfBusiness,
  type ProducerWeight,
  computeAvgPremiumPerApp,
  generateDayOfProduction,
  generateOpenPipeline,
  poissonSample,
} from "../../../../utils/demoSimulator";

// =============================================================================
// GET /api/cron/simulate-demo — daily tick for the Demo Agency Simulator.
// -----------------------------------------------------------------------------
// Scheduled by vercel.json ("59 6 * * *") to fire once a day. Vercel's own
// JSON crons can't carry comments, so the caveat lives here instead: 06:59
// UTC = 11:59 PM Pacific *Daylight* Time (UTC-7), which is correct for most
// of the year. Vercel cron schedules are fixed-UTC and don't auto-shift for
// Daylight Saving, so during Standard Time (UTC-8, roughly Nov-Mar) this
// effectively fires at 10:59 PM Pacific instead — a known, minor limitation;
// bump the vercel.json expression to "59 7 * * *" if that hour ever matters.
//
// Generates ONE calendar day of realistic activity/policy rows for the 4
// producing roles in the demo agency, using the exact same
// utils/demoSimulator.ts engine Stage 2 of scripts/seed_demo_agency.ts used —
// that's what keeps the 30-day rolling averages the app already computes
// moving naturally instead of jumping the day the cron takes over from the
// one-time seed.
//
// ISOLATION, enforced structurally (never "all agencies"):
//   1. Hard guard below: DEMO_AGENCY_ID/DEMO_OFFICE_ID must be configured or
//      this 500s immediately rather than ever falling back to a broader scope.
//   2. The only `profiles` query is `.eq("agency_id", DEMO_AGENCY_ID)`.
//   3. The only inserts are `agency_id: DEMO_AGENCY_ID` / `office_id: DEMO_OFFICE_ID`.
// =============================================================================

export const runtime = "nodejs";

// Same annual model + producer weights/close-rates as scripts/seed_demo_agency.ts.
// Kept in sync manually (not imported from the seed script, which isn't part
// of the Next.js build) — see that file if these ever change.
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

// Same per-day open-pipeline arrival rate as scripts/seed_demo_agency.ts's
// OPEN_PIPELINE_COUNTS / OPEN_PIPELINE_WINDOW_DAYS (14/21, 12/21, 3/21, 8/21,
// 4/21) — kept in sync manually, same reasoning as ANNUAL_GOALS above. Adds a
// small trickle of fresh "quoted" (still-open) policies each day on top of
// the closed-won ones below, so Pipeline Potential / Active Pipeline widgets
// keep feeling alive. Known limitation: nothing ever "resolves" an old
// quoted row (into bound or dead) once inserted, so the open-pipeline pool
// will drift slowly larger over very long uptimes — acceptable for a demo,
// but worth revisiting if this cron ever runs unattended for a year+.
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

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error("[cron/simulate-demo] CRON_SECRET is not configured");
      return NextResponse.json({ error: "Server is misconfigured." }, { status: 500 });
    }

    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const demoAgencyId = process.env.DEMO_AGENCY_ID;
    const demoOfficeId = process.env.DEMO_OFFICE_ID;
    if (!demoAgencyId || !demoOfficeId) {
      console.error("[cron/simulate-demo] DEMO_AGENCY_ID / DEMO_OFFICE_ID not configured — refusing to run.");
      return NextResponse.json({ error: "Demo agency not configured." }, { status: 500 });
    }

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);

    // Idempotency guard: if today's rows already exist for this agency, don't
    // double-insert on an accidental double-fire (e.g. a Vercel cron retry).
    const { count: existingCount, error: existingError } = await supabaseAdmin
      .from("activities")
      .select("id", { count: "exact", head: true })
      .eq("agency_id", demoAgencyId)
      .gte("logged_at", dayStart.toISOString())
      .lte("logged_at", dayEnd.toISOString());

    if (existingError) {
      console.error("[cron/simulate-demo] idempotency check failed", existingError);
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    if ((existingCount || 0) > 0) {
      return NextResponse.json({ skipped: true, reason: "Today's demo data already exists.", date: now.toISOString() });
    }

    const producers = await resolveProducers(demoAgencyId);
    if (producers.length !== PRODUCER_NAME_WEIGHTS.length) {
      console.error(
        `[cron/simulate-demo] expected ${PRODUCER_NAME_WEIGHTS.length} producers, found ${producers.length} — has the demo agency been seeded? (npm run seed:demo)`
      );
      return NextResponse.json({ error: "Demo producer roster incomplete. Run the seed script first." }, { status: 500 });
    }

    const avgPremiumPerApp = computeAvgPremiumPerApp(ANNUAL_GOALS);

    const year = now.getFullYear();
    const jan1 = new Date(year, 0, 1);
    const fullYearEnd = new Date(year, 11, 31);
    const fullYearBusinessDays = Math.max(1, countBusinessDaysInRange(jan1, fullYearEnd, PRODUCTION_DAYS_PER_WEEK));

    const dailyTeamRate: Record<LineOfBusiness, number> = {} as Record<LineOfBusiness, number>;
    for (const lob of LOB_LIST) {
      // Same "annual run-rate x mild hot-agency multiplier" shape as Stage 2 of the seed script.
      const hotMultiplier = 1.05 + Math.random() * 0.1;
      dailyTeamRate[lob] = (ANNUAL_GOALS[lob].apps / fullYearBusinessDays) * hotMultiplier;
    }

    const { policies, activities } = generateDayOfProduction({
      date: now,
      agencyId: demoAgencyId,
      officeId: demoOfficeId,
      producers,
      avgPremiumPerApp,
      dailyTeamRate,
      productionDaysPerWeek: PRODUCTION_DAYS_PER_WEEK,
      policyStatus: "bound",
      makeId: () => crypto.randomUUID(),
      earliestDate: dayStart,
      latestDate: now,
    });

    // A small trickle of freshly-quoted (still-open) pipeline — see
    // PIPELINE_DAILY_LAMBDA's doc comment above.
    const newPipelineCountByLob: Record<LineOfBusiness, number> = {} as Record<LineOfBusiness, number>;
    for (const lob of LOB_LIST) newPipelineCountByLob[lob] = poissonSample(PIPELINE_DAILY_LAMBDA[lob]);

    const openPipeline = generateOpenPipeline({
      agencyId: demoAgencyId,
      officeId: demoOfficeId,
      producers,
      avgPremiumPerApp,
      countByLob: newPipelineCountByLob,
      earliestDate: dayStart,
      latestDate: now,
      makeId: () => crypto.randomUUID(),
    });
    policies.push(...openPipeline);

    if (policies.length > 0) {
      const { error: policiesError } = await supabaseAdmin.from("policies").insert(policies);
      if (policiesError) {
        console.error("[cron/simulate-demo] policy insert failed", policiesError);
        return NextResponse.json({ error: policiesError.message }, { status: 500 });
      }
    }

    if (activities.length > 0) {
      const { error: activitiesError } = await supabaseAdmin.from("activities").insert(activities);
      if (activitiesError) {
        console.error("[cron/simulate-demo] activity insert failed", activitiesError);
        return NextResponse.json({ error: activitiesError.message }, { status: 500 });
      }
    }

    const countsByLob: Record<LineOfBusiness, number> = { Auto: 0, Fire: 0, Commercial: 0, Life: 0, Health: 0 };
    for (const p of policies) {
      if (p.status !== "quoted") countsByLob[p.product_line]++;
    }

    console.log(
      `[cron/simulate-demo] inserted ${policies.length} policies (incl. ${openPipeline.length} new open pipeline), ${activities.length} activities for ${now.toDateString()}`
    );

    return NextResponse.json({
      success: true,
      date: now.toISOString(),
      policiesInserted: policies.length,
      openPipelineInserted: openPipeline.length,
      activitiesInserted: activities.length,
      byLineOfBusiness: countsByLob,
    });
  } catch (err: unknown) {
    console.error("[cron/simulate-demo] unexpected error", err);
    return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
  }
}

// Producers scoped strictly to this one agency — never a platform-wide role
// query. `profiles` has no email column, so the 4 known producers (fixed by
// scripts/seed_demo_agency.ts) are matched by full name rather than an
// auth-wide email lookup, which would otherwise mean paging through every
// user on the platform just to find 4 ids.
async function resolveProducers(demoAgencyId: string): Promise<ProducerWeight[]> {
  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("agency_id", demoAgencyId)
    .in("role", ["producer", "manager"]);

  if (error) {
    console.error("[cron/simulate-demo] failed to load producer profiles", error);
    return [];
  }

  const nameToWeights = new Map<string, (typeof PRODUCER_NAME_WEIGHTS)[number]>(
    PRODUCER_NAME_WEIGHTS.map((p) => [`${p.firstName.toLowerCase()} ${p.lastName.toLowerCase()}`, p])
  );

  const producers: ProducerWeight[] = [];
  for (const profile of profiles || []) {
    const key = `${(profile.first_name || "").toLowerCase()} ${(profile.last_name || "").toLowerCase()}`;
    const match = nameToWeights.get(key);
    if (match) {
      producers.push({ userId: profile.id, weight: match.weight, closeRate: match.closeRate, quoteRate: match.quoteRate });
    }
  }
  return producers;
}
