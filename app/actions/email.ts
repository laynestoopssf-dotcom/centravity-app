import "server-only";
import { Resend } from "resend";

// =============================================================================
// Shared transactional email sender (server-only). Deliberately NOT marked
// "use server" — same reasoning as supabaseAdmin.ts: a "use server" file's
// entire export surface becomes a Server Function reference boundary, which
// only wants async functions callable directly from the client. This is a
// plain module imported by Server Actions (e.g. onboarding.ts's
// saveStep1Foundation), never called directly from client code.
//
// LAZY CLIENT — same load-bearing reason as supabaseAdmin.ts and
// app/actions/coaching.ts's OpenAI client: `new Resend(key)` doesn't itself
// throw on a missing key, but every call this module makes is wrapped so a
// misconfigured environment always surfaces as a normal caught
// { success: false, error } instead of an uncaught exception crossing the
// Server Action boundary (which Next.js redacts to a generic "An error
// occurred in the Server Components render" in production).
// =============================================================================

let cachedResend: Resend | null = null;

function getResend(): Resend {
  if (cachedResend) return cachedResend;

  const apiKey = process.env.RESEND_API_KEY || "";
  if (!apiKey) {
    console.error("[email] missing RESEND_API_KEY");
    throw new Error("Email service is misconfigured: missing RESEND_API_KEY.");
  }

  cachedResend = new Resend(apiKey);
  return cachedResend;
}

// Resend requires `from` to be on a domain you've verified in their
// dashboard — falls back to Resend's own sandbox sender so a fresh
// deployment without RESEND_FROM_EMAIL set yet still sends (to Resend's test
// inbox only) instead of throwing, but you'll want to set this for real
// deliverability to actual users.
function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || "Centravity <onboarding@resend.dev>";
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

// Called from saveStep1Foundation (app/actions/onboarding.ts) the moment a
// brand-new `agencies` row is created — i.e. once, per agency, the instant
// signup is "real" (has a name, not just a bare auth.users row). Deliberately
// takes plain fields rather than a whole payload object so this stays easy to
// call from anywhere else a "new agency" event might someday exist (e.g. the
// Join Team flow could eventually get its own producer-welcome variant).
export async function sendBetaWelcomeEmail({
  toEmail,
  ownerName,
  agencyName,
}: {
  toEmail: string;
  ownerName: string;
  agencyName: string;
}): Promise<SendEmailResult> {
  try {
    if (!toEmail) {
      return { success: false, error: "Missing recipient email." };
    }

    const resend = getResend();
    const firstName = (ownerName || "").trim().split(/\s+/)[0] || "there";
    const safeAgencyName = agencyName?.trim() || "your agency";

    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: toEmail,
      subject: `Welcome to Centravity, ${firstName}!`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
          <h1 style="font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 4px;">Welcome to Centravity, ${firstName}.</h1>
          <p style="font-size: 15px; line-height: 1.6; color: #475569;">
            ${safeAgencyName} is officially set up. You're in the beta group helping us shape the platform before general availability — thank you for being one of the first agencies on board.
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #475569;">
            Next step: finish the onboarding wizard to add your team and set your production baselines — the dashboard, Revenue &amp; VC tracking, and the Executive Cockpit all key off that data.
          </p>
          <p style="font-size: 15px; line-height: 1.6; color: #475569; margin-top: 24px;">
            Questions or feedback? Just reply to this email — a real person reads every one during beta.
          </p>
        </div>
      `,
      text: `Welcome to Centravity, ${firstName}.\n\n${safeAgencyName} is officially set up. You're in the beta group helping us shape the platform before general availability — thank you for being one of the first agencies on board.\n\nNext step: finish the onboarding wizard to add your team and set your production baselines.\n\nQuestions or feedback? Just reply to this email.`,
    });

    if (error) {
      console.error("[email] sendBetaWelcomeEmail failed", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: unknown) {
    console.error("[email] sendBetaWelcomeEmail threw", err);
    const message = err instanceof Error ? err.message : "Unexpected error sending welcome email.";
    return { success: false, error: message };
  }
}
