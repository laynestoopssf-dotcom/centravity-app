// PERMANENT (but manual-only, never auto-run) utility: injects a batch of brand-new policy rows
// into the Demo Agency (DEMO_AGENCY_ID - see scripts/seed_demo_agency.ts) so its raw production
// VOLUME looks like it's pacing toward annual goals, without disturbing the close-rate band
// scripts/normalize_demo_metrics.ts already established. Every new row is fully E2EE-encrypted
// (hashed/trigram-indexed AND AES-GCM ciphertext) at creation time, exactly like a real logged
// policy - never a plaintext-then-backfilled row - so it renders with a real decrypted name in
// the UI immediately, no "Secure Customer (cross-team)" placeholder.
//
// WHY A SEPARATE SCRIPT FROM normalize_demo_metrics.ts: that script only ever reassigns the
// `status` of EXISTING rows - it can raise or lower the close rate, but can't change the total
// row COUNT, which is what's actually low here. This script only ever INSERTs brand-new rows -
// it never touches an existing row's status, premium, or identifier, so it can't undo the close
// rate work already done.
//
// HOW THE MIX IS KEPT CONSISTENT WITH THE EXISTING ~38-45% BAND: each new row is assigned to a
// producer proportional to that producer's EXISTING share of agency volume (so a producer who
// already carries more of the book gets proportionally more new volume too, not an arbitrary
// split), and each producer's new-row batch independently targets the same 38-45% band
// normalize_demo_metrics.ts uses, with the same strict "quoted > won" guarantee enforced by
// construction (not chance) for the new batch alone. Two batches that are each individually
// won<quoted and each individually within [38%,45%] mathematically CANNOT combine into a total
// that violates either property - a weighted blend of two in-range values stays in range, and
// summing two "quoted > won" batches keeps quoted > won for the sum - so the full agency (old +
// new rows) is guaranteed to stay exactly where the last normalization left it.
//
// PRODUCER SCOPE NOTE: the Demo Agency currently has 4 producers with any real sales history
// (Casey Rivera, Taylor Brooks, Sam Whitfield, Jordan Price) - Morgan Ellis (owner) and Riley
// Chen/Avery Nguyen (service roles) have zero policies today. "Active producer" below means
// "has at least 1 existing policy row", so this naturally distributes across those same 4
// without hardcoding names/emails - if a 5th producer is ever added to the demo roster and given
// real production, they'd automatically be included on a future run too.
//
// PRODUCT LINE / PREMIUM REALISM: new rows are distributed across Auto/Fire/Commercial/Life/
// Health proportional to the agency's CURRENT live mix, with premiums randomized around each
// line's CURRENT live average (same +/-30% jitter formula as utils/demoSimulator.ts uses) -
// pulled fresh from the database at run time, not hardcoded, so this stays accurate even if the
// book's mix drifts over future runs.
//
// SANDBOXING (same posture as scripts/backfill_demo_identifiers.ts / normalize_demo_metrics.ts):
//   - NOT wired into "dev"/"build"/"start", any Vercel/CI step, or imported by any app code.
//   - Hard-refuses to run inside Vercel/CI as defense-in-depth beyond "just don't wire it up".
//   - SCOPE GUARD: hard-fails if DEMO_AGENCY_ID/DEMO_OFFICE_ID aren't set, and every new row is
//     stamped with agency_id=DEMO_AGENCY_ID explicitly - this can never reach a different
//     agency's real data, on this project or any other.
//   - Only ever INSERTs new rows - never updates or deletes an existing policy.
//
// Usage:
//   npm run boost:demo-volume             # generate + insert ~350-400 new encrypted policies
//   npm run boost:demo-volume -- --dry-run   # print the full before/after plan, write nothing
process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);

if (process.env.VERCEL || process.env.CI) {
  throw new Error(
    "Refusing to run inside a Vercel/CI environment - scripts/boost_demo_volume.ts is a manual-only local utility for adding production volume to the Demo Agency before a pitch, never part of any automated build/deploy pipeline."
  );
}

