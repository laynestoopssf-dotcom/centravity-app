// PERMANENT (but manual-only, never auto-run) utility: gives every policy in the isolated Demo
// Agency (DEMO_AGENCY_ID - see scripts/seed_demo_agency.ts) a realistic dummy client identifier
// - hashed, trigram-indexed, AND AES-GCM encrypted - so a live demo/pitch can show real,
// readable, decrypted names (including cross-team, via the Owner) instead of "Secure Customer
// (cross-team)" placeholders. Demo policies never have ANY client_identifier_* value by default
// (the demo simulator - utils/demoSimulator.ts - never sets one, and the daily cron at
// app/api/cron/simulate-demo keeps logging new unnamed rows), so re-running this before any
// future pitch to "heal" newly-simulated rows is expected, safe, and idempotent - it's purely
// additive: dates, premiums, statuses, and every other column are left completely untouched on
// every run, whether a row already has an identifier or not (a re-run just replaces it with a
// fresh dummy name).
//
// SANDBOXING (kept manual-only on purpose, per the request that added this note):
//   - NOT wired into "dev"/"build"/"start" in package.json, or into any Vercel build/deploy
//     step, or imported by any app code (page, API route, server action, component) - nothing
//     in the actual product ever pulls this file in. It only ever runs if a human explicitly
//     types the command below.
//   - The explicit guard right below additionally hard-refuses to run if it ever somehow ended
//     up invoked inside a Vercel or generic CI runner, as defense-in-depth beyond "just don't
//     wire it up anywhere".
//   - SCOPE GUARD: hard-fails immediately if DEMO_AGENCY_ID isn't set, and every query is
//     explicitly filtered to .eq('agency_id', DEMO_AGENCY_ID) - this can never touch a
//     different agency's real customer data, on this project or any other.
//
// Usage:
//   npm run backfill:demo-identifiers            # backfill/refresh every demo policy
//   npm run backfill:demo-identifiers -- --limit=5  # dry-run against just 5 rows first
process.loadEnvFile(new URL("../.env.local", import.meta.url).pathname);

if (process.env.VERCEL || process.env.CI) {
  throw new Error(
    "Refusing to run inside a Vercel/CI environment - scripts/backfill_demo_identifiers.ts is a manual-only local utility for refreshing the Demo Agency before a pitch, never part of any automated build/deploy pipeline."
  );
}

const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const ROW_LIMIT = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

const DEMO_AGENCY_ID = process.env.DEMO_AGENCY_ID;
const DEMO_LOGIN_PASSWORD = process.env.DEMO_LOGIN_PASSWORD;
// Any real demo account works - only used to authenticate a session so the hash_client_
// identifiers_full RPC (which derives agency_id from auth.uid(), not a client-supplied value)
// resolves to the right agency. All actual reads/writes below go through the service-role
// client so this never depends on that account's own RLS visibility. Deliberately a producer,
// not the owner - Supabase Auth briefly throttles repeated password sign-ins per-email, and the
// owner account tends to get reused (and re-throttled) by other verification scripts/manual
// testing more than this one does.
const AUTH_EMAIL = "casey.rivera@centravitydemo.invalid";
const CHUNK_SIZE = 100;

// A deliberately generic, clearly-fake pool - repeats across rows are fine/realistic (multiple
// quotes for the same household), and none of these need to mean anything for the demo.
const FIRST_NAMES = [
  "John", "Sarah", "Michael", "Jennifer", "David", "Emily", "James", "Ashley", "Robert", "Jessica",
  "William", "Amanda", "Christopher", "Melissa", "Daniel", "Michelle", "Matthew", "Kimberly", "Anthony", "Lisa",
  "Mark", "Nicole", "Paul", "Elizabeth", "Steven", "Rachel", "Andrew", "Stephanie", "Kevin", "Laura",
  "Brian", "Amy", "Timothy", "Angela", "Jason", "Megan", "Jeffrey", "Rebecca", "Ryan", "Samantha",
];
const LAST_NAMES = [
  "Smith", "Jenkins", "Johnson", "Williams", "Brown", "Davis", "Miller", "Wilson", "Moore", "Taylor",
  "Anderson", "Thomas", "Jackson", "White", "Harris", "Martin", "Thompson", "Garcia", "Martinez", "Robinson",
  "Clark", "Rodriguez", "Lewis", "Walker", "Young", "Allen", "King", "Wright", "Scott", "Hill",
];

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
function randomName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

