"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3,
  Users,
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
  // app/dashboard/agent/page.tsx for why the Agent Dashboard is the one
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
// The four items the "Agent View" spec calls out by name — Dashboard, Team,
// Commissions, Settings — get their own visually separated primary group up
// top; every other existing tab (Performance, Ledger, Reports, Weekly Rank,
// Agency MTD, Life, Executive Cockpit) is preserved underneath a "More"
// divider rather than dropped, per the "keep everything working" call.
// Community Board stays pinned to the bottom, same as before. The standalone
// YTD Projections and Revenue & Variable Comp tabs have been retired in favor
// of the merged, owner-only "Agent Dashboard" entry above (/dashboard/agent).
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

  // "Team" deep-links into SettingsTab's own Team Management section (see
  // the 'team' branch of the settings render in app/dashboard/page.tsx) —
  // there's no separate roster feature to build, that's the existing one.
  // Same owner-only gate as the rest of Settings, since roster management
  // always has been.
  const primaryItems: NavItem[] = [
    {
      tab: "dashboard",
      label: canViewAgencyDash ? "Team Scoreboard" : "My Scoreboard",
      icon: BarChart3,
      show: true,
    },
    { tab: "team", label: "Team", icon: Users, show: canManageSettings },
    {
      tab: "commission",
      label: canViewTeamComm ? "Team Commissions" : "My Commissions",
      icon: Wallet,
      show: true,
    },
    { tab: "settings", label: "Settings", icon: Settings, show: canManageSettings },
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
          Projections + Revenue & Variable Comp tabs into one route. Deliberately
          NOT gated by canManageSettings/isOwnerLevelRole like everything else
          here — strictly the literal agency owner (see DashboardSidebarPermissions
          and app/dashboard/agent/page.tsx's header comment). Its own visually
          distinct group (not folded into "More") so it reads as the special,
          owner-exclusive destination it is. */}
      {isOwner && (
        <div className="mt-4">
          <button
            onClick={() => router.push("/dashboard/agent")}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 transition-colors"
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
      </div>
    </nav>
  );
}
