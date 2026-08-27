// =============================================================================
// ONE-OFF: backfill the live Demo Agency's custom_product_lines.
// -----------------------------------------------------------------------------
// The Demo Agency (DEMO_AGENCY_ID) was created by scripts/seed_demo_agency.ts
// before that script (and app/actions/onboarding.ts's saveStep1Foundation,
// for real signups) started seeding the default State Farm sub-line catalog
// on agency creation — see utils/defaultProductLines.ts. Rather than wiping
// and re-running the full historical demo seed just to pick up this one
// field, this does a single, targeted, idempotent UPDATE against the
// already-live demo agency row.
//
// Safe to run more than once — it's a plain overwrite of one column on one
// specific row (`id = DEMO_AGENCY_ID`), not an insert, so re-running just
// re-applies the same catalog rather than creating duplicates.
//
// Run with:  npm run backfill:demo-lines
// (= `tsx --env-file=.env.local scripts/backfill_demo_product_lines.ts`)
//
// Same "no server-only imports" constraint as seed_demo_agency.ts (see that
// file's header comment) — builds its own minimal admin client instead of
// importing app/actions/supabaseAdmin.ts.
// =============================================================================

import { createClient } from "@supabase/supabase-js";
import { DEFAULT_STATE_FARM_PRODUCT_LINES } from "../utils/defaultProductLines";

function normalizeSupabaseUrl(raw: string): string {
  let url = (raw || "").trim().replace(/['"]/g, "");
  url = url.replace(/\/rest\/v1\/?$/, "");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url.replace(/\/+$/, "");
}

const SUPABASE_URL = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || "");
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DEMO_AGENCY_ID = process.env.DEMO_AGENCY_ID || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run via `npm run backfill:demo-lines` (loads .env.local).");
  process.exit(1);
}
if (!DEMO_AGENCY_ID) {
  console.error("Missing DEMO_AGENCY_ID in .env.local.");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log(`Backfilling custom_product_lines for demo agency ${DEMO_AGENCY_ID}...`);

  const { data, error } = await supabaseAdmin
    .from("agencies")
    .update({ custom_product_lines: DEFAULT_STATE_FARM_PRODUCT_LINES })
    .eq("id", DEMO_AGENCY_ID)
    .select("id, name, custom_product_lines")
    .maybeSingle();

  if (error) {
    console.error("Backfill failed:", error);
    process.exit(1);
  }
  if (!data) {
    console.error(`No agency row found with id ${DEMO_AGENCY_ID} — has the demo agency been seeded yet?`);
    process.exit(1);
  }

  console.log(`Done. "${data.name}" now has ${(data.custom_product_lines || []).length} custom product lines:`);
  console.log((data.custom_product_lines || []).map((l: any) => `  - ${l.name} (${l.parent})`).join("\n"));
}

main();
