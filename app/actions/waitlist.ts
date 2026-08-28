"use server";

import { supabaseAdmin } from "./supabaseAdmin";
import type { JoinWaitlistResult, VerifyWaitlistInviteResult } from "./waitlist.types";

// =============================================================================
// Server Action: verify a waitlist invite token ("Token Catcher")
// -----------------------------------------------------------------------------
// Consumed by app/signup/page.tsx — the landing spot for the invite link an
// admin's waitlist-approval email sends out (?token=...). That email/approval
// flow lives outside this Next.js app (no matching code in this repo), but
// the `public.waitlist` table it writes to is the same live Supabase project
// this app talks to, with columns: id, email, first_name, last_name,
// agency_name, status, created_at, invite_token.
//
// Runs on the server so this can use the service-role client: `waitlist`
// holds PII (name/email) for people who don't have an account yet, so there's
// no authenticated caller to scope an RLS policy to here the way every other
// Server Action in this app can (they all re-derive the caller's identity via
// supabaseAdmin.auth.getUser(accessToken) first). A token match against a
// single row is the only "auth" this lookup has, which is exactly why it
// must never be exposed as a public anon-key RLS-gated read on the client —
// keeping it server-side/service-role means the whole `waitlist` table stays
// unreachable from the browser regardless of RLS.
//
// SECURITY: deliberately returns the same generic "Invalid or expired invite
// link." message whether the token doesn't exist at all vs. exists but isn't
// approved yet, rather than distinguishing the two — no reason to confirm to
// an unauthenticated caller that a given token/email is real but pending.
// =============================================================================
export async function verifyWaitlistInvite(token: string): Promise<VerifyWaitlistInviteResult> {
  try {
    const trimmed = (token || "").trim();
    if (!trimmed) {
      return { valid: false, error: "This invite link is missing its token." };
    }

    const { data, error } = await supabaseAdmin
      .from("waitlist")
      .select("email, first_name, last_name, agency_name, status")
      .eq("invite_token", trimmed)
      .maybeSingle();

    if (error) {
      console.error("[waitlist] invite lookup failed", error);
      return { valid: false, error: "Something went wrong validating your invite. Please try again." };
    }

    if (!data || data.status !== "approved" || !data.email) {
      return { valid: false, error: "Invalid or expired invite link." };
    }

    return {
      valid: true,
      email: data.email as string,
      firstName: (data.first_name as string) || "",
      lastName: (data.last_name as string) || "",
      agencyName: (data.agency_name as string) || "",
    };
  } catch (err: any) {
    console.error("[waitlist] unexpected error verifying invite", err);
    return { valid: false, error: err?.message || "Unexpected server error." };
  }
}

// =============================================================================
// Server Action: public "Join Waitlist" submission
// -----------------------------------------------------------------------------
// Consumed by "/"'s "Create Agency" tab, which is currently locked down to a
// capacity message + this single email field while new-agency registration is
// paused. Runs server-side for the exact same reason verifyWaitlistInvite
// above does: `waitlist` has RLS enabled with no anon-facing policies at all
// (confirmed live — anon insert returns 42501), so the ONLY way anything
// unauthenticated can ever add a row is through a Server Action using the
// service-role client. Do not add a public INSERT RLS policy as a shortcut
// around this — that would let anyone enumerate/spam the table directly from
// the browser with the anon key, bypassing whatever validation lives here.
//
// Only ever writes `email` — first_name/last_name/agency_name/status all take
// their column defaults ('' / '' / '' / 'pending'), and invite_token stays
// NULL until an admin approves this row through the separate, external
// approval tool this table already integrates with (see this file's header
// comment). That approval flow is what eventually sends the invite email
// that lands someone on app/signup/page.tsx.
// =============================================================================
export async function joinWaitlist(rawEmail: string): Promise<JoinWaitlistResult> {
  try {
    const email = (rawEmail || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: "Please enter a valid email address." };
    }

    const { error } = await supabaseAdmin.from("waitlist").insert({ email });

    if (error) {
      // 23505 = unique_violation on waitlist_email_unique — this email is
      // already on the list. Treated as success (not surfaced as an error)
      // so the UI shows the same confirmation either way, rather than
      // leaking to an anonymous caller whether a given email already signed up.
      if (error.code === "23505") {
        return { success: true, alreadyOnList: true };
      }
      console.error("[waitlist] joinWaitlist insert failed", error);
      return { success: false, error: "Something went wrong. Please try again." };
    }

    return { success: true };
  } catch (err: any) {
    console.error("[waitlist] joinWaitlist unexpected error", err);
    return { success: false, error: err?.message || "Unexpected server error." };
  }
}
