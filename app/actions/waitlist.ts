"use server";

import { supabaseAdmin } from "./supabaseAdmin";
import type { VerifyWaitlistInviteResult } from "./waitlist.types";

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
