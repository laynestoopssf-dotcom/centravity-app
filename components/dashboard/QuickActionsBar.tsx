"use client";

import React from "react";
import { PhoneIncoming, PhoneOutgoing, FileText, ShieldCheck, RefreshCw, Users } from "lucide-react";

export interface QuickActionsBarProps {
  // Service reps log "Complex Res." / "Cross-Sells" instead of "Quote" /
  // "Bound" — same distinction the full desktop Scoreboard tiles make (see
  // DashboardTab.tsx's `isService` branches on its Quote/Bound tiles) — so
  // this dock stays wired to the exact same activity types a service rep's
  // full-width dashboard already logs, not a generic "Quote"/"Bound" that
  // would silently mislabel their pipeline.
  isService: boolean;
  onLogInboundCall: () => void;
  onLogOutboundTouch: () => void;
  onOpenQuoteModal: () => void;
  onOpenBoundModal: () => void;
  // True only for the dedicated /logger pop-out window (see app/logger/page.tsx), which is
  // nothing BUT this grid inside a tiny, purpose-sized browser window. The default
  // `fixed bottom-4 inset-x-3` dock positioning exists to float this bar over OTHER dashboard
  // content on a narrow-but-tall browser window - there's no other content in the pop-out to float
  // over, so that same fixed positioning would just leave dead space above a card stuck to the
  // bottom edge instead of filling the window. Standalone mode renders the identical grid/card,
  // just centered in normal document flow so it actually fills the small popup.
  standalone?: boolean;
}

interface ActionButtonProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  colorClass: string;
  onClick: () => void;
}

function ActionButton({ icon: Icon, label, colorClass, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 px-1 hover:bg-gray-50 active:scale-95 transition-all"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-full ${colorClass}`}>
        <Icon size={16} />
      </div>
      <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wide truncate max-w-full">{label}</span>
    </button>
  );
}

// =============================================================================
// "Quick Actions" control pad for the compact/narrow-window view.
// -----------------------------------------------------------------------------
// Replaces the old single floating "outbound touch" FAB (previously inline in
// app/dashboard/page.tsx, `md:hidden fixed bottom-6 right-6`) with all four
// activity-logging actions a rep normally reaches via the full-width
// Scoreboard tiles (see DashboardTab.tsx's Calls/Quote/Bound tiles), so
// someone who's docked the window to the side of their screen (this app's
// stated use case for the responsive work in DashboardMetrics.tsx) can still
// log activity without ever needing to widen it back out.
//
// `lg:hidden` matches DashboardMetrics.tsx's own breakpoint choice for the
// same underlying reason: the dashboard shell's sidebar becomes a fixed
// 288px column at `md` (see app/dashboard/layout.tsx), so waiting for `lg`
// here keeps this dock (and the full-width tiles it duplicates) from ever
// being on-screen at the same time in a way that would double up controls.
// =============================================================================
export default function QuickActionsBar({
  isService,
  onLogInboundCall,
  onLogOutboundTouch,
  onOpenQuoteModal,
  onOpenBoundModal,
  standalone = false,
}: QuickActionsBarProps) {
  const grid = (
    <div className={`grid grid-cols-4 gap-1 rounded-2xl border border-gray-200 bg-white/95 backdrop-blur-md p-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.18)] ${standalone ? "w-full" : "mx-auto max-w-md"}`}>
      <ActionButton icon={PhoneIncoming} label="Inbound" colorClass="bg-emerald-50 text-emerald-600" onClick={onLogInboundCall} />
      <ActionButton icon={PhoneOutgoing} label="Outbound" colorClass="bg-blue-50 text-blue-600" onClick={onLogOutboundTouch} />
      <ActionButton
        icon={isService ? RefreshCw : FileText}
        label={isService ? "Complex Res" : "Quote"}
        colorClass="bg-purple-50 text-purple-600"
        onClick={onOpenQuoteModal}
      />
      <ActionButton
        icon={isService ? Users : ShieldCheck}
        label={isService ? "Cross-Sell" : "Bound"}
        colorClass="bg-emerald-50 text-emerald-600"
        onClick={onOpenBoundModal}
      />
    </div>
  );

  if (standalone) return grid;

  return <div className="lg:hidden fixed bottom-4 inset-x-3 z-40">{grid}</div>;
}
