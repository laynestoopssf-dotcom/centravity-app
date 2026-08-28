"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Zap, TriangleAlert, Loader2 } from "lucide-react";
import QuickActionsBar from "../../components/dashboard/QuickActionsBar";
import LogActivityModal, {
  type LoggingType,
  type LogActivityModalProfile,
  type LogActivityModalAgencySettings,
  type LogActivityModalOffice,
  type LogActivityModalQuote,
} from "../../components/dashboard/LogActivityModal";
import { supabase } from "../../utils/supabase";
import { postLoggerAction, postLoggerDataChanged, type LoggerAction } from "../../utils/loggerBridge";

// =============================================================================
// Standalone "Launch Logger" pop-out (see the "Pop Out" button in
// DashboardTab.tsx, wired via window.open in components/DashboardTab.tsx).
// -----------------------------------------------------------------------------
// Deliberately outside app/dashboard/ so it does NOT inherit that route's
// layout.tsx (dark sidebar + top header + content padding - see
// app/dashboard/layout.tsx) - Next.js layouts are scoped by directory, so a
// page here only ever picks up the root app/layout.tsx (just <html>/<body> +
// fonts, no dashboard chrome at all).
//
// "Inbound"/"Outbound" stay simple one-tap relays to window.opener (see
// utils/loggerBridge.ts) - there's no form for those, so re-implementing them
// here would just be duplicated plumbing for zero benefit.
//
// "Quote"/"Bound" now render the exact same shared LogActivityModal the main
// dashboard tab uses, entirely within THIS window - this popup carries its
// own same-origin Supabase client (session is shared via cookies, since
// `utils/supabase.ts`'s createBrowserClient persists it there), and fetches
// just enough of its own data (profile/agencySettings/offices/quoted
// pipeline) to render and submit that form independently, with no dependency
// on window.opener at submit time. Once a submission succeeds, it pings
// window.opener with a "dataChanged" message so the dashboard tab (if still
// open) knows to refetch its own stats/pipeline - that's the only remaining
// use of the postMessage bridge for these two actions.
// =============================================================================

interface PopoutData {
  profile: LogActivityModalProfile;
  agencySettings: LogActivityModalAgencySettings | null;
  offices: LogActivityModalOffice[];
  quotedPipeline: LogActivityModalQuote[];
}

type DataStatus = "loading" | "ready" | "signed_out" | "error";

