"use client";

import React from "react";
import { QUOTE_ORIGIN_OPTIONS, isQuoteOrigin, type QuoteOrigin } from "../../utils/quoteOrigin";

// Compact dropdown version of the Quote/Bound "Origin" toggle in LogActivityModal, for the quick
// status-change paths that don't open the modal (Pipeline's inline "Save Bound", Life tab's
// "Mark Bound"). Same three options as the modal; value is "" until the user actively picks one.
export default function OriginSelect({
  value,
  onChange,
  className = "",
}: {
  value: QuoteOrigin | "";
  onChange: (next: QuoteOrigin | "") => void;
  className?: string;
}) {
  return (
    <select
      aria-label="Origin"
      value={value}
      onChange={(e) => onChange(isQuoteOrigin(e.target.value) ? e.target.value : "")}
      className={`p-1.5 border border-gray-300 rounded text-xs font-bold outline-none bg-white text-gray-700 focus:ring-2 focus:ring-blue-600 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200 ${className}`}
    >
      <option value="">Origin…</option>
      {QUOTE_ORIGIN_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.emoji} {opt.label}
        </option>
      ))}
    </select>
  );
}
