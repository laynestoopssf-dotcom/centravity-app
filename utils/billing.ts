// =============================================================================
// Shared Beta Conversion Gate logic — pure, isomorphic (no "server-only" /
// "use client" import, no secrets touched), so the exact same lock rule runs
// in app/dashboard/layout.tsx (client component, drives the "Beta Complete"
// paywall modal) as could ever be reused server-side later. Keeping this in
// one place means the UI's lockout decision can never drift from any other
// consumer's idea of "is this agency locked."
// =============================================================================

export interface AgencyBetaFields {
  beta_expires_at?: string | null;
  subscription_status?: string | null;
}

// An agency is locked out of the dashboard once its beta period has ended
// AND it hasn't converted to a paid, active subscription. `beta_expires_at`
// being NULL (the default for every agency — see the
// 20260828000000_add_beta_billing_columns.sql migration) means "no beta
// expiration has been set," which always resolves to NOT locked — locking
// someone out is an explicit, opt-in action (setting a date on their
// agencies row), never an accidental side effect of this column merely
// existing.
export function isBetaAccessLocked(agency: AgencyBetaFields | null | undefined): boolean {
  if (!agency?.beta_expires_at) return false;

  const expiresAt = new Date(agency.beta_expires_at).getTime();
  if (Number.isNaN(expiresAt)) return false;

  const isExpired = expiresAt <= Date.now();
  const isActiveSubscriber = agency.subscription_status === "active";
  return isExpired && !isActiveSubscriber;
}
