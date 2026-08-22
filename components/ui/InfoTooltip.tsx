"use client";

import React, { useState } from "react";
import { HelpCircle } from "lucide-react";

// =============================================================================
// Small "(?)" affordance for contextual help next to complex inputs/labels
// (Cockpit sliders, Settings comp-plan fields, the Log Activity modal, etc.).
// Hover OR focus/tap reveals a floating tooltip - focus is included so this is
// reachable via keyboard and on touch devices that don't have a hover state.
// Self-contained (dark bubble, light text) so it reads correctly whether the
// parent surface is a light card (Settings) or a dark panel (Cockpit).
// =============================================================================

type TooltipPosition = "top" | "bottom";

export default function InfoTooltip({
  text,
  position = "top",
  className = "",
}: {
  text: string;
  position?: TooltipPosition;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Never lets this bubble into a surrounding <label>/form control's own click
          // behavior - this is purely an info affordance, not a submit/toggle trigger.
          e.preventDefault();
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-label={text}
        className="inline-flex items-center justify-center text-gray-400 hover:text-blue-500 focus:text-blue-500 outline-none transition-colors"
      >
        <HelpCircle size={13} strokeWidth={2.5} />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute z-[100] w-56 rounded-lg bg-gray-900 px-3 py-2 text-[11px] font-medium leading-snug text-white shadow-xl pointer-events-none left-1/2 -translate-x-1/2 ${
            position === "top" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
