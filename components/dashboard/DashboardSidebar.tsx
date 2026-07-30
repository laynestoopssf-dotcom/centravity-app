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
  Mountain,
  DollarSign,
  Crosshair,
  MessageSquare,
} from "lucide-react";
import { useDashboardTab, type DashboardTabId } from "./DashboardShellContext";

export interface DashboardSidebarPermissions {
  canViewAgencyDash: boolean;
  canViewTeamComm: boolean;
  canManageSettings: boolean;
  canViewWeeklyRank: boolean;
  canViewAgencyMtd: boolean;
  canViewLifeModule: boolean;
  canViewYtdProjections: boolean;
  canViewRevenueVc: boolean;
  canViewReports: boolean;
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
// Agency MTD, Life, YTD, Revenue & VC, Executive Cockpit) is preserved
// underneath a "More" divider rather than dropped, per the "keep everything
// working" call. Community Board stays pinned to the bottom, same as before.
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
    canViewYtdProjections,
    canViewRevenueVc,
    canViewReports,
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
    { tab: "ytd", label: "YTD Projections", icon: Mountain, show: canViewYtdProjections },
    { tab: "revenue", label: "Revenue & VC", icon: DollarSign, show: canViewRevenueVc },
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

      {moreItems.some((i) => i.show) && (
        <div className="mt-6 pt-6 border-t border-slate-800">
          <p className="px-4 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">More</p>
          <div className="space-y-1">
            {moreItems.filter((i) => i.show).map(renderButton)}
            {canViewRevenueVc && (
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

      <div className="mt-auto pt-6 border-t border-slate-800">
        <button
          onClick={() => setActiveTab("feedback")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium text-sm transition-colors ${
            activeTab === "feedback" ? "bg-purple-500/15 text-purple-300" : "text-slate-500 hover:text-slate-200 hover:bg-white/5"
          }`}
        >
          <MessageSquare size={18} /> Community Board
        </button>
      </div>
    </nav>
  );
}
