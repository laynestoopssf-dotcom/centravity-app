"use client";

import React, { useState } from "react";
import { Building2, LogOut, Loader2 } from "lucide-react";
import { supabase } from "../../utils/supabase";

export interface DashboardShellUser {
  firstName: string;
  lastName: string;
  email: string;
  agencyName: string;
}

// Persistent top bar for the /dashboard app shell — shows who's signed in and
// which agency they're in, with the one working "sign out and go home"
// action the spec asked for. Deliberately its own tiny component (not folded
// into DashboardSidebar) since the ask calls it out as a distinct piece of
// the shell, separate from nav.
export default function DashboardTopHeader({ user }: { user: DashboardShellUser }) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      // Hard navigation, not next/navigation's router — proxy.ts re-validates
      // sessions from request cookies server-side, and an SPA transition here
      // can race the just-cleared auth cookie. Same reasoning as every other
      // auth-boundary redirect in this app (see app/page.tsx, app/onboarding/page.tsx).
      window.location.href = "/";
    }
  };

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();

  return (
    <header className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-900 px-6 py-3.5">
      <div className="flex items-center gap-2 min-w-0 text-slate-300">
        <Building2 size={16} className="shrink-0 text-slate-500" aria-hidden />
        <span className="truncate text-sm font-semibold">{user.agencyName || "Your Agency"}</span>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="text-right leading-tight hidden sm:block">
          <p className="text-sm font-semibold text-white truncate max-w-[220px]">{fullName || "—"}</p>
          <p className="text-xs text-slate-500 truncate max-w-[220px]">{user.email}</p>
        </div>
        <button
          onClick={handleLogout}
          disabled={isSigningOut}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
        >
          {isSigningOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
          {isSigningOut ? "Signing out…" : "Log Out"}
        </button>
      </div>
    </header>
  );
}
