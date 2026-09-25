"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";

// =============================================================================
// Dark Mode toggle — a standard light/dark switch, not a plain icon button.
// -----------------------------------------------------------------------------
// Lives in DashboardTopHeader.tsx, right beside the signed-in user's profile
// info/Log Out button — the persistent shell's one existing home for
// account-level actions (see that file), so it's visible from every tab.
//
// Reads/writes `resolvedTheme` (not `theme`) from next-themes: `theme` can be
// the literal string "system", which tells you nothing about which side the
// switch should currently show. `resolvedTheme` is next-themes' own resolution
// of "system" against the OS's actual current preference, so this always
// reflects the theme really being rendered.
//
// The `mounted` guard exists because next-themes can only know the real
// stored/system theme client-side, after hydration (localStorage + matchMedia
// aren't available during SSR) — rendering based on resolvedTheme before that
// would either mismatch the server render or flash the wrong side of the
// switch for a frame. A neutral, identically-sized placeholder avoids both.
// =============================================================================
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Toggle theme"}
      title={mounted ? `Switch to ${isDark ? "light" : "dark"} mode` : "Toggle theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`relative inline-flex h-7 w-14 shrink-0 items-center rounded-full border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-slate-900 ${
        isDark ? "border-slate-600 bg-slate-700" : "border-slate-600 bg-slate-800"
      }`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full bg-white text-slate-700 shadow transition-transform duration-200 ${
          isDark ? "translate-x-[1.6rem]" : "translate-x-1"
        }`}
      >
        {isDark ? <Moon size={12} aria-hidden /> : <Sun size={12} aria-hidden />}
      </span>
    </button>
  );
}
