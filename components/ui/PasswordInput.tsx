"use client";

import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// =============================================================================
// Standard "view password" toggle - a plain <input type="password"> wrapped so
// the eye icon flips it to type="text" and back, rather than duplicating the
// same useState+absolutely-positioned-button boilerplate at every login/signup
// password field. Deliberately unstyled beyond positioning the icon button —
// callers pass their own `className` (applied to the <input>, same as if this
// were a plain input) plus an optional `iconClassName` so the icon's color
// matches each form's own theme (e.g. the dark login page vs. light onboarding
// forms). Callers should reserve right-side padding (e.g. `pr-10`) in the
// className they pass in so field text never renders under the icon.
// =============================================================================
interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  wrapperClassName?: string;
  iconClassName?: string;
}

export default function PasswordInput({
  className = "",
  wrapperClassName = "",
  iconClassName = "text-gray-400 hover:text-gray-600",
  ...rest
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input {...rest} type={visible ? "text" : "password"} className={className} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        className={`absolute inset-y-0 right-0 flex items-center px-3 transition-colors ${iconClassName}`}
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}
