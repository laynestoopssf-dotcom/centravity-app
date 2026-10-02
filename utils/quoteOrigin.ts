// =============================================================================
// Origin attribution - which channel a Quote came from AND which channel closed a Bound
// policy, so conversions (quote -> bound) can be attributed to Call vs. Text vs. Inbound/Other.
// One value set / one UI / one badge is shared by both; only the column differs:
//   quote_origin = how the quote started, bound_origin = how the deal closed (see
//   supabase/migrations/20260923020000_add_bound_origin.sql for why they're separate columns).
// -----------------------------------------------------------------------------
// Stored as plain text columns on BOTH tables:
//   - policies   quote_origin (set when quoted, survives quoted -> bound) + bound_origin (set at bind)
//   - activities quote_origin on activity_type = 'quote' rows, bound_origin on 'bound' rows
// NULL = logged before this field existed (or via a bulk/historical path) = "unknown".
// Keep the values in sync with the CHECK constraints in
// supabase/migrations/20260923010000_add_quote_origin.sql and 20260923020000_add_bound_origin.sql.
// =============================================================================

export type QuoteOrigin = "call" | "text" | "inbound_other";

export const QUOTE_ORIGIN_OPTIONS: { value: QuoteOrigin; label: string; emoji: string }[] = [
  { value: "call", label: "Call", emoji: "📞" },
  { value: "text", label: "Text", emoji: "💬" },
  { value: "inbound_other", label: "Inbound/Other", emoji: "📥" },
];

export function isQuoteOrigin(value: unknown): value is QuoteOrigin {
  return value === "call" || value === "text" || value === "inbound_other";
}

// Ledger badge. Anything unrecognized/NULL renders as a neutral dash so pre-existing quotes
// are never mislabeled as one of the three channels.
export function quoteOriginBadge(value: string | null | undefined): { text: string; className: string } | null {
  switch (value) {
    case "call":
      return { text: "📞 CALL", className: "bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400" };
    case "text":
      return { text: "💬 TEXT", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-500/10 dark:text-indigo-400" };
    case "inbound_other":
      return { text: "📥 INBOUND/OTHER", className: "bg-sky-100 text-sky-800 dark:bg-sky-500/10 dark:text-sky-400" };
    default:
      return null;
  }
}
