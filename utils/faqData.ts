// =============================================================================
// Shared FAQ/Help Center content — single source of truth for both
// app/dashboard/help/page.tsx (renders it as an accordion) and
// app/api/chat/route.ts (flattens it into "Stratt" the AI Support assistant's
// system prompt as its ONLY knowledge base). Extracted out of the help page
// itself so the two can never drift — anything added here shows up in both
// places automatically, with no risk of the AI answering from a stale copy.
// =============================================================================

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqCategory {
  id: string;
  label: string;
  items: FaqItem[];
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    items: [
      {
        question: "What's the difference between the Scoreboard, Ledger, and Commissions tabs?",
        answer:
          "Scoreboard is your real-time pipeline and pacing view. Data Ledger is the searchable, editable record of every activity/policy ever logged. Commissions (My Commissions / Team Commissions) is the itemized payout statement calculated from that same ledger data.",
      },
      {
        question: "How do I resume the onboarding wizard if I closed it partway through?",
        answer:
          "Onboarding auto-saves as you go — just sign back in and you'll be dropped right back on the step you left off on. Nothing you already entered is lost.",
      },
      {
        question: "What does VC stand for?",
        answer:
          "VC is short for Variable Compensation — an extra 0-3% commission bump on top of an agency's base rates, earned by hitting Auto/Fire app-growth and Financial Services (Life/Health) commission targets. See the Revenue & Variable Comp tab or the Cockpit's VC Tier Sniper for the live breakdown.",
      },
    ],
  },
  {
    id: "logging-activity",
    label: "Logging Activity",
    items: [
      {
        question: "What's the difference between Quote and Bind?",
        answer:
          "Quote logs a price you gave a prospect - it counts toward your quote pace but no premium/commission yet. Bind means the client actually took the policy - log it directly, or check \"Bind from existing Household Quote?\" to promote an earlier quote instead of re-typing everything.",
      },
      {
        question: "Why can't I find a client by typing part of their name in search?",
        answer:
          "Client identifiers are cryptographically scrambled (blind-indexed) before they ever leave your browser, for compliance - the database only ever sees a one-way hash, never the plain text. Search still works for anything YOU personally typed on this device (it's cached locally in your browser), but it can't do a partial/fuzzy match against entries logged elsewhere. Type the exact identifier you used when logging it for the most reliable match.",
      },
      {
        question: "What does the Identifier field actually get used for?",
        answer:
          "It's a private label (e.g. \"Lead #459\") that helps YOU find this entry again later in your own Pipeline/Ledger - it's optional, never shown to teammates in plain text, and never stored as PII.",
      },
      {
        question: "What's the difference between a 6-Month Term and 12-Month Term (Renewal Cycle)?",
        answer:
          "It's how often the policy's term premium renews/bills. Pick whichever matches the actual policy - it affects how your entered premium gets annualized for commission math.",
      },
    ],
  },
  {
    id: "commissions-payroll",
    label: "Commissions & Payroll",
    items: [
      {
        question: "How do Variable Accelerators stack?",
        answer:
          "Every accelerator tier whose threshold is met contributes its rate bump or bonus, and they all add together - never just the single largest tier. Rates always apply to your full eligible premium for the month, retroactively, not just the amount above a threshold.",
      },
      {
        question: "Why doesn't a renewal policy count toward my commission or Scoreboard numbers?",
        answer:
          "Centravity's Scoreboard and commission engine are strictly New Business - a policy flagged as a renewal is automatically excluded from both, so your pacing and payout always reflect new production only.",
      },
      {
        question: "What counts as \"Financial Services\" for commission purposes?",
        answer:
          "Life and Health are grouped together as Financial Services (FS) everywhere commission tiers, accelerators, and Variable Compensation are calculated.",
      },
    ],
  },
  {
    id: "settings-admin",
    label: "Settings & Admin",
    items: [
      {
        question: "Where do I set up Travel/Promotion benchmarks?",
        answer:
          "Settings → Corporate Promotions → Travel & Promotion Qualification Benchmarks. Every field starts blank on purpose - there are no pre-filled sample goals, so nothing counts toward qualification until you enter your own numbers.",
      },
      {
        question: "How do I control who can see the Revenue & Variable Comp tab?",
        answer:
          "Settings → Roles & Permissions → toggle \"View Revenue & Variable Compensation (VC)\" for any custom role. Owners and Admins always have it by default.",
      },
      {
        question: "What's the difference between a Custom Target and a Corporate Target toggle?",
        answer:
          "The Corporate Targets toggles (Variable Compensation / Travel) turn entire built-in widgets on or off agency-wide. The Custom Target Builder underneath lets you define your own one-off goals on top of any tracked metric, and choose whether the team sees it on the Scoreboard or it stays owner-only on the Revenue tab.",
      },
    ],
  },
  {
    id: "troubleshooting",
    label: "Troubleshooting",
    items: [
      {
        question: "A slider or input feels laggy or jumps around while I drag it.",
        answer:
          "This has been fixed as of the latest release - sliders now use a stable scale that doesn't shift while dragging. If you still see this, try a hard refresh; if it persists, let us know via the contact box below.",
      },
      {
        question: "I logged a policy but don't see the identifier I typed anywhere.",
        answer:
          "The identifier you type is cached locally in your own browser and re-displayed from that cache - it's never stored in plain text on the server. If you logged it from a different browser/device than the one you're viewing it on now, it will only show the hashed fallback there.",
      },
    ],
  },
];

/** Flattens the FAQ into a plain-text block for injection into an LLM system prompt. */
export function faqCategoriesToPlainText(categories: FaqCategory[] = FAQ_CATEGORIES): string {
  return categories
    .map((cat) => {
      const items = cat.items.map((item) => `Q: ${item.question}\nA: ${item.answer}`).join("\n\n");
      return `### ${cat.label}\n${items}`;
    })
    .join("\n\n");
}
