"use client";

import React from "react";
import { User } from "lucide-react";

const SIZE_CLASSES: Record<"xs" | "sm" | "md" | "lg" | "xl", string> = {
  xs: "w-6 h-6 text-[9px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-16 h-16 text-lg",
  xl: "w-24 h-24 text-2xl",
};

// Stable per-person color so the same producer always gets the same initials-circle color across
// every table/card they show up in (Scoreboard, Ledger, Commission, header) instead of a random
// one on every render.
const PALETTE = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-indigo-100 text-indigo-700",
  "bg-cyan-100 text-cyan-700",
  "bg-fuchsia-100 text-fuchsia-700",
];

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function ProfileAvatar({
  src,
  name,
  size = "md",
  stealth = false,
  className = "",
}: {
  src?: string | null;
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  /** Leaderboard Stealth Mode is active for this viewer - never render a real photo, even if one exists. */
  stealth?: boolean;
  className?: string;
}) {
  const sizeClass = SIZE_CLASSES[size];

  if (stealth) {
    return (
      <div className={`shrink-0 rounded-full flex items-center justify-center bg-gray-200 text-gray-400 font-bold ${sizeClass} ${className}`}>
        <User size={size === "xs" || size === "sm" ? 12 : 18} />
      </div>
    );
  }

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatar URLs are arbitrary Supabase Storage public URLs, not known at build time.
      <img
        src={src}
        alt={name}
        className={`shrink-0 rounded-full object-cover bg-gray-100 ${sizeClass} ${className}`}
      />
    );
  }

  return (
    <div className={`shrink-0 rounded-full flex items-center justify-center font-bold ${colorFor(name || "?")} ${sizeClass} ${className}`}>
      {initialsOf(name || "?")}
    </div>
  );
}
