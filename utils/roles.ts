// =============================================================================
// Shared role-tier helpers.
// -----------------------------------------------------------------------------
// `profiles.role` is a free-text column (no DB-level enum backs it), holding
// 'owner' (the agency creator, exactly one per agency — see
// app/actions/onboarding.ts's saveStep1Foundation), 'manager', 'producer',
// 'service', or 'admin' (all four selectable when inviting a team member —
// see TeamMemberRole/ROLE_ID_MAP in app/actions/onboarding.ts).
//
// An agency can also override any non-owner role's permissions via
// agencies.custom_roles (a per-agency JSON column — see the role management
// UI in components/SettingsTab.tsx and DEFAULT_ROLES there for the built-in
// fallback set). These two helpers are only the LAST-RESORT fallback used
// when no custom_roles entry matches a given role id, exactly like every
// `userRoleConfig?.permissions?.xxx ?? isOwnerLevelRole(...)` check
// throughout the app already does — a custom role can still grant a
// 'producer' elevated access, or take it away from a 'manager'; these
// helpers just define what happens absent that.
//
// 'admin' is treated as fully owner-equivalent by isOwnerLevelRole() — every
// permission gate in the app (nav visibility, Settings/Team access, data
// prefetching, etc.) should route through one of these two helpers rather
// than re-deriving its own `role === 'owner'` check, so admin's access
// stays consistent everywhere. A gate that showed a nav link to admins but
// then refused to render anything behind it would just trade "clicks an
// unauthorized link" for "clicks an authorized-looking link that renders
// nothing" — exactly the flicker/dead-end this exists to avoid.
//
// EXCEPTION — Stripe billing (resolveBillingContext in
// app/actions/stripeAdmin.ts, and canManageBilling in SettingsTab.tsx) is
// deliberately its own, narrower, hardcoded `role === 'owner'` check with no
// custom_roles override and no 'admin' inclusion — changing a subscription
// is scoped to the literal agency owner on purpose. Do not route billing
// through isOwnerLevelRole().
// =============================================================================

export function isOwnerLevelRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function isManagerLevelRole(role: string | null | undefined): boolean {
  return isOwnerLevelRole(role) || role === "manager";
}
