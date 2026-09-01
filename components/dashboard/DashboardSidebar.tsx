"use client";

import React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  BarChart3,
  Wallet,
  Settings,
  Award,
  BookOpen,
  FileBarChart,
  CalendarDays,
  Briefcase,
  HeartPulse,
  Crosshair,
  MessageSquare,
  LifeBuoy,
  Crown,
  UserCircle,
  GraduationCap,
} from "lucide-react";
import { useDashboardTab, type DashboardTabId } from "./DashboardShellContext";

export interface DashboardSidebarPermissions {
  canViewAgencyDash: boolean;
  canViewTeamComm: boolean;
  canManageSettings: boolean;
  canViewWeeklyRank: boolean;
  canViewAgencyMtd: boolean;
  canViewLifeModule: boolean;
  canViewReports: boolean;
  // Strictly `role === 'owner'` (not the broader isOwnerLevelRole/'admin'
  // carve-out every other flag here uses) — see the header comment on
  // components/AgentDashboardTab.tsx for why the Agent Dashboard is the one
  // deliberate exception, same as Stripe billing.
  isOwner: boolean;
  // Strictly `role === 'bookkeeper'` — a highly-restricted, payroll-only role
  // (see utils/roles.ts's header comment). Unlike every other flag above,
  // this collapses the ENTIRE nav down to just Commissions + My Profile (kept
  // for their own password) instead of composing from the individual
  // canView* flags, so it's checked directly below rather than via a
  // permission default.
  isBookkeeper: boolean;
}

interface NavItem {
  tab: DashboardTabId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  show: boolean;
}

const brandTileClass = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10";

