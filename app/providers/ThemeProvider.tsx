"use client";

import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

// =============================================================================
// Dark Mode — theme state provider.
// -----------------------------------------------------------------------------
// Thin wrapper around next-themes (same pattern as app/providers/PostHogProvider.tsx
// — a dedicated client-component wrapper around a third-party provider, kept out
// of the server-component root layout).
//
//   attribute="class"    — next-themes toggles a literal `dark` class on <html>
//                           rather than a `data-theme` attribute. Tailwind CSS v4
//                           has no tailwind.config.ts in this project (it's on
//                           v4's CSS-first config — see app/globals.css), so
//                           there's no `darkMode: 'class'` option to set; the v4
//                           equivalent is the `@custom-variant dark (&:where(.dark,
//                           .dark *));` override in app/globals.css, which makes
//                           every `dark:` utility key off this exact class instead
//                           of the OS-level `prefers-color-scheme` media query v4
//                           uses by default.
//   defaultTheme="system" — brand-new users (no stored preference yet) get
//                           whatever their OS is set to, not a hardcoded light/dark.
//   enableSystem           — keeps "system" as a real, selectable option (not just
//                           the initial default) so a user can explicitly opt back
//                           into following their OS instead of a manual light/dark
//                           override — see components/ui/ThemeToggle.tsx.
//
// next-themes persists whatever the user picks to localStorage itself and injects
// a tiny blocking inline script (via its own internals) that applies the class
// before first paint, which is why <html> in app/layout.tsx needs
// suppressHydrationWarning — the class it sets there is expected to differ from
// whatever the server rendered, and that mismatch is intentional/safe.
// =============================================================================
export default function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
