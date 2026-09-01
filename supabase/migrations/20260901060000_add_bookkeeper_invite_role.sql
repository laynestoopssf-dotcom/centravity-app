-- Adds the new highly-restricted 'bookkeeper' role (Commissions/Agency Payroll
-- access only - see components/dashboard/DashboardSidebar.tsx and
-- app/dashboard/layout.tsx for the UI-side lockout) to agency_invites' role CHECK
-- constraint, so an Owner/Admin can actually invite one via
-- app/actions/teamInvites.ts (VALID_ROLES) + the Settings -> Team Management ->
-- Invite dropdown (components/SettingsTab.tsx).
--
-- profiles.role itself has NO check constraint (confirmed live via
-- `select conname from pg_constraint where conrelid = 'public.profiles'::regclass
-- and contype = 'c'` returning zero rows), so no equivalent change is needed there
-- - 'bookkeeper' is accepted the same way 'service' already is.
--
-- Safe to run multiple times.
--
-- LOCAL/TESTING ONLY - do not `supabase db push` this against the live database
-- until the feature has been reviewed (see chat instructions).
alter table public.agency_invites
  drop constraint if exists agency_invites_role_check;

alter table public.agency_invites
  add constraint agency_invites_role_check
  check (role in ('admin', 'manager', 'producer', 'service', 'bookkeeper'));
