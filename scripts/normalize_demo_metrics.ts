// PERMANENT (but manual-only, never auto-run) utility: rebalances the Demo Agency's
// (DEMO_AGENCY_ID - see scripts/seed_demo_agency.ts) quote-to-close ratio to whatever target
// band is configured below, by reassigning a portion of each producer's already-logged `status`
// values - never touching premiums, product lines, dates, or the encrypted/hashed identifier
// columns. The demo simulator (utils/demoSimulator.ts) and daily cron
// (app/api/cron/simulate-demo) both bias heavily toward "bound"/"issued" outcomes (great for
// showing YTD Premium/AEC pacing numbers going up every day, terrible for a live pitch where a
// ~95%+ close rate reads as obviously fake) - hence this utility.
//
// BIDIRECTIONAL BY DESIGN: works whichever way the current close rate sits relative to the
// target band - it will shift won rows OUT to {quoted, not_taken} to bring an inflated rate
// down, or pull rows back IN from {quoted, not_taken} to bring a too-low rate up (e.g. going
// from a conservative 25% band to an aggressive "top-performing" 40% band, without needing a
// different script). Every run re-solves from whatever the current live state actually is, so
// re-running this after new won-heavy rows accumulate (e.g. after the daily simulate-demo cron
// runs a few more times), or after changing the target band, is always safe.
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
//                       "Bound (Pending)" (see the status <select> in DashboardTab.tsx).
//   - Rows PROMOTED into won (target band raised above the current rate) are written as
//     'issued' - the fully-closed terminal state, and already the overwhelming majority status
//     among this demo agency's real won rows, so newly-promoted rows read as "closed business",
//     not a pile of new mid-process 'bound' rows.
// Every "close rate" calculation in this codebase (utils/coachingMetrics.ts,
// app/dashboard/cockpit/page.tsx, utils/commissionMath.ts, etc.) treats 'bound' AND 'issued'
// together as "won" - so this script's target close rate is won := count(bound|issued) over
// N := count(quoted|bound|issued|not_taken) per producer, matching that convention exactly.
//
// THE ONE HARD INVARIANT: bound+issued (won) must be STRICTLY LESS than quoted, for every
// producer, no matter which direction the target band pushes things. When raising the close
// rate, wonTarget is capped below the producer's available quoted pool specifically to guarantee
// this holds - see solveProducerPlan below - rather than ever letting quoted shrink to (or below)
// wonTarget just to hit the nominal target exactly.
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

// Per-producer target close rate is randomized within this band on every run, so every producer
// doesn't land on the exact same number (which itself would look as fake as a flat 91.8% - or a
// flat 96.3% - did). Currently: "highly successful, top-performing agency" without tripping the
// obviously-fake ~90%+ threshold.
const TARGET_CLOSE_RATE_MIN = 0.38;
const TARGET_CLOSE_RATE_MAX = 0.45;

// Default split, when LOWERING a producer's close rate, of the rows being moved OUT of won:
// most of a shrinking close rate should still look like live, working pipeline (still 'quoted')
// rather than a graveyard of declines - bumped up per-producer below (never down) only as far as
// needed to guarantee the strict won<quoted invariant.
const QUOTED_SHARE_OF_DEMOTED = 0.6;

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
  finalCloseRate: number;
  idsToQuoted: string[];
  idsToNotTaken: string[];
  idsToIssued: string[];
}

