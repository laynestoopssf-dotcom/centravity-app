import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import PostHogProvider from "./providers/PostHogProvider";
import ThemeProvider from "./providers/ThemeProvider";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../utils/supabaseEnv";

export const dynamic = 'force-dynamic'; 

export const viewport = {
  themeColor: "#2563eb",
};

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Centravity — The Ultimate Scoreboard for Insurance Agencies",
  description:
    "Centravity automates multi-line commission math and turns agency data into real-time, role-gated leaderboards that drive revenue.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Centravity",
  },
};

// Resolves the signed-in user's id (or undefined when signed out) so ThemeProvider can key the
// stored theme per user - see app/providers/ThemeProvider.tsx. This ONLY picks a localStorage
// key name (never an authorization decision), so it reads the verified JWT claims from the auth
// cookies via getClaims() instead of a getUser() round-trip on every render.
//
// Read-only on purpose: setAll() is a no-op. proxy.ts already runs getUser() on every request
// ahead of this layout and forwards any refreshed session cookies onto the request, so by the
// time this runs the token is fresh and nothing here ever needs to (or should) rotate it - a
// second refresh from here would burn the single-use refresh token without the browser ever
// receiving the replacement (the exact loop documented in proxy.ts). Any failure falls back to
// undefined, i.e. the shared "theme" key, so the layout can never fail to render over this.
async function getThemeUserId(): Promise<string | undefined> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    });
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return typeof sub === "string" && sub ? sub : undefined;
  } catch {
    return undefined;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const userId = await getThemeUserId();
  return (
    // suppressHydrationWarning is required by next-themes: it applies the resolved
    // theme's `dark` class to this element via a pre-hydration inline script, so the
    // class React sees on hydration intentionally differs from the server-rendered
    // markup. Only suppresses the warning on this one element's attributes, not any
    // of its children's actual content.
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className={`${inter.className} min-h-full flex flex-col bg-background text-foreground`}>
        <ThemeProvider userId={userId}>
          <PostHogProvider>{children}</PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
