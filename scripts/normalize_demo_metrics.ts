// PERMANENT (but manual-only, never auto-run) utility: rebalances the Demo Agency's
// (DEMO_AGENCY_ID - see scripts/seed_demo_agency.ts) quote-to-close ratio down to a realistic
// industry-average range. The demo simulator (utils/demoSimulator.ts) and daily cron
// (app/api/cron/simulate-demo) both bias heavily toward "bound"/"issued" outcomes (great for
// showing YTD Premium/AEC pacing numbers going up every day, terrible for a live pitch where a
// ~95%+ close rate reads as obviously fake) - this script fixes ONLY that, by reassigning a
// portion of each producer's already-logged `status` values, never touching premiums, product
// lines, dates, or the encrypted/hashed identifier columns.
//
// STATUS VOCABULARY NOTE: this schema's `policies.status` only ever takes one of
// 'quoted' | 'bound' | 'issued' | 'not_taken' (see the Policy type in app/dashboard/page.tsx and
// the status <select> in components/DashboardTab.tsx) - there's no literal "Closed Lost" or
// "Pending" value to write. Mapped onto the real vocabulary:
//   - "Quoted"       -> 'quoted'     (still-open pipeline, undecided)
//   - "Closed Lost"  -> 'not_taken'  (this app's one terminal "didn't convert" status - rendered
//                                     as a red "DECLINED" badge everywhere, for any product line,
//                                     not just Life/Health - see components/LedgerTab.tsx /
//                                     components/DashboardTab.tsx's activePipeline filter)
//   - "Pending"      -> already covered: this app's own UI literally labels status='bound' as
//                       "Bound (Pending)" (see the status <select> in DashboardTab.tsx) - so the
//                       rows this script leaves as 'bound'/'issued' at the final, healthy target
//                       rate already read as "Pending"/"Bound" in the product, no 3rd status
//                       needed.
// Every "close rate" calculation in this codebase (utils/coachingMetrics.ts,
// app/dashboard/cockpit/page.tsx, utils/commissionMath.ts, etc.) treats 'bound' AND 'issued'
// together as "won" - so this script's target close rate is won := count(bound|issued) over
// N := count(quoted|bound|issued|not_taken) per producer, matching that convention exactly.
//
// ONE-WAY BY DESIGN: this only ever moves rows OUT of {bound, issued} and into {quoted,
// not_taken} - it never promotes an already-quoted/not_taken row INTO bound/issued. Re-running
// this after new won-heavy rows accumulate (e.g. after the daily simulate-demo cron runs a few
// more times) is safe and idempotent in spirit - it will just re-normalize whatever the current
// mix is down to a fresh random target in the same realistic band.
//
// SANDBOXING (same posture as scripts/backfill_demo_identifiers.ts):
//   - NOT wired into "dev"/"build"/"start", any Vercel/CI step, or imported by any app code -
//     nothing in the actual product ever pulls this file in. Only runs if a human types the
//     command below.
//   - Hard-refuses to run inside Vercel/CI as defense-in-depth beyond "just don't wire it up".
//   - SCOPE GUARD: hard-fails if DEMO_AGENCY_ID isn't set, and the only query that reads policy
//     rows is explicitly filtered to .eq('agency_id', DEMO_AGENCY_ID) - this can never reach a
//     different agency's real data, on this project or any other.
//   - Only ever writes to the single `status` column - premiums, dates, product lines, and every
//     client_identifier_* column are never referenced, let alone written.
//
// Usage:
//   npm run normalize:demo-metrics             # rebalance every demo producer's close rate
//   npm run normalize:demo-metrics -- --dry-run   # print the full before/after plan, write nothing
process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);

if (process.env.VERCEL || process.env.CI) {
  throw new Error(
    "Refusing to run inside a Vercel/CI environment - scripts/normalize_demo_metrics.ts is a manual-only local utility for rebalancing the Demo Agency's close rate before a pitch, never part of any automated build/deploy pipeline."
  );
}

const DRY_RUN = process.argv.includes("--dry-run");
const DEMO_AGENCY_ID = process.env.DEMO_AGENCY_ID;

// Per-producer target close rate is randomized within this band on every run - comfortably
// under the 35% hard cap the request asked for, centered on the "roughly 25-30%" industry
// average, with a little spread so every producer doesn't land on the exact same number (which
// itself would look as fake as a flat 91.8% did).
const TARGET_CLOSE_RATE_MIN = 0.22;
const TARGET_CLOSE_RATE_MAX = 0.3;
const HARD_CAP_CLOSE_RATE = 0.35;