const DRY_RUN = process.argv.includes("--dry-run");
const DEMO_AGENCY_ID = process.env.DEMO_AGENCY_ID;
const DEMO_OFFICE_ID = process.env.DEMO_OFFICE_ID;
const DEMO_LOGIN_PASSWORD = process.env.DEMO_LOGIN_PASSWORD;
// Same rationale as scripts/backfill_demo_identifiers.ts: any real demo account works here only
// to authenticate a session so hash_client_identifiers_full (which derives agency_id from
// auth.uid()) resolves to the right agency - every actual read/write goes through the
// service-role client regardless.
const AUTH_EMAIL = "casey.rivera@centravitydemo.invalid";

const TOTAL_NEW_ROWS_MIN = 350;
const TOTAL_NEW_ROWS_MAX = 400;

// Same band scripts/normalize_demo_metrics.ts established live - kept identical on purpose so
// blending new rows in can never drift the agency-wide rate outside it (see header comment).
const TARGET_CLOSE_RATE_MIN = 0.38;
const TARGET_CLOSE_RATE_MAX = 0.45;
const QUOTED_SHARE_OF_OPEN = 0.6;

const LOB_LIST = ["Auto", "Fire", "Commercial", "Life", "Health"] as const;
type LineOfBusiness = (typeof LOB_LIST)[number];
const PAYMENT_CYCLE: Record<LineOfBusiness, "monthly" | "annual"> = {
  Auto: "monthly",
  Fire: "monthly",
  Commercial: "monthly",
  Life: "annual",
  Health: "annual",
};
const LIFE_MONTHLY_PAY_SHARE = 0.35; // matches utils/demoSimulator.ts

// Rows dated within this many days of "now" are left as 'bound' (pending, not yet
// carrier-issued) rather than 'issued' - same "most recent few days read as still-pending"
// convention scripts/seed_demo_agency.ts uses.
const RECENT_BOUND_WINDOW_DAYS = 5;
const INSERT_CHUNK_SIZE = 200;
const HASH_CHUNK_SIZE = 100;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickWeighted<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0) || 1;
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

function pickPaymentCycle(lob: LineOfBusiness): "monthly" | "annual" {
  if (lob === "Life") return Math.random() < LIFE_MONTHLY_PAY_SHARE ? "monthly" : "annual";
  return PAYMENT_CYCLE[lob];
}

function randomDateWithinYtd(now: Date): Date {
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const safeNow = new Date(now.getTime() - 60_000);
  const span = safeNow.getTime() - startOfYear.getTime();
  const d = new Date(startOfYear.getTime() + Math.random() * span);
  d.setHours(Math.floor(randomInRange(8, 18)), Math.floor(randomInRange(0, 60)), Math.floor(randomInRange(0, 60)), 0);
  if (d > safeNow) return safeNow;
  return d;
}

