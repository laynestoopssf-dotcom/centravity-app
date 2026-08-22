"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  ChevronDown,
  LifeBuoy,
  Rocket,
  ClipboardList,
  Wallet,
  Settings,
  ShieldCheck,
  Mail,
} from "lucide-react";
import { supabase } from "../../../utils/supabase";

// =============================================================================
// Protected route: /dashboard/help — the FAQ / Help Center.
// -----------------------------------------------------------------------------
// Self-contained page (own auth check, no data fetch beyond that), mirroring
// the pattern in app/dashboard/reveal/page.tsx and app/dashboard/cockpit/page.tsx.
// Ships with a handful of real, useful placeholder articles grouped into
// categories so there's an immediate foundation — new articles just get
// appended to CATEGORIES below, no structural changes needed.
// =============================================================================

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  items: FaqItem[];
}

const CATEGORIES: FaqCategory[] = [
  {
    id: "getting-started",
    label: "Getting Started",
    icon: Rocket,
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
    icon: ClipboardList,
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
    icon: Wallet,
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
    icon: Settings,
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
    icon: ShieldCheck,
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

function AccordionRow({ item, isOpen, onToggle }: { item: FaqItem; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-4 text-left"
      >
        <span className="text-sm font-semibold text-gray-900">{item.question}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && <p className="pb-4 -mt-1 text-sm text-gray-600 leading-relaxed pr-6">{item.answer}</p>}
    </div>
  );
}

type LoadState = "checking" | "ready";

export default function HelpPage() {
  const router = useRouter();
  const [status, setStatus] = useState<LoadState>("checking");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Lightweight auth gate only — this page has no data of its own to fetch,
  // it just shouldn't be reachable while signed out (mirrors the pattern in
  // app/dashboard/cockpit/page.tsx and app/dashboard/reveal/page.tsx).
  useEffect(() => {
    let mounted = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!session?.user?.id) {
        router.replace("/");
        return;
      }
      setStatus("ready");
    })();
    return () => {
      mounted = false;
    };
  }, [router]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "SIGNED_OUT" || !sess) router.replace("/");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  const filteredCategories = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return CATEGORIES;
    return CATEGORIES.map((cat) => ({
      ...cat,
      items: cat.items.filter(
        (item) =>
          item.question.toLowerCase().includes(term) || item.answer.toLowerCase().includes(term)
      ),
    })).filter((cat) => cat.items.length > 0);
  }, [query]);

  const totalMatches = filteredCategories.reduce((sum, cat) => sum + cat.items.length, 0);

  if (status !== "ready") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LifeBuoy className="animate-pulse text-gray-300" size={32} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-6 py-10">
        <button
          onClick={() => router.push("/dashboard")}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-800 transition-colors mb-6"
        >
          <ArrowLeft size={16} /> Back to Dashboard
        </button>

        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
              <LifeBuoy size={26} />
            </div>
            <h1 className="text-3xl font-black text-gray-900">Help &amp; FAQ</h1>
          </div>
          <p className="text-gray-500 max-w-2xl">
            Answers to common questions about logging activity, commissions, and settings. Can&apos;t find
            what you need? Reach out using the contact box at the bottom of the page.
          </p>
        </header>

        <div className="relative mb-8">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a topic — e.g. &quot;renewal&quot;, &quot;VC&quot;, &quot;identifier&quot;..."
            className="w-full pl-11 pr-4 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {query.trim() !== "" && (
          <p className="text-xs font-semibold text-gray-400 mb-4 uppercase tracking-wider">
            {totalMatches === 0 ? "No matches" : `${totalMatches} matching article${totalMatches === 1 ? "" : "s"}`}
          </p>
        )}

        <div className="space-y-6">
          {filteredCategories.map((cat) => {
            const Icon = cat.icon;
            return (
              <div key={cat.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
                  <div className="p-1.5 bg-white border border-gray-200 rounded-lg text-blue-600">
                    <Icon size={16} />
                  </div>
                  <h2 className="font-bold text-gray-900 text-sm">{cat.label}</h2>
                </div>
                <div className="px-6">
                  {cat.items.map((item) => {
                    const key = `${cat.id}::${item.question}`;
                    return (
                      <AccordionRow
                        key={key}
                        item={item}
                        isOpen={openKey === key}
                        onToggle={() => setOpenKey((prev) => (prev === key ? null : key))}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}

          {filteredCategories.length === 0 && (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
              <p className="text-sm font-semibold text-gray-400">No articles match &quot;{query}&quot;.</p>
              <p className="text-xs text-gray-400 mt-1">Try a different search term, or reach out below.</p>
            </div>
          )}
        </div>

        <div className="mt-10 bg-gray-900 rounded-2xl p-6 flex items-center gap-4 text-white">
          <div className="p-2.5 bg-white/10 rounded-xl shrink-0">
            <Mail size={20} />
          </div>
          <div>
            <h3 className="font-bold text-sm">Still stuck?</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Post in the Community Board from your dashboard sidebar, or ask your agency owner/admin to reach
              out to Centravity support on your behalf.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