// Default split of the rows being moved OUT of won: most of a shrinking close rate should still
// look like live, working pipeline (still 'quoted') rather than a graveyard of declines - bumped
// up per-producer below (never down) only as far as needed to guarantee the strict bound<quoted
// invariant the request asked for.
const QUOTED_SHARE_OF_FLIPPED = 0.6;

const UPDATE_CHUNK_SIZE = 300;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface PolicyRow {
  id: string;
  user_id: string;
  status: "quoted" | "bound" | "issued" | "not_taken";
}

interface ProducerPlan {
  userId: string;
  name: string;
  totalPipelineRows: number;
  before: { won: number; quoted: number; notTaken: number };
  after: { won: number; quoted: number; notTaken: number };
  targetCloseRate: number;
  idsToQuoted: string[];
  idsToNotTaken: string[];
}

async function main() {
  if (!DEMO_AGENCY_ID) throw new Error("DEMO_AGENCY_ID is not set in .env.local - refusing to run without an explicit scope.");

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  console.log(`Fetching every quote/bind pipeline policy for agency_id=${DEMO_AGENCY_ID}...`);
  // Deliberately scoped to the 4 real sales-pipeline statuses only - Complex Resolution rows
  // carry 'positive'/'negative' instead (a totally different, non-sales workflow) and must never
  // be touched here.
  const { data: rows, error: fetchErr } = await admin
    .from("policies")
    .select("id, user_id, status")
    .eq("agency_id", DEMO_AGENCY_ID)
    .in("status", ["quoted", "bound", "issued", "not_taken"])
    .limit(20000);
  if (fetchErr) throw new Error(`Fetch failed: ${fetchErr.message}`);
  const policies = (rows || []) as PolicyRow[];
  console.log(`Found ${policies.length} pipeline policies.\n`);
  if (policies.length === 0) return;

  const { data: team, error: teamErr } = await admin.from("profiles").select("id, first_name, last_name").eq("agency_id", DEMO_AGENCY_ID);
  if (teamErr) throw new Error(`Team fetch failed: ${teamErr.message}`);
  const nameFor = (userId: string) => {
    const m = (team || []).find((t) => t.id === userId);
    return m ? `${m.first_name} ${m.last_name}` : userId;
  };

  const byProducer = new Map<string, PolicyRow[]>();
  for (const p of policies) {
    if (!byProducer.has(p.user_id)) byProducer.set(p.user_id, []);
    byProducer.get(p.user_id)!.push(p);
  }

  const plans: ProducerPlan[] = [];

  for (const [userId, producerRows] of byProducer.entries()) {
    const wonRows = producerRows.filter((p) => p.status === "bound" || p.status === "issued");
    const existingQuoted = producerRows.filter((p) => p.status === "quoted");
    const existingNotTaken = producerRows.filter((p) => p.status === "not_taken");
    const N = producerRows.length;

    const beforeCloseRate = N > 0 ? wonRows.length / N : 0;

    // Nothing to normalize (already low, or no won rows at all) - leave this producer alone
    // entirely rather than ever moving a row the wrong direction.
    if (wonRows.length === 0 || beforeCloseRate <= TARGET_CLOSE_RATE_MAX) {
      plans.push({
        userId,
        name: nameFor(userId),
        totalPipelineRows: N,
        before: { won: wonRows.length, quoted: existingQuoted.length, notTaken: existingNotTaken.length },
        after: { won: wonRows.length, quoted: existingQuoted.length, notTaken: existingNotTaken.length },
        targetCloseRate: beforeCloseRate,
        idsToQuoted: [],
        idsToNotTaken: [],
      });
      continue;
    }

    const targetCloseRate = TARGET_CLOSE_RATE_MIN + Math.random() * (TARGET_CLOSE_RATE_MAX - TARGET_CLOSE_RATE_MIN);
    // Never asked to promote a row INTO won - only clamp downward, so wonTarget can't exceed
    // what's already there.
    const wonTarget = Math.min(wonRows.length, Math.round(N * targetCloseRate));
    const numToFlip = wonRows.length - wonTarget;

    const flipCandidates = shuffle(wonRows).slice(0, numToFlip);

    // Strictly guarantee bound < quoted per producer (the request's explicit "mathematically
    // guarantee" ask): quoted after this run must exceed wonTarget by at least 1, no matter what
    // the default 60/40 split alone would have produced.
    const requiredNewlyQuoted = Math.max(0, wonTarget - existingQuoted.length + 1);
    const newlyQuotedCount = Math.min(numToFlip, Math.max(requiredNewlyQuoted, Math.round(numToFlip * QUOTED_SHARE_OF_FLIPPED)));
    const newlyQuoted = flipCandidates.slice(0, newlyQuotedCount);
    const newlyNotTaken = flipCandidates.slice(newlyQuotedCount);

    const finalQuoted = existingQuoted.length + newlyQuoted.length;
    const finalCloseRate = wonTarget / N;

    if (finalQuoted <= wonTarget) {
      // Should be unreachable given the requiredNewlyQuoted floor above - fail loudly instead of
      // silently shipping a producer that violates the one hard invariant this script exists to
      // guarantee.
      throw new Error(
        `Invariant violated for ${nameFor(userId)}: finalQuoted (${finalQuoted}) would not exceed wonTarget (${wonTarget}). Aborting before any writes.`
      );
    }
    if (finalCloseRate > HARD_CAP_CLOSE_RATE + 1e-9) {
      throw new Error(`Invariant violated for ${nameFor(userId)}: finalCloseRate (${pct(finalCloseRate)}) exceeds the ${pct(HARD_CAP_CLOSE_RATE)} hard cap. Aborting before any writes.`);
    }

    plans.push({
      userId,
      name: nameFor(userId),
      totalPipelineRows: N,
      before: { won: wonRows.length, quoted: existingQuoted.length, notTaken: existingNotTaken.length },
      after: { won: wonTarget, quoted: finalQuoted, notTaken: existingNotTaken.length + newlyNotTaken.length },
      targetCloseRate: finalCloseRate,
      idsToQuoted: newlyQuoted.map((r) => r.id),
      idsToNotTaken: newlyNotTaken.map((r) => r.id),
    });
  }

  console.log("Per-producer plan:\n");
  let agencyBeforeWon = 0;
  let agencyAfterWon = 0;
  let agencyTotal = 0;
  for (const plan of plans) {
    agencyBeforeWon += plan.before.won;
    agencyAfterWon += plan.after.won;
    agencyTotal += plan.totalPipelineRows;
    const beforeRate = plan.totalPipelineRows > 0 ? plan.before.won / plan.totalPipelineRows : 0;
    console.log(
      `  ${plan.name.padEnd(20)} N=${String(plan.totalPipelineRows).padEnd(5)} ` +
        `before: won=${plan.before.won} quoted=${plan.before.quoted} notTaken=${plan.before.notTaken} (${pct(beforeRate)})  ` +
        `-> after: won=${plan.after.won} quoted=${plan.after.quoted} notTaken=${plan.after.notTaken} (${pct(plan.targetCloseRate)})` +
        `  [flip ${plan.idsToQuoted.length + plan.idsToNotTaken.length} rows: +${plan.idsToQuoted.length} quoted, +${plan.idsToNotTaken.length} not_taken]`
    );
  }
  console.log(
    `\nAgency-wide close rate: ${pct(agencyTotal > 0 ? agencyBeforeWon / agencyTotal : 0)} -> ${pct(agencyTotal > 0 ? agencyAfterWon / agencyTotal : 0)} ` +
      `(${agencyBeforeWon} -> ${agencyAfterWon} won, out of ${agencyTotal} total pipeline rows)\n`
  );

  const allQuotedIds = plans.flatMap((p) => p.idsToQuoted);
  const allNotTakenIds = plans.flatMap((p) => p.idsToNotTaken);

  if (DRY_RUN) {
    console.log(`--dry-run: would update ${allQuotedIds.length} rows to 'quoted' and ${allNotTakenIds.length} rows to 'not_taken'. No writes performed.`);
    return;
  }

  if (allQuotedIds.length === 0 && allNotTakenIds.length === 0) {
    console.log("Nothing to normalize - every producer is already within the target range.");
    return;
  }

  console.log("Applying updates...");
  let written = 0;
  for (const [targetStatus, ids] of [
    ["quoted", allQuotedIds],
    ["not_taken", allNotTakenIds],
  ] as const) {
    for (let i = 0; i < ids.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + UPDATE_CHUNK_SIZE);
      if (chunk.length === 0) continue;
      const { error } = await admin.from("policies").update({ status: targetStatus }).in("id", chunk);
      if (error) throw new Error(`Update to '${targetStatus}' failed on chunk starting at ${i}: ${error.message}`);
      written += chunk.length;
      console.log(`  [${written}/${allQuotedIds.length + allNotTakenIds.length}] updated...`);
    }
  }

  console.log(`\n✅ Done. ${allQuotedIds.length} rows moved to 'quoted', ${allNotTakenIds.length} rows moved to 'not_taken'. Premiums, dates, product lines, and identifiers were never touched.`);
}

main().catch((err) => {
  console.error("\n❌ NORMALIZATION FAILED:", err);
  process.exit(1);
});
