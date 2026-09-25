import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import PostHogProvider from "./providers/PostHogProvider";
import ThemeProvider from "./providers/ThemeProvider";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning is required by next-themes: it applies the resolved
    // theme's `dark` class to this element via a pre-hydration inline script, so the
    // class React sees on hydration intentionally differs from the server-rendered
    // markup. Only suppresses the warning on this one element's attributes, not any
    // of its children's actual content.
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className={`${inter.className} min-h-full flex flex-col bg-background text-foreground`}>
        <ThemeProvider>
          <PostHogProvider>{children}</PostHogProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
