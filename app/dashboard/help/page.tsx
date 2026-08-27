"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
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
import { FAQ_CATEGORIES, type FaqItem } from "../../../utils/faqData";

// =============================================================================
// Protected route: /dashboard/help — the FAQ / Help Center.
// -----------------------------------------------------------------------------
// Unlike /dashboard/cockpit and /dashboard/reveal (deliberately full-bleed,
// chrome-less routes), this one IS wrapped in the persistent sidebar/header
// shell — see app/dashboard/layout.tsx's `isShellRoute` check, which
// special-cases this exact path so navigating here (via the "Help & FAQ"
// <Link> in components/dashboard/DashboardSidebar.tsx) keeps the main nav
// fully visible instead of replacing the whole screen. Still its own real
// Next.js route rather than a tab inside app/dashboard/page.tsx's SPA - only
// its OWN auth check + no shared dashboard data fetch, so no benefit to
// folding it into that page's much heavier data-loading lifecycle.
//
// The actual FAQ content lives in utils/faqData.ts — a shared module also
// consumed by app/api/chat/route.ts, which flattens it into "Stratt" the AI
// Support assistant's system prompt as its ONLY knowledge base. Keeping it in
// one place means the assistant can never answer from stale/diverged content.
// =============================================================================

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  "getting-started": Rocket,
  "logging-activity": ClipboardList,
  "commissions-payroll": Wallet,
  "settings-admin": Settings,
  troubleshooting: ShieldCheck,
};

const CATEGORIES = FAQ_CATEGORIES.map((cat) => ({
  ...cat,
  icon: CATEGORY_ICONS[cat.id] || LifeBuoy,
}));

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
      <div className="flex items-center justify-center py-24">
        <LifeBuoy className="animate-pulse text-gray-300" size={32} />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-10">
      <div className="max-w-4xl mx-auto">
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
            placeholder="Search for a topic — e.g. &quot;renewal&quot;, &quot;AEC&quot;, &quot;identifier&quot;..."
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
