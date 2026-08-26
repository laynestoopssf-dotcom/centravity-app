"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "../../utils/supabase";
import { isOwnerLevelRole, isManagerLevelRole } from "../../utils/roles";
import { DashboardShellContext, type DashboardTabId } from "../../components/dashboard/DashboardShellContext";
import DashboardSidebar, { type DashboardSidebarPermissions } from "../../components/dashboard/DashboardSidebar";
import DashboardTopHeader, { type DashboardShellUser } from "../../components/dashboard/DashboardTopHeader";
import AiSupportChat from "../../components/dashboard/AiSupportChat";

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
  // Only ever applies the role-based default ONCE per mount of this layout —
  // this effect re-runs any time `isShellRoute` flips (e.g. Cockpit -> back
  // to /dashboard), and without this guard that would silently snap an owner
  // back to the Agent Dashboard tab every time, even after they'd
  // deliberately switched to something else.
  const hasSetDefaultTabRef = React.useRef(false);

  // Extracted from the mount effect below so the "My Profile" tab (a CHILD of this
  // layout, via app/dashboard/page.tsx) can trigger a targeted re-fetch after saving a
  // new name/avatar — otherwise the header (owned up here) would keep showing the
  // stale photo/name until a full reload. Exposed through DashboardShellContext as
  // `refreshShellUser`. Takes no "mounted" guard of its own since callers (the mount
  // effect, and the profile tab's post-save call) are each responsible for only
  // invoking this while still mounted.
  const loadShellData = React.useCallback(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;
    if (!user?.id) return;

    // Explicit column list (unlike app/dashboard/page.tsx's fetchProfile, which uses
    // select('*') and so never errors on a missing column) means a schema drift on
    // `avatar_url` - e.g. the 20260826010000_add_profile_avatars.sql migration not
    // yet applied against this database - turns into a hard PostgREST error here
    // instead of just an empty field. Left unhandled, that silently left `profileRow`
    // null forever, which in turn left `shellData` null forever, which hid the ENTIRE
    // sidebar/top header (both gated on `shellData` below) even though the rest of the
    // dashboard kept working fine off its own separate select('*') fetch - exactly the
    // "sidebar and log out button vanished" regression this comment is here to prevent
    // from happening silently again. Falls back to a request without avatar_url so a
    // missing migration degrades to "no photo" instead of "no shell at all".
    let { data: profileRow, error: profileError } = await supabase
      .from("profiles")
      .select("first_name, last_name, role, agency_id, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("[DashboardLayout] profiles select with avatar_url failed, retrying without it", profileError);
      const fallback = await supabase
        .from("profiles")
        .select("first_name, last_name, role, agency_id")
        .eq("id", user.id)
        .maybeSingle();
      if (fallback.error) {
        console.error("[DashboardLayout] fallback profiles select also failed - shell will stay hidden", fallback.error);
        return;
      }
      profileRow = fallback.data ? { ...fallback.data, avatar_url: null } : null;
    }

    if (!profileRow?.agency_id) return;

    const { data: agencyRow, error: agencyError } = await supabase
      .from("agencies")
      .select("name, custom_roles")
      .eq("id", profileRow.agency_id)
      .maybeSingle();

    if (agencyError) {
      console.error("[DashboardLayout] agencies select failed - shell will stay hidden", agencyError);
      return;
    }

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

    // Owners land on their Agent Dashboard master command center by
    // default; everyone else (Team Members, Managers, etc.) lands on the
    // Team Scoreboard, same as before this tab existed.
    if (!hasSetDefaultTabRef.current) {
      hasSetDefaultTabRef.current = true;
      setActiveTab(profileRow.role === "owner" ? "agent" : "dashboard");
    }

    setShellData({
      user: {
        firstName: profileRow.first_name || "",
        lastName: profileRow.last_name || "",
        email: user.email || "",
        agencyName: (agencyRow?.name as string) || "",
        avatarUrl: (profileRow as { avatar_url?: string | null }).avatar_url || null,
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
        // components/AgentDashboardTab.tsx's header comment for why.
        isOwner: profileRow.role === "owner",
      },
    });
  }, []);

  useEffect(() => {
    if (!isShellRoute) return;
    let mounted = true;
    (async () => {
      if (mounted) await loadShellData();
    })();
    return () => {
      mounted = false;
    };
  }, [isShellRoute, loadShellData]);

  // Re-resolve shell data on sign-out/sign-in so this doesn't keep showing a
  // stale agency/name (or the chrome at all) after app/dashboard/page.tsx's
  // own SIGNED_OUT handling drops it back to its login form.
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setShellData(null);
        hasSetDefaultTabRef.current = false;
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const contextValue = useMemo(
    () => ({ activeTab, setActiveTab, refreshShellUser: loadShellData }),
    [activeTab, loadShellData]
  );

  // Mounted once here (not per-tab in app/dashboard/page.tsx, not per-route)
  // so it persists across every /dashboard/* route without losing its local
  // conversation state — proxy.ts already gates the entire /dashboard/*
  // prefix behind authentication, so no extra session check is needed here.
  // Excluded only from the one-time post-onboarding "/dashboard/reveal"
  // celebration screen, which wants to stay a clean, chrome-free moment.
  const showAiChat = pathname !== "/dashboard/reveal";

  if (!isShellRoute || !shellData) {
    return (
      <DashboardShellContext.Provider value={contextValue}>
        {children}
        {showAiChat && <AiSupportChat />}
      </DashboardShellContext.Provider>
    );
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
      {showAiChat && <AiSupportChat />}
    </DashboardShellContext.Provider>
  );
}
