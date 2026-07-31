"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Zap, TriangleAlert } from "lucide-react";
import QuickActionsBar from "../../components/dashboard/QuickActionsBar";
import { postLoggerAction, type LoggerAction } from "../../utils/loggerBridge";

// =============================================================================
// Standalone "Launch Logger" pop-out (see the "Pop Out" button in
// DashboardTab.tsx, wired via window.open in app/dashboard/page.tsx).
// -----------------------------------------------------------------------------
// Deliberately outside app/dashboard/ so it does NOT inherit that route's
// layout.tsx (dark sidebar + top header + content padding - see
// app/dashboard/layout.tsx) - Next.js layouts are scoped by directory, so a
// page here only ever picks up the root app/layout.tsx (just <html>/<body> +
// fonts, no dashboard chrome at all).
//
// Has no Supabase client of its own on purpose - see utils/loggerBridge.ts for
// why every tap here is relayed to the dashboard tab that opened this window
// (window.opener) instead of re-implementing activity logging a second time.
// `service` in the query string (set by the Launch button, which already
// knows profile.role) is only used for icon/label text - the actual
// isService-gated activity-type routing happens on the opener's side, in the
// exact same openLogModal(...) call its own Quick Actions dock already uses,
// so there's no second place for that logic to drift out of sync.
// =============================================================================
function LoggerContent() {
  const searchParams = useSearchParams();
  const isService = searchParams.get("service") === "1";
  const agencyName = searchParams.get("agency") || "Centravity";

  const [openerAvailable, setOpenerAvailable] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    setOpenerAvailable(!!window.opener && !window.opener.closed);
  }, []);

  const dispatch = (action: LoggerAction) => {
    if (!window.opener || window.opener.closed) {
      setOpenerAvailable(false);
      return;
    }
    postLoggerAction(window.opener, action);

    if (action === "inbound" || action === "outbound") {
      // Instant actions need no further input, so just flash a local
      // confirmation - the real toast lands in the (possibly minimized/
      // backgrounded) dashboard tab, which the user has no reason to jump
      // back to for these two.
      setFlash(action === "inbound" ? "Inbound Call Logged!" : "Outbound Touch Logged!");
      window.setTimeout(() => setFlash(null), 1600);
    } else {
      // Quote/Bound open the full line-item modal on the dashboard tab -
      // there's no room to render that form in this tiny popup, so bring the
      // dashboard tab forward so the user actually sees it appear.
      window.opener.focus();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Zap size={14} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-black text-gray-900 uppercase tracking-wide truncate">Quick Actions</p>
          <p className="text-[10px] text-gray-400 truncate">{agencyName}</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
        {!openerAvailable && (
          <div className="w-full flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <TriangleAlert size={16} className="shrink-0 mt-0.5" />
            <p className="text-xs font-semibold leading-snug">
              Your Centravity dashboard tab isn&apos;t open anymore. Keep it open in another window/tab for these buttons to work, then relaunch this popup.
            </p>
          </div>
        )}

        <QuickActionsBar
          standalone
          isService={isService}
          onLogInboundCall={() => dispatch("inbound")}
          onLogOutboundTouch={() => dispatch("outbound")}
          onOpenQuoteModal={() => dispatch("quote")}
          onOpenBoundModal={() => dispatch("bound")}
        />

        {flash && (
          <div className="w-full text-center rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-bold py-2 animate-in fade-in duration-150">
            {flash}
          </div>
        )}
      </main>
    </div>
  );
}

export default function LoggerPage() {
  return (
    <Suspense fallback={null}>
      <LoggerContent />
    </Suspense>
  );
}