function bytesToBase64(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const FIRST_NAMES = [
  "John", "Sarah", "Michael", "Jennifer", "David", "Emily", "James", "Ashley", "Robert", "Jessica",
  "William", "Amanda", "Christopher", "Melissa", "Daniel", "Michelle", "Matthew", "Kimberly", "Anthony", "Lisa",
  "Mark", "Nicole", "Paul", "Elizabeth", "Steven", "Rachel", "Andrew", "Stephanie", "Kevin", "Laura",
];
const LAST_NAMES = [
  "Smith", "Jenkins", "Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor",
  "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson",
];
function randomName(): string {
  return `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
}

interface NewPolicyPlan {
  id: string;
  user_id: string;
  product_line: LineOfBusiness;
  premium_amount: number;
  payment_cycle: "monthly" | "annual";
  status: "quoted" | "bound" | "issued" | "not_taken";
  logged_at: string;
  written_at: string;
  bound_at?: string;
  issued_at?: string;
}

async function main() {
  if (!DEMO_AGENCY_ID) throw new Error("DEMO_AGENCY_ID is not set in .env.local - refusing to run without an explicit scope.");
  if (!DEMO_OFFICE_ID) throw new Error("DEMO_OFFICE_ID is not set in .env.local - refusing to run without an explicit scope.");
  if (!DEMO_LOGIN_PASSWORD) throw new Error("DEMO_LOGIN_PASSWORD is not set in .env.local");

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  console.log(`Reading current state for agency_id=${DEMO_AGENCY_ID}...`);
  const { data: existingRows, error: fetchErr } = await admin
    .from("policies")
    .select("user_id, product_line, premium_amount, status")
    .eq("agency_id", DEMO_AGENCY_ID)
    .limit(20000);
  if (fetchErr) throw new Error(`Fetch failed: ${fetchErr.message}`);
  const allExisting = existingRows || [];
  const pipelineExisting = allExisting.filter((p) => p.status === "quoted" || p.status === "bound" || p.status === "issued" || p.status === "not_taken");

  const now = new Date();
  const currentYear = now.getFullYear();
  const ytdPremiumBefore = pipelineExisting
    .filter((p) => p.status === "bound" || p.status === "issued")
    .reduce((sum, p) => sum + (Number(p.premium_amount) || 0), 0);
  // NOTE: this is a simple all-time sum of won premium for rows tagged this agency, used only as
  // a relative before/after sanity check here - the app's own "YTD Premium" widgets additionally
  // filter by bound_at/written_at/logged_at falling in the current calendar year (see
  // app/dashboard/cockpit/page.tsx's model), which every row already satisfies today since the
  // demo agency's entire history (both existing and newly generated below) is dated within 2026.

  const { data: team, error: teamErr } = await admin.from("profiles").select("id, first_name, last_name").eq("agency_id", DEMO_AGENCY_ID);
  if (teamErr) throw new Error(`Team fetch failed: ${teamErr.message}`);
  const nameFor = (userId: string) => {
    const m = (team || []).find((t) => t.id === userId);
    return m ? `${m.first_name} ${m.last_name}` : userId;
  };

  // Active producer = has at least 1 existing REAL SALES PIPELINE policy today (quoted/bound/
  // issued/not_taken) - see header comment. Deliberately excludes Complex Resolution rows
  // ('positive'/'negative' status, a service workflow, not a sale) from both the eligibility
  // check and the weight itself, so a service-role account with a stray resolution logged never
  // gets treated as a sales producer and handed real Auto/Fire/Life/Health volume. Weight is
  // that producer's share of existing pipeline volume, so new rows land proportionally the same
  // way real production is already distributed.
  const volumeByProducer = new Map<string, number>();
  for (const p of pipelineExisting) volumeByProducer.set(p.user_id, (volumeByProducer.get(p.user_id) || 0) + 1);
  const producers = Array.from(volumeByProducer.entries())
    .filter(([, count]) => count > 0)
    .map(([userId, count]) => ({ userId, weight: count }));
  if (producers.length === 0) throw new Error("No active producers (0 existing pipeline policies) found for this agency - nothing to distribute new volume across.");

  console.log(`Active producers: ${producers.map((p) => `${nameFor(p.userId)} (${p.weight} existing)`).join(", ")}\n`);

  // Live product-mix + premium averages, pulled fresh rather than hardcoded (see header comment).
  const lobStats = new Map<LineOfBusiness, { count: number; premiumSum: number }>();
  for (const lob of LOB_LIST) lobStats.set(lob, { count: 0, premiumSum: 0 });
  for (const p of pipelineExisting) {
    const lob = p.product_line as LineOfBusiness;
    if (!lobStats.has(lob)) continue; // ignores any non-canonical/legacy product_line values
    const s = lobStats.get(lob)!;
    s.count += 1;
    s.premiumSum += Number(p.premium_amount) || 0;
  }
  const totalLobCount = Array.from(lobStats.values()).reduce((s, v) => s + v.count, 0) || 1;
  const lobWeights = LOB_LIST.map((lob) => ({ lob, weight: lobStats.get(lob)!.count / totalLobCount }));
  const avgPremiumByLob = new Map<LineOfBusiness, number>(LOB_LIST.map((lob) => [lob, lobStats.get(lob)!.count > 0 ? lobStats.get(lob)!.premiumSum / lobStats.get(lob)!.count : 500]));

  const totalNewRows = Math.round(randomInRange(TOTAL_NEW_ROWS_MIN, TOTAL_NEW_ROWS_MAX));
  console.log(`Generating ${totalNewRows} new policy rows...\n`);

  const recentCutoff = new Date(now.getTime() - RECENT_BOUND_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const plans: NewPolicyPlan[] = [];
  const summaryRows: { name: string; total: number; won: number; quoted: number; notTaken: number; closeRate: number }[] = [];

  for (const producer of producers) {
    const share = producer.weight / producers.reduce((s, p) => s + p.weight, 0);
    const producerTotal = Math.round(totalNewRows * share);
    if (producerTotal <= 0) continue;

    const targetCloseRate = TARGET_CLOSE_RATE_MIN + Math.random() * (TARGET_CLOSE_RATE_MAX - TARGET_CLOSE_RATE_MIN);
    const wonCount = Math.round(producerTotal * targetCloseRate);
    const remaining = producerTotal - wonCount;
    // Same "quoted strictly exceeds won" guarantee as normalize_demo_metrics.ts's demote branch -
    // enforced for this NEW batch in isolation, which (see header comment) is what guarantees
    // the combined agency-wide total stays compliant too.
    const requiredQuoted = wonCount + 1;
    const quotedCount = Math.min(remaining, Math.max(requiredQuoted, Math.round(remaining * QUOTED_SHARE_OF_OPEN)));
    const notTakenCount = remaining - quotedCount;

    if (quotedCount <= wonCount) {
      throw new Error(`Invariant violated for ${nameFor(producer.userId)}'s new batch: quotedCount (${quotedCount}) would not exceed wonCount (${wonCount}). Aborting before any writes.`);
    }

    summaryRows.push({ name: nameFor(producer.userId), total: producerTotal, won: wonCount, quoted: quotedCount, notTaken: notTakenCount, closeRate: producerTotal > 0 ? wonCount / producerTotal : 0 });

    for (let i = 0; i < producerTotal; i++) {
      const isWonSlot = i < wonCount;
      const openStatus: "quoted" | "not_taken" = i < wonCount + quotedCount ? "quoted" : "not_taken";
      const { lob } = pickWeighted(lobWeights);
      const avgPremium = avgPremiumByLob.get(lob) || 500;
      const premium = Math.round(avgPremium * randomInRange(0.7, 1.35));
      const paymentCycle = pickPaymentCycle(lob);

      const writtenAt = randomDateWithinYtd(now);
      const rawBoundAt = isWonSlot ? new Date(writtenAt.getTime() + randomInRange(1, 4) * 24 * 60 * 60 * 1000) : undefined;
      const finalBoundAt = rawBoundAt && rawBoundAt > now ? now : rawBoundAt;
      // Most recently-bound rows read as still-pending carrier issuance ('bound'); older ones as
      // fully 'issued' - same convention scripts/seed_demo_agency.ts uses for historical rows.
      const finalStatus: NewPolicyPlan["status"] = isWonSlot ? (finalBoundAt && finalBoundAt >= recentCutoff ? "bound" : "issued") : openStatus;
      const issuedAt = finalStatus === "issued" && finalBoundAt ? new Date(Math.min(finalBoundAt.getTime() + randomInRange(1, 6) * 24 * 60 * 60 * 1000, now.getTime())) : undefined;

      plans.push({
        id: crypto.randomUUID(),
        user_id: producer.userId,
        product_line: lob,
        premium_amount: premium,
        payment_cycle: paymentCycle,
        status: finalStatus,
        logged_at: writtenAt.toISOString(),
        written_at: writtenAt.toISOString(),
        ...(finalBoundAt ? { bound_at: finalBoundAt.toISOString() } : {}),
        ...(issuedAt ? { issued_at: issuedAt.toISOString() } : {}),
      });
    }
  }

  console.log("Per-producer new-volume plan:\n");
  for (const s of summaryRows) {
    console.log(`  ${s.name.padEnd(20)} +${s.total} new rows: won=${s.won} quoted=${s.quoted} notTaken=${s.notTaken} (new-batch close rate ${pct(s.closeRate)})`);
  }

  const newYtdPremium = plans.filter((p) => p.status === "bound" || p.status === "issued").reduce((sum, p) => sum + p.premium_amount, 0);
  console.log(`\nTotal policy count: ${allExisting.length} -> ${allExisting.length + plans.length} (+${plans.length})`);
  console.log(`YTD won premium:    ${money(ytdPremiumBefore)} -> ${money(ytdPremiumBefore + newYtdPremium)} (+${money(newYtdPremium)})\n`);

  if (DRY_RUN) {
    console.log("--dry-run: no writes performed.");
    return;
  }

  console.log(`Authenticating as ${AUTH_EMAIL} (only to resolve agency_id server-side for the hashing RPC)...`);
  const { data: signInData, error: signInErr } = await asUser.auth.signInWithPassword({ email: AUTH_EMAIL, password: DEMO_LOGIN_PASSWORD });
  if (signInErr || !signInData.session) throw new Error(`Sign-in failed: ${signInErr?.message}`);

  console.log(`Fetching the demo agency's encryption key...`);
  const { data: keyRow, error: keyErr } = await admin.from("agency_encryption_keys").select("encryption_key").eq("agency_id", DEMO_AGENCY_ID).maybeSingle();
  if (keyErr || !keyRow?.encryption_key) throw new Error(`Could not load the demo agency's encryption key: ${keyErr?.message || "no row found"}`);
  const agencyKey = await crypto.subtle.importKey("raw", base64ToBytes(keyRow.encryption_key) as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

  console.log("Hashing + encrypting identifiers and inserting rows...");
  let inserted = 0;
  for (let i = 0; i < plans.length; i += HASH_CHUNK_SIZE) {
    const chunk = plans.slice(i, i + HASH_CHUNK_SIZE);
    const chunkNames = chunk.map(() => randomName());

    const { data: hashResults, error: hashErr } = await asUser.rpc("hash_client_identifiers_full", { p_identifiers: chunkNames });
    if (hashErr) throw new Error(`hash_client_identifiers_full failed on chunk starting at ${i}: ${hashErr.message}`);

    const rowsToInsert = await Promise.all(
      chunk.map(async (plan, idx) => {
        const name = chunkNames[idx];
        const hashResult = (hashResults as any[])[idx] || {};
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, agencyKey, new TextEncoder().encode(name));
        return {
          id: plan.id,
          agency_id: DEMO_AGENCY_ID,
          office_id: DEMO_OFFICE_ID,
          user_id: plan.user_id,
          product_line: plan.product_line,
          premium_amount: plan.premium_amount,
          payment_cycle: plan.payment_cycle,
          status: plan.status,
          is_renewal: false,
          logged_at: plan.logged_at,
          written_at: plan.written_at,
          ...(plan.bound_at ? { bound_at: plan.bound_at } : {}),
          ...(plan.issued_at ? { issued_at: plan.issued_at } : {}),
          client_identifier_hash: hashResult.hash ?? null,
          client_identifier_trigrams: hashResult.trigrams ?? null,
          client_identifier_ciphertext: bytesToBase64(ciphertextBuf),
          client_identifier_iv: bytesToBase64(iv),
        };
      })
    );

    for (let j = 0; j < rowsToInsert.length; j += INSERT_CHUNK_SIZE) {
      const insertChunk = rowsToInsert.slice(j, j + INSERT_CHUNK_SIZE);
      const { error: insertErr } = await admin.from("policies").insert(insertChunk);
      if (insertErr) throw new Error(`Insert failed on chunk starting at row ${i + j}: ${insertErr.message}`);
      inserted += insertChunk.length;
    }
    console.log(`  [${inserted}/${plans.length}] inserted...`);
  }

  await asUser.auth.signOut();
  console.log(`\n✅ Done. ${inserted} new fully-encrypted policy rows inserted for agency_id=${DEMO_AGENCY_ID}.`);
}

main().catch((err) => {
  console.error("\n❌ VOLUME BOOST FAILED:", err);
  process.exit(1);
});
