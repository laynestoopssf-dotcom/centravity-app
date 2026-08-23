"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../../utils/supabase";
import { isOwnerLevelRole, isManagerLevelRole } from "../../utils/roles";
import { DashboardShellContext, type DashboardTabId } from "../../components/dashboard/DashboardShellContext";
import DashboardSidebar, { type DashboardSidebarPermissions } from "../../components/dashboard/DashboardSidebar";
import DashboardTopHeader, { type DashboardShellUser } from "../../components/dashboard/DashboardTopHeader";

// =============================================================================
// Persistent App Shell for everything under /dashboard.
// -----------------------------------------------------------------------------
// This physically wraps THREE routes: /dashboard itself (the tab-based "Agent
// View", still app/dashboard/page.tsx), /dashboard/reveal (the one-time
// post-onboarding welcome page), and /dashboard/cockpit (the full-bleed
// Executive Cockpit). Only the first of those wants this shell's dark
// sidebar/header wrapped around it — reveal and cockpit are deliberately
// full-screen, self-contained experiences with their own chrome. So this
// renders bare `{children}` for any path other than exactly "/dashboard",
// and also renders bare `{children}` on "/dashboard" itself until its own
// independent session/profile/agency fetch below actually resolves to a real
// signed-in, onboarded user — that keeps this shell out of the way of
// app/dashboard/page.tsx's OWN fallback states (dead session, profile load
// error, or its legacy inline login form), none of which should ever get a
// "Sign Out" button wrapped around them.
//
// Deliberately does its OWN lightweight fetch here rather than reaching into
// app/dashboard/page.tsx's state — a layout physically can't read a child
// page's local state (wrong direction in the tree), and every other route
// under /dashboard already fetches its own header-ish data independently
// (see app/dashboard/reveal/page.tsx, app/dashboard/cockpit/page.tsx). The
// one piece of state that DOES need to be shared downward — which tab is
// active — is lifted up into DashboardShellContext instead; see that file's
// header comment for why.
// =============================================================================

const emptyPermissions: DashboardSidebarPermissions = {
  canViewAgencyDash: false,
  canViewTeamComm: false,
  canManageSettings: false,
  canViewWeeklyRank: false,
  canViewAgencyMtd: false,
  canViewLifeModule: false,
  canViewReports: false,
  isOwner: false,
};

interface ShellData {
  user: DashboardShellUser;
  permissions: DashboardSidebarPermissions;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isShellRoute = pathname === "/dashboard";

  const [activeTab, setActiveTab] = useState<DashboardTabId>("dashboard");
  const [shellData, setShellData] = useState<ShellData | null>(null);

  useEffect(() => {
    if (!isShellRoute) return;
    let mounted = true;

    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!mounted || !user?.id) return;

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("first_name, last_name, role, agency_id")
        .eq("id", user.id)
        .maybeSingle();

      if (!mounted || !profileRow?.agency_id) return;

      const { data: agencyRow } = await supabase
        .from("agencies")
        .select("name, custom_roles")
        .eq("id", profileRow.agency_id)
        .maybeSingle();

      if (!mounted) return;

      // Mirrors app/dashboard/page.tsx's own permission derivation exactly
      // (userRoleConfig lookup + fallbacks) — see that file if this ever
      // needs to change, and change both together.
      const roleConfig = (agencyRow?.custom_roles as { id: string; permissions?: Record<string, boolean> }[] | null)?.find(
        (r) => r.id === profileRow.role
      );
      const isOwnerOrManager = isManagerLevelRole(profileRow.role);
      const isOwnerLevel = isOwnerLevelRole(profileRow.role);
      const canViewAgencyDash = roleConfig?.permissions?.view_agency_dash ?? isOwnerOrManager;
      const canViewTeamComm = roleConfig?.permissions?.view_team_comm ?? isOwnerOrManager;
      const canManageSettings = roleConfig?.permissions?.manage_settings ?? isOwnerLevel;

      setShellData({
        user: {
          firstName: profileRow.first_name || "",
          lastName: profileRow.last_name || "",
          email: user.email || "",
          agencyName: (agencyRow?.name as string) || "",
        },
        permissions: {
          canViewAgencyDash,
          canViewTeamComm,
          canManageSettings,
          canViewWeeklyRank: roleConfig?.permissions?.view_weekly_rank ?? canViewAgencyDash,
          canViewAgencyMtd: roleConfig?.permissions?.view_agency_mtd ?? canViewAgencyDash,
          canViewLifeModule: roleConfig?.permissions?.view_life_module ?? canViewAgencyDash,
          canViewReports: roleConfig?.permissions?.view_reports ?? isOwnerOrManager,
          // Strictly the literal agency owner — no custom_roles override, no
          // 'admin' inclusion. See DashboardSidebarPermissions.isOwner and
          // app/dashboard/agent/page.tsx's header comment for why.
          isOwner: profileRow.role === "owner",
        },
      });
    })();

    return () => {
      mounted = false;
    };
  }, [isShellRoute]);

  // Re-resolve shell data on sign-out/sign-in so this doesn't keep showing a
  // stale agency/name (or the chrome at all) after app/dashboard/page.tsx's
  // own SIGNED_OUT handling drops it back to its login form.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setShellData(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const contextValue = useMemo(() => ({ activeTab, setActiveTab }), [activeTab]);

  if (!isShellRoute || !shellData) {
    return <DashboardShellContext.Provider value={contextValue}>{children}</DashboardShellContext.Provider>;
  }

  return (
    <DashboardShellContext.Provider value={contextValue}>
      <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
        <DashboardSidebar permissions={shellData.permissions || emptyPermissions} />
        <div className="flex-1 flex flex-col min-w-0">
          <DashboardTopHeader user={shellData.user} />
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </DashboardShellContext.Provider>
  );
}