// Solves one producer's plan against whatever their CURRENT live status mix is - handles both
// "close rate needs to come down" (won -> quoted/not_taken) and "close rate needs to go up"
// (quoted/not_taken -> won) from a single code path, so this keeps working correctly no matter
// which direction a future target-band change pushes things.
function solveProducerPlan(userId: string, name: string, wonRows: PolicyRow[], quotedRows: PolicyRow[], notTakenRows: PolicyRow[]): ProducerPlan {
  const N = wonRows.length + quotedRows.length + notTakenRows.length;
  const before = { won: wonRows.length, quoted: quotedRows.length, notTaken: notTakenRows.length };

  const rawTargetCloseRate = TARGET_CLOSE_RATE_MIN + Math.random() * (TARGET_CLOSE_RATE_MAX - TARGET_CLOSE_RATE_MIN);
  const rawWonTarget = Math.round(N * rawTargetCloseRate);

  if (rawWonTarget === wonRows.length) {
    // Already exactly on target (or N is tiny enough that rounding landed here) - nothing to do.
    return { userId, name, totalPipelineRows: N, before, after: before, finalCloseRate: N > 0 ? wonRows.length / N : 0, idsToQuoted: [], idsToNotTaken: [], idsToIssued: [] };
  }

  if (rawWonTarget > wonRows.length) {
    // RAISING the close rate: pull rows IN from {not_taken, quoted} up into won ('issued').
    // Hard cap: won must stay STRICTLY below quoted after this - since promoting rows can only
    // ever hold quoted steady or shrink it (never grow it), the safe ceiling for wonTarget is
    // one less than whatever quoted will end up as. Preferring to source every promoted row from
    // not_taken first (quoted stays untouched, at its full original size) makes that ceiling as
    // generous as possible: quotedRows.length - 1.
    const wonTarget = Math.min(rawWonTarget, quotedRows.length - 1, N);
    const delta = wonTarget - wonRows.length;

    const shuffledNotTaken = shuffle(notTakenRows);
    const fromNotTaken = shuffledNotTaken.slice(0, Math.min(delta, notTakenRows.length));
    const stillNeeded = delta - fromNotTaken.length;
    // Only reached if not_taken alone can't cover the promotion - falls back to pulling the rest
    // from quoted. Every row pulled from quoted simultaneously raises won by 1 AND lowers quoted
    // by 1 (a 2-unit swing in the won<quoted margin per row, not 1), so the safe cap has to
    // account for that, not just "however many keep quoted above wonTarget" in isolation - it's
    // fine if this undershoots wonTarget itself; the invariant always wins over hitting the
    // nominal target exactly.
    const shuffledQuoted = shuffle(quotedRows);
    const marginBeforeQuotedPull = quotedRows.length - (wonRows.length + fromNotTaken.length);
    const maxSafeFromQuoted = Math.max(0, Math.floor((marginBeforeQuotedPull - 1) / 2));
    const fromQuoted = stillNeeded > 0 ? shuffledQuoted.slice(0, Math.min(stillNeeded, maxSafeFromQuoted)) : [];

    const finalWon = wonRows.length + fromNotTaken.length + fromQuoted.length;
    const finalQuoted = quotedRows.length - fromQuoted.length;
    const finalNotTaken = notTakenRows.length - fromNotTaken.length;

    if (finalQuoted <= finalWon) {
      throw new Error(`Invariant violated for ${name}: finalQuoted (${finalQuoted}) would not exceed finalWon (${finalWon}). Aborting before any writes.`);
    }

    return {
      userId,
      name,
      totalPipelineRows: N,
      before,
      after: { won: finalWon, quoted: finalQuoted, notTaken: finalNotTaken },
      finalCloseRate: N > 0 ? finalWon / N : 0,
      idsToQuoted: [],
      idsToNotTaken: [],
      idsToIssued: [...fromNotTaken, ...fromQuoted].map((r) => r.id),
    };
  }

  // LOWERING the close rate: push rows OUT of won into {quoted, not_taken} - same approach as
  // the original 25-30% recalibration.
  const wonTarget = rawWonTarget;
  const numToDemote = wonRows.length - wonTarget;
  const demoteCandidates = shuffle(wonRows).slice(0, numToDemote);

  const requiredNewlyQuoted = Math.max(0, wonTarget - quotedRows.length + 1);
  const newlyQuotedCount = Math.min(numToDemote, Math.max(requiredNewlyQuoted, Math.round(numToDemote * QUOTED_SHARE_OF_DEMOTED)));
  const newlyQuoted = demoteCandidates.slice(0, newlyQuotedCount);
  const newlyNotTaken = demoteCandidates.slice(newlyQuotedCount);

  const finalQuoted = quotedRows.length + newlyQuoted.length;
  if (finalQuoted <= wonTarget) {
    throw new Error(`Invariant violated for ${name}: finalQuoted (${finalQuoted}) would not exceed wonTarget (${wonTarget}). Aborting before any writes.`);
  }

  return {
    userId,
    name,
    totalPipelineRows: N,
    before,
    after: { won: wonTarget, quoted: finalQuoted, notTaken: notTakenRows.length + newlyNotTaken.length },
    finalCloseRate: N > 0 ? wonTarget / N : 0,
    idsToQuoted: newlyQuoted.map((r) => r.id),
    idsToNotTaken: newlyNotTaken.map((r) => r.id),
    idsToIssued: [],
  };
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
    const quotedRows = producerRows.filter((p) => p.status === "quoted");
    const notTakenRows = producerRows.filter((p) => p.status === "not_taken");
    plans.push(solveProducerPlan(userId, nameFor(userId), wonRows, quotedRows, notTakenRows));
  }

  console.log(`Per-producer plan (target band: ${pct(TARGET_CLOSE_RATE_MIN)}-${pct(TARGET_CLOSE_RATE_MAX)}):\n`);
  let agencyBeforeWon = 0;
  let agencyAfterWon = 0;
  let agencyTotal = 0;
  for (const plan of plans) {
    agencyBeforeWon += plan.before.won;
    agencyAfterWon += plan.after.won;
    agencyTotal += plan.totalPipelineRows;
    const beforeRate = plan.totalPipelineRows > 0 ? plan.before.won / plan.totalPipelineRows : 0;
    const movedCount = plan.idsToQuoted.length + plan.idsToNotTaken.length + plan.idsToIssued.length;
    console.log(
      `  ${plan.name.padEnd(20)} N=${String(plan.totalPipelineRows).padEnd(5)} ` +
        `before: won=${plan.before.won} quoted=${plan.before.quoted} notTaken=${plan.before.notTaken} (${pct(beforeRate)})  ` +
        `-> after: won=${plan.after.won} quoted=${plan.after.quoted} notTaken=${plan.after.notTaken} (${pct(plan.finalCloseRate)})` +
        `  [moved ${movedCount} rows: +${plan.idsToIssued.length} issued, +${plan.idsToQuoted.length} quoted, +${plan.idsToNotTaken.length} not_taken]`
    );
  }
  console.log(
    `\nAgency-wide close rate: ${pct(agencyTotal > 0 ? agencyBeforeWon / agencyTotal : 0)} -> ${pct(agencyTotal > 0 ? agencyAfterWon / agencyTotal : 0)} ` +
      `(${agencyBeforeWon} -> ${agencyAfterWon} won, out of ${agencyTotal} total pipeline rows)\n`
  );

  const allQuotedIds = plans.flatMap((p) => p.idsToQuoted);
  const allNotTakenIds = plans.flatMap((p) => p.idsToNotTaken);
  const allIssuedIds = plans.flatMap((p) => p.idsToIssued);

  if (DRY_RUN) {
    console.log(
      `--dry-run: would update ${allIssuedIds.length} rows to 'issued', ${allQuotedIds.length} rows to 'quoted', and ${allNotTakenIds.length} rows to 'not_taken'. No writes performed.`
    );
    return;
  }

  if (allQuotedIds.length === 0 && allNotTakenIds.length === 0 && allIssuedIds.length === 0) {
    console.log("Nothing to normalize - every producer is already within the target range.");
    return;
  }

  console.log("Applying updates...");
  const totalToWrite = allIssuedIds.length + allQuotedIds.length + allNotTakenIds.length;
  let written = 0;
  for (const [targetStatus, ids] of [
    ["issued", allIssuedIds],
    ["quoted", allQuotedIds],
    ["not_taken", allNotTakenIds],
  ] as const) {
    for (let i = 0; i < ids.length; i += UPDATE_CHUNK_SIZE) {
      const chunk = ids.slice(i, i + UPDATE_CHUNK_SIZE);
      if (chunk.length === 0) continue;
      const { error } = await admin.from("policies").update({ status: targetStatus }).in("id", chunk);
      if (error) throw new Error(`Update to '${targetStatus}' failed on chunk starting at ${i}: ${error.message}`);
      written += chunk.length;
      console.log(`  [${written}/${totalToWrite}] updated...`);
    }
  }

  console.log(
    `\n✅ Done. ${allIssuedIds.length} rows moved to 'issued', ${allQuotedIds.length} rows moved to 'quoted', ${allNotTakenIds.length} rows moved to 'not_taken'. Premiums, dates, product lines, and identifiers were never touched.`
  );
}

main().catch((err) => {
  console.error("\n❌ NORMALIZATION FAILED:", err);
  process.exit(1);
});
