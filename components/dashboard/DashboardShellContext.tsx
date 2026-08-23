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
// 'team' is a distinct value from 'settings' even though both ultimately
// render <SettingsTab> — see the settings render branch in
// app/dashboard/page.tsx for why (it's the "Team" sidebar item deep-linking
// into SettingsTab's own internal Team Management section).
// =============================================================================

export type DashboardTabId =
  | "dashboard"
  | "performance"
  | "commission"
  | "weekly"
  | "agency"
  | "life"
  | "ledger"
  | "reports"
  | "settings"
  | "team"
  | "feedback";

export interface DashboardShellContextValue {
  activeTab: DashboardTabId;
  setActiveTab: (tab: DashboardTabId) => void;
}

export const DashboardShellContext = createContext<DashboardShellContextValue | null>(null);

export function useDashboardTab(): DashboardShellContextValue {
  const ctx = useContext(DashboardShellContext);
  if (!ctx) {
    throw new Error("useDashboardTab() must be called from within app/dashboard/layout.tsx's tree.");
  }
  return ctx;
}
