// =============================================================================
// Default product-line catalog for brand-new State Farm agencies.
// -----------------------------------------------------------------------------
// Single source of truth, written into agencies.custom_product_lines in the
// EXACT { name, parent } shape Settings -> Custom Product Lines writes when
// an owner adds one by hand (components/SettingsTab.tsx's "Add" button) -
// same column, same JSON shape, so every consumer of custom_product_lines
// (Scoreboard logging dropdowns, resolveParentLine roll-ups, commission/YTD
// math, the Coaching Suite, etc.) picks these up identically to a manually-
// added line, no separate code path required.
//
// Consumed by:
//   - app/actions/onboarding.ts's saveStep1Foundation - written on every
//     brand-new agency's first creation (real signups).
//   - scripts/seed_demo_agency.ts - written into the demo agency's row so
//     the demo matches what a real new agency gets.
//
// Deliberately its own plain module (no "use server"/"server-only" imports)
// so both of the above can import it - onboarding.ts's own supabaseAdmin.ts
// has `import "server-only"`, which throws when resolved by plain Node/tsx
// outside Next's bundler, and seed_demo_agency.ts runs as a standalone tsx
// script for exactly that reason (see its own header comment).
//
// This REPLACES the generic 5-line fallback (DEFAULT_LINES in
// SettingsTab.tsx / DEFAULT_PRODUCT_LINES elsewhere) entirely rather than
// supplementing it - a State Farm agency writes "Added Auto"/"Raw New Auto",
// never a bare generic "Auto" line, so there's no reason to also seed the
// generic placeholder names alongside the real catalog.
// =============================================================================
export interface DefaultProductLine {
  name: string;
  parent: "Auto" | "Fire" | "Commercial" | "Health" | "Life";
}

export const DEFAULT_STATE_FARM_PRODUCT_LINES: DefaultProductLine[] = [
  // Auto Roll-Up
  { name: "Added Auto", parent: "Auto" },
  { name: "Raw New Auto", parent: "Auto" },
  // Fire Roll-Up
  { name: "Non Tenant - Condominium Unitowners", parent: "Fire" },
  { name: "Non Tenant - Homeowners", parent: "Fire" },
  { name: "Non Tenant - Manufactured Home Policy", parent: "Fire" },
  { name: "Other Personal Fire - Boatowners Policy", parent: "Fire" },
  { name: "Other Personal Fire - Personal Articles Policy", parent: "Fire" },
  { name: "Other Personal Fire - Rental Dwelling Policy", parent: "Fire" },
  { name: "Other Personal Fire - Umbrella", parent: "Fire" },
  { name: "Tenant - Renters", parent: "Fire" },
  // Commercial Roll-Up
  { name: "Commercial Fire - Business Insurance", parent: "Commercial" },
  { name: "Commercial Fire - Commercial Liability Umbrella Policy", parent: "Commercial" },
  { name: "Commercial Fire - Contractors", parent: "Commercial" },
  // Health Roll-Up
  { name: "Hospital income", parent: "Health" },
  { name: "Medicare Supp/Medigap", parent: "Health" },
  // Life Roll-Up
  { name: "Term Life", parent: "Life" },
  { name: "Universal Life", parent: "Life" },
  { name: "Whole Life", parent: "Life" },
];