async function main() {
  if (!DEMO_AGENCY_ID) throw new Error("DEMO_AGENCY_ID is not set in .env.local - refusing to run without an explicit scope.");
  if (!DEMO_LOGIN_PASSWORD) throw new Error("DEMO_LOGIN_PASSWORD is not set in .env.local");

  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const asUser = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  console.log(`Authenticating as ${AUTH_EMAIL} (only to resolve agency_id server-side for the hashing RPC)...`);
  const { data: signInData, error: signInErr } = await asUser.auth.signInWithPassword({ email: AUTH_EMAIL, password: DEMO_LOGIN_PASSWORD });
  if (signInErr || !signInData.session) throw new Error(`Sign-in failed: ${signInErr?.message}`);

  console.log(`Fetching the demo agency's encryption key (agency_id=${DEMO_AGENCY_ID})...`);
  const { data: keyRow, error: keyErr } = await admin.from("agency_encryption_keys").select("encryption_key").eq("agency_id", DEMO_AGENCY_ID).maybeSingle();
  if (keyErr || !keyRow?.encryption_key) throw new Error(`Could not load the demo agency's encryption key: ${keyErr?.message || "no row found - is the migration live?"}`);
  const agencyKey = await crypto.subtle.importKey("raw", base64ToBytes(keyRow.encryption_key) as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);

  console.log(`Fetching every policy row for agency_id=${DEMO_AGENCY_ID}...`);
  let policyQuery = admin.from("policies").select("id").eq("agency_id", DEMO_AGENCY_ID);
  if (ROW_LIMIT) policyQuery = policyQuery.limit(ROW_LIMIT);
  const { data: policyRows, error: fetchErr } = await policyQuery;
  if (fetchErr) throw new Error(`Fetch failed: ${fetchErr.message}`);
  const ids = (policyRows || []).map((r) => r.id as string);
  console.log(`Found ${ids.length} policies to backfill${ROW_LIMIT ? " (--limit dry run)" : ""}.\n`);
  if (ids.length === 0) return;

  let updated = 0;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunkIds = ids.slice(i, i + CHUNK_SIZE);
    const chunkNames = chunkIds.map(() => randomName());

    const { data: hashResults, error: hashErr } = await asUser.rpc("hash_client_identifiers_full", { p_identifiers: chunkNames });
    if (hashErr) throw new Error(`hash_client_identifiers_full failed on chunk starting at ${i}: ${hashErr.message}`);

    // Deliberately per-row .update() calls, NOT .upsert() - Postgres validates NOT NULL
    // constraints (agency_id, user_id, etc.) against the tentative INSERT row of an `INSERT ...
    // ON CONFLICT DO UPDATE` BEFORE it even gets to resolving the conflict into an update, so a
    // partial-column upsert payload (just the 4 identifier columns) fails outright even though
    // every one of these ids already exists. A plain .update().eq('id', ...) only ever touches
    // the columns named here, full stop - confirmed safe against this table's NOT NULL columns.
    const results = await Promise.all(
      chunkIds.map(async (id, idx) => {
        const name = chunkNames[idx];
        const hashResult = (hashResults as any[])[idx] || {};
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, agencyKey, new TextEncoder().encode(name));
        return admin
          .from("policies")
          .update({
            client_identifier_hash: hashResult.hash ?? null,
            client_identifier_trigrams: hashResult.trigrams ?? null,
            client_identifier_ciphertext: bytesToBase64(ciphertextBuf),
            client_identifier_iv: bytesToBase64(iv),
          })
          .eq("id", id);
      })
    );
    const failed = results.filter((r) => r.error);
    if (failed.length > 0) throw new Error(`Update failed for ${failed.length} row(s) in chunk starting at ${i}: ${failed[0].error?.message}`);

    updated += chunkIds.length;
    console.log(`  [${updated}/${ids.length}] backfilled...`);
  }

  await asUser.auth.signOut();
  console.log(`\n✅ Done. ${updated} demo policies now have a readable dummy name, encrypted + hashed + trigram-indexed for both search and cross-team decryption.`);
}

main().catch((err) => {
  console.error("\n❌ BACKFILL FAILED:", err);
  process.exit(1);
});
