"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  const {
    canViewAgencyDash,
    canViewTeamComm,
    canManageSettings,
    canViewWeeklyRank,
    canViewAgencyMtd,
    canViewLifeModule,
    canViewReports,
    isOwner,
  } = permissions;

  const primaryItems: NavItem[] = [
    {
      tab: "dashboard",
      label: canViewAgencyDash ? "Team Scoreboard" : "My Scoreboard",
      icon: BarChart3,
      show: true,
    },
    {
      tab: "commission",
      label: canViewTeamComm ? "Team Commissions" : "My Commissions",
      icon: Wallet,
      show: true,
    },
  ];

  const moreItems: NavItem[] = [
    {
      tab: "performance",
      label: canViewAgencyDash ? "Team Performance" : "My Performance",
      icon: Award,
      show: true,
    },
    { tab: "ledger", label: "Data Ledger", icon: BookOpen, show: true },
    { tab: "reports", label: "Reports", icon: FileBarChart, show: canViewReports },
    { tab: "weekly", label: "Weekly Rank", icon: CalendarDays, show: canViewWeeklyRank },
    { tab: "agency", label: "Agency MTD", icon: Briefcase, show: canViewAgencyMtd },
    { tab: "life", label: "Life Module", icon: HeartPulse, show: canViewLifeModule },
  ];

  const renderButton = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = activeTab === item.tab;
    return (
      <button
        key={item.tab}
        onClick={() => setActiveTab(item.tab)}
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
            onClick={() => setActiveTab("agent")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm border transition-colors ${
              activeTab === "agent"
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
        <button
          onClick={() => setActiveTab("feedback")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
            activeTab === "feedback" ? "bg-purple-500/15 text-purple-300" : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
          }`}
        >
          <MessageSquare size={18} /> Community Board
        </button>
        <button
          onClick={() => router.push("/dashboard/help")}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm text-slate-500 hover:text-slate-200 hover:bg-white/5 transition-colors"
        >
          <LifeBuoy size={18} /> Help &amp; FAQ
        </button>
        {/* Pinned dead-last, below even Community Board/Help & FAQ — an
            occasional-use destination, not a daily-driver tab. Team roster
            management lives inside it (Team Management section) rather than
            as its own top-level nav item. */}
        {canManageSettings && (
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
              activeTab === "settings" ? "bg-blue-500/15 text-blue-300" : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <Settings size={18} /> Settings
          </button>
        )}
      </div>
    </nav>
  );
}