// Dark, persistent sidebar for the /dashboard app shell (app/dashboard/layout.tsx).
// Dashboard/Scoreboard + Commissions get their own visually separated primary
// group up top; every other existing tab (Performance, Ledger, Reports,
// Weekly Rank, Agency MTD, Life, Executive Cockpit) is preserved underneath a
// "More" divider rather than dropped, per the "keep everything working" call.
// Settings is pinned to the very bottom of the nav (below Community Board and
// Help & FAQ) rather than living up top — it's a destination you visit
// occasionally, not a daily-use tab, and team roster management already
// lives inside it (Settings → Team Management) so the standalone "Team" nav
// item that used to deep-link there has been removed entirely as redundant.
// The standalone YTD Projections and Revenue & Variable Comp tabs have been
// retired in favor of the merged, owner-only "Agent Dashboard" entry above —
// itself just another tab (activeTab === 'agent'), not a separate route, so
// switching into it is an instant swap instead of a full page load.
export default function DashboardSidebar({ permissions }: { permissions: DashboardSidebarPermissions }) {
  const { activeTab, setActiveTab } = useDashboardTab();
  const router = useRouter();
  // Every tab button below only ever renders its own content on the literal
  // "/dashboard" route (they call setActiveTab, which app/dashboard/page.tsx
  // reads) - `activeTab` itself doesn't reset when navigating to a different
  // shell route like /dashboard/help, so two things key off pathname instead:
  // isOnTabbedShell suppresses the "active" highlight on a tab button while
  // sitting on a different route, and goToTab() actually navigates back to
  // "/dashboard" (not just flips the context value underneath a page that
  // isn't listening for it) when a tab button is clicked from anywhere else.
  const pathname = usePathname();
  const isOnTabbedShell = pathname === "/dashboard";
  const goToTab = (tab: DashboardTabId) => {
    setActiveTab(tab);
    if (!isOnTabbedShell) router.push("/dashboard");
  };
  const {
    canViewAgencyDash,
    canViewTeamComm,
    canManageSettings,
    canViewWeeklyRank,
    canViewAgencyMtd,
    canViewLifeModule,
    canViewReports,
    isOwner,
    isBookkeeper,
  } = permissions;

  const primaryItems: NavItem[] = [
    {
      tab: "dashboard",
      label: canViewAgencyDash ? "Team Scoreboard" : "My Scoreboard",
      icon: BarChart3,
      // Bookkeeper is the one role whose nav isn't composed from canView*
      // flags at all - see DashboardSidebarPermissions.isBookkeeper.
      show: !isBookkeeper,
    },
    {
      tab: "commission",
      label: canViewTeamComm ? "Team Commissions" : "My Commissions",
      icon: Wallet,
      show: true,
    },
  ];

  // Order below is deliberate (Team Performance, Weekly Rank, Agency MTD, Life Module,
  // Data Ledger, Reports, then Executive Cockpit rendered separately right after this
  // list - see the .map() call site) - not alphabetical/insertion order, so don't
  // reorder these without reordering the actual requested nav sequence too.
  const moreItems: NavItem[] = [
    {
      tab: "performance",
      label: canViewAgencyDash ? "Team Performance" : "My Performance",
      icon: Award,
      show: !isBookkeeper,
    },
    { tab: "weekly", label: "Weekly Rank", icon: CalendarDays, show: canViewWeeklyRank && !isBookkeeper },
    { tab: "agency", label: "Agency MTD", icon: Briefcase, show: canViewAgencyMtd && !isBookkeeper },
    { tab: "life", label: "Life Module", icon: HeartPulse, show: canViewLifeModule && !isBookkeeper },
    { tab: "ledger", label: "Data Ledger", icon: BookOpen, show: !isBookkeeper },
    { tab: "reports", label: "Reports", icon: FileBarChart, show: canViewReports && !isBookkeeper },
    // Ungated like Data Ledger - every role gets in, not just managers: Deal
    // Autopsies and the Sparring Ring (see components/CoachingTab.tsx) are
    // producer-facing self-serve tools, only the 1-on-1 Snapshot half of the
    // tab is manager-only, gated INSIDE the component itself. Bookkeeper is
    // still excluded - it isn't a sales/coaching role.
    { tab: "coaching", label: "Coaching", icon: GraduationCap, show: !isBookkeeper },
  ];

  const renderButton = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = isOnTabbedShell && activeTab === item.tab;
    return (
      <button
        key={item.tab}
        onClick={() => goToTab(item.tab)}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
          isActive ? "bg-blue-500/15 text-blue-300" : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
        }`}
      >
        <Icon size={18} /> {item.label}
      </button>
    );
  };

  return (
    <nav className="w-full md:w-72 bg-slate-900 border-r border-slate-800 px-4 py-6 flex flex-col md:sticky md:top-0 md:h-screen overflow-y-auto">
      <Link href="/dashboard" className="flex items-center gap-3 mb-8 px-2" aria-label="CENTRAVITY home">
        <div className={brandTileClass}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-blue-400"
            aria-hidden
          >
            <path d="M3 3v16a2 2 0 0 0 2 2h16" />
            <path d="M7 16V9" />
            <path d="M12 16V5" />
            <path d="M17 16v-3" />
          </svg>
        </div>
        <span className="text-lg font-black tracking-[0.2em] text-white">CENTRAVITY</span>
      </Link>

      <div className="space-y-1">{primaryItems.filter((i) => i.show).map(renderButton)}</div>

      {/* Owner-only "master command center" — merges the old standalone YTD
          Projections + Revenue & Variable Comp tabs into one tab. Deliberately
          NOT gated by canManageSettings/isOwnerLevelRole like everything else
          here — strictly the literal agency owner (see DashboardSidebarPermissions
          and components/AgentDashboardTab.tsx's header comment). Its own visually
          distinct group (not folded into "More") so it reads as the special,
          owner-exclusive destination it is. */}
      {isOwner && (
        <div className="mt-4">
          <button
            onClick={() => goToTab("agent")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm border transition-colors ${
              isOnTabbedShell && activeTab === "agent"
                ? "text-amber-200 bg-amber-500/20 border-amber-500/40"
                : "text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/20"
            }`}
          >
            <Crown size={18} /> Agent Dashboard
          </button>
        </div>
      )}

      {moreItems.some((i) => i.show) && (
        <div className="mt-6 pt-6 border-t border-slate-800">
          <p className="px-4 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">More</p>
          <div className="space-y-1">
            {moreItems.filter((i) => i.show).map(renderButton)}
            {canManageSettings && (
              <button
                onClick={() => router.push("/dashboard/cockpit")}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm text-slate-400 hover:bg-white/5 hover:text-slate-100 transition-colors"
              >
                <Crosshair size={18} /> Executive Cockpit
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-auto pt-6 border-t border-slate-800 space-y-1">
        {/* Ungated - every role gets a self-service profile, unlike Settings below which
            stays owner/admin-only. */}
        <button
          onClick={() => goToTab("profile")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
            isOnTabbedShell && activeTab === "profile" ? "bg-blue-500/15 text-blue-300" : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
          }`}
        >
          <UserCircle size={18} /> My Profile
        </button>
        {/* Bookkeeper keeps only Commissions + My Profile (for their own
            password) - see DashboardSidebarPermissions.isBookkeeper. */}
        {!isBookkeeper && (
          <button
            onClick={() => goToTab("feedback")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
              isOnTabbedShell && activeTab === "feedback" ? "bg-purple-500/15 text-purple-300" : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <MessageSquare size={18} /> Community Board
          </button>
        )}
        {/* A real Next.js <Link> (client-side nav, no new tab/window), not a
            setActiveTab call - Help & FAQ is its own route (/dashboard/help),
            not one of app/dashboard/page.tsx's SPA tabs. Still highlighted
            like every button above via pathname rather than activeTab, and
            still keeps this whole sidebar mounted around it - see
            app/dashboard/layout.tsx's `isShellRoute` for why that's true here
            but not for e.g. Executive Cockpit below. */}
        {!isBookkeeper && (
          <Link
            href="/dashboard/help"
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
              pathname === "/dashboard/help" ? "bg-blue-500/15 text-blue-300" : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <LifeBuoy size={18} /> Help &amp; FAQ
          </Link>
        )}
        {/* Pinned dead-last, below even Community Board/Help & FAQ — an
            occasional-use destination, not a daily-driver tab. Team roster
            management lives inside it (Team Management section) rather than
            as its own top-level nav item. */}
        {canManageSettings && (
          <button
            onClick={() => goToTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
              isOnTabbedShell && activeTab === "settings" ? "bg-blue-500/15 text-blue-300" : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Settings size={18} /> Settings
          </button>
        )}
      </div>
    </nav>
  );
}
