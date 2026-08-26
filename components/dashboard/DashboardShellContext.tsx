"use client";

import { createContext, useContext } from "react";

// =============================================================================
// Shared "which panel is showing" state for the /dashboard app shell.
// -----------------------------------------------------------------------------
// `activeTab` used to be a plain useState living inside app/dashboard/page.tsx
// itself, since the sidebar that reads/sets it lived right next to it in the
// same component. Now that the sidebar has moved out into app/dashboard/layout.tsx
// (a strict ANCESTOR of page.tsx in the render tree), the state has to live at
// the layout instead — a layout can never reach into a child page's local
// state. This context is the bridge: app/dashboard/layout.tsx owns the actual
// useState and provides it here; app/dashboard/page.tsx (and nothing else —
// /dashboard/reveal and /dashboard/cockpit don't use this hook) consumes it
// via useDashboardTab() as a drop-in replacement for its old local state, so
// every existing `activeTab === 'whatever'` check throughout that file keeps
// working completely unchanged.
//
// The standalone "Team" sidebar item has been retired — team roster
// management lives inside SettingsTab's own internal Team Management
// section (Settings → Team Management), reachable without a dedicated
// top-level tab.
//
// 'agent' is the owner-only "Agent Dashboard" master command center
// (merged YTD Projections + Revenue & Variable Comp) — a tab like any
// other here now, not a separate /dashboard/agent route, so switching to
// it is an instant client-side tab swap instead of a full page load. See
// components/AgentDashboardTab.tsx's header comment for the owner-only
// gating rationale.
// =============================================================================

export type DashboardTabId =
  | "dashboard"
  | "agent"
  | "performance"
  | "commission"
  | "weekly"
  | "agency"
  | "life"
  | "ledger"
  | "reports"
  | "settings"
  | "feedback"
  | "profile";

export interface DashboardShellContextValue {
  activeTab: DashboardTabId;
  setActiveTab: (tab: DashboardTabId) => void;
  // Lets a child of this layout (namely MyProfileTab, rendered inside
  // app/dashboard/page.tsx) ask the layout to re-fetch the header's name/avatar right
  // after a save — the alternative (a full page reload) would also blow away whatever
  // tab the user was on. Optional because routes that mount this context without ever
  // rendering the shell chrome (see app/dashboard/layout.tsx's isShellRoute check)
  // have nothing meaningful to refresh.
  refreshShellUser?: () => void;
}

export const DashboardShellContext = createContext<DashboardShellContextValue | null>(null);

export function useDashboardTab(): DashboardShellContextValue {
  const ctx = useContext(DashboardShellContext);
  if (!ctx) {
    throw new Error("useDashboardTab() must be called from within app/dashboard/layout.tsx's tree.");
  }
  return ctx;
}