function LoggerContent() {
  const searchParams = useSearchParams();
  const isService = searchParams.get("service") === "1";
  const agencyName = searchParams.get("agency") || "Centravity";

  const [openerAvailable, setOpenerAvailable] = useState(true);
  const [flash, setFlash] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const [dataStatus, setDataStatus] = useState<DataStatus>("loading");
  const [popoutData, setPopoutData] = useState<PopoutData | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [loggingType, setLoggingType] = useState<LoggingType>("quote");

  useEffect(() => {
    setOpenerAvailable(!!window.opener && !window.opener.closed);
  }, []);

  const flashMessage = (msg: string, type: "success" | "error" = "success") => {
    setFlash({ msg, type });
    window.setTimeout(() => setFlash(null), type === "error" ? 4000 : 1800);
  };

  // Own, lightweight data layer - only the columns LogActivityModal actually needs, not the full
  // dashboard's stats/pipeline. Re-callable (not just a mount-time effect) so a successful submit
  // can refresh the quoted-pipeline slice for the "bind from existing quote" picker without
  // requiring a full page reload.
  const loadData = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setDataStatus("signed_out");
      return;
    }

    const { data: profileRow, error: profileErr } = await supabase
      .from("profiles")
      .select("id, agency_id, office_id, is_floater")
      .eq("id", session.user.id)
      .maybeSingle();
    if (profileErr || !profileRow) {
      console.error("[logger] profile fetch failed:", profileErr);
      setDataStatus("error");
      return;
    }

    const [agencyRes, officesRes, quotedRes] = await Promise.all([
      supabase.from("agencies").select("name, custom_product_lines").eq("id", profileRow.agency_id).maybeSingle(),
      supabase.from("offices").select("id, name").eq("agency_id", profileRow.agency_id),
      // Scoped to this signed-in user's own quotes (not agency-wide) - the popup is a personal
      // quick-launch tool for whoever is signed in, not a management console, so "bind from
      // existing quote" here only ever needs to offer up your own open quotes.
      supabase
        .from("policies")
        .select("id, client_identifier_hash, product_line, premium_amount, payment_cycle, logged_at")
        .eq("agency_id", profileRow.agency_id)
        .eq("user_id", profileRow.id)
        .eq("status", "quoted")
        .order("logged_at", { ascending: false })
        .limit(500),
    ]);

    if (agencyRes.error) console.error("[logger] agency fetch failed:", agencyRes.error);
    if (officesRes.error) console.error("[logger] offices fetch failed:", officesRes.error);
    if (quotedRes.error) console.error("[logger] quoted-pipeline fetch failed:", quotedRes.error);

    setPopoutData({
      profile: profileRow,
      agencySettings: agencyRes.data || null,
      offices: officesRes.data || [],
      quotedPipeline: quotedRes.data || [],
    });
    setDataStatus("ready");
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const dispatch = (action: LoggerAction | "quote" | "bound") => {
    if (action === "inbound" || action === "outbound") {
      if (!window.opener || window.opener.closed) {
        setOpenerAvailable(false);
        return;
      }
      postLoggerAction(window.opener, action);
      // Instant actions need no further input, so just flash a local confirmation - the real
      // toast lands in the (possibly minimized/backgrounded) dashboard tab, which the user has no
      // reason to jump back to for these two.
      flashMessage(action === "inbound" ? "Inbound Call Logged!" : "Outbound Touch Logged!");
      return;
    }

    // Quote/Bound render fully locally now - no window.opener dependency at all to open the
    // form (only the post-submit "dataChanged" ping below wants it, and that's best-effort).
    if (dataStatus !== "ready") return;
    setLoggingType(action === "bound" ? (isService ? "cross_sell" : "bound") : isService ? "complex_res" : "quote");
    setModalOpen(true);
  };

  const handleModalSuccess = (message: string) => {
    setModalOpen(false);
    flashMessage(message);
    // This window just wrote directly to Supabase on its own - the dashboard tab (if still open)
    // has no other way to find out, so ping it to refetch. Best-effort: if it's been closed since
    // this popup launched, there's simply nothing to refresh.
    if (window.opener && !window.opener.closed) {
      postLoggerDataChanged(window.opener);
    }
    // Refresh this window's own quoted-pipeline slice too, so back-to-back Binds in the same
    // session see whatever was just quoted/bound reflected in the household picker.
    loadData();
  };

  const handleModalError = (message: string) => {
    flashMessage(message, "error");
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
              Your Centravity dashboard tab isn&apos;t open anymore. Inbound/Outbound need it open to log - Quote/Bind still work here, but won&apos;t sync back until it is.
            </p>
          </div>
        )}

        {dataStatus === "signed_out" && (
          <div className="w-full flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
            <TriangleAlert size={16} className="shrink-0 mt-0.5" />
            <p className="text-xs font-semibold leading-snug">
              You&apos;re not signed in to Centravity in this window. Sign in on your dashboard tab, then relaunch this popup.
            </p>
          </div>
        )}

        {dataStatus === "error" && (
          <div className="w-full flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">
            <TriangleAlert size={16} className="shrink-0 mt-0.5" />
            <p className="text-xs font-semibold leading-snug">Couldn&apos;t load your profile. Close this popup and relaunch it.</p>
          </div>
        )}

        {dataStatus === "loading" && <Loader2 size={20} className="animate-spin text-gray-400" />}

        <QuickActionsBar
          standalone
          isService={isService}
          onLogInboundCall={() => dispatch("inbound")}
          onLogOutboundTouch={() => dispatch("outbound")}
          onOpenQuoteModal={() => dispatch("quote")}
          onOpenBoundModal={() => dispatch("bound")}
        />

        {flash && (
          <div
            className={`w-full text-center rounded-xl border text-xs font-bold py-2 animate-in fade-in duration-150 ${
              flash.type === "error" ? "bg-red-50 border-red-100 text-red-700" : "bg-emerald-50 border-emerald-100 text-emerald-700"
            }`}
          >
            {flash.msg}
          </div>
        )}
      </main>

      {dataStatus === "ready" && popoutData && (
        <LogActivityModal
          isOpen={modalOpen}
          loggingType={loggingType}
          profile={popoutData.profile}
          agencySettings={popoutData.agencySettings}
          offices={popoutData.offices}
          quotedPipeline={popoutData.quotedPipeline}
          onClose={() => setModalOpen(false)}
          onSuccess={handleModalSuccess}
          onError={handleModalError}
        />
      )}
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
