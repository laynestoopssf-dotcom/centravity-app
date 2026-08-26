"use client";

import React, { useEffect, useState } from "react";

// =============================================================================
// Extracted from OnboardingWizard.tsx (where it was a local, non-exported component
// used only for the three onboarding premium fields) so every other dollar-value input
// site in the app (Settings, Logger, Ledger, Cockpit, Commission bonus modal) can share
// the exact same comma-formatting behavior instead of falling back to bare `type="number"`,
// which browsers render with no thousands separators at all.
//
// Native `<input type="number">` cannot display "10,000" - it only ever shows "10000" - so
// this is deliberately a styled `type="text"` input: raw digits while focused (so typing/
// caret position/paste isn't fighting live comma insertion), formatted with a `$` prefix and
// commas on blur.
// =============================================================================

export default function FormattedNumberInput({
  value,
  onChange,
  placeholder,
  className,
  prefix = "$",
  allowDecimal = false,
  disabled,
  id,
}: {
  value: number | "";
  onChange: (value: number | "") => void;
  placeholder?: string;
  className?: string;
  /** Set to "" for non-dollar counts that still want comma grouping (e.g. credit thresholds). */
  prefix?: string;
  allowDecimal?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  const [isFocused, setIsFocused] = useState(false);
  const [rawText, setRawText] = useState<string>(value === "" ? "" : String(value));

  // Keeps the edit buffer in sync with externally-driven changes (e.g. hydrating saved
  // settings/onboarding state) as long as the user isn't actively typing in this exact field.
  useEffect(() => {
    if (!isFocused) setRawText(value === "" ? "" : String(value));
  }, [value, isFocused]);

  const displayValue = isFocused
    ? rawText
    : value === ""
      ? ""
      : `${prefix}${Number(value).toLocaleString("en-US")}`;

  return (
    <input
      id={id}
      type="text"
      inputMode={allowDecimal ? "decimal" : "numeric"}
      value={displayValue}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onChange={(e) => {
        const cleaned = allowDecimal
          ? e.target.value.replace(/[^0-9.]/g, "")
          : e.target.value.replace(/[^0-9]/g, "");
        setRawText(cleaned);
        onChange(cleaned === "" ? "" : Number(cleaned));
      }}
    />
  );
}
