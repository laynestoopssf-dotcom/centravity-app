-- =============================================================================
-- "Team Member Invite" system.
-- -----------------------------------------------------------------------------
-- Lets an Owner/Admin invite a specific person by email (with a role + optional
-- office already chosen) rather than the two mechanisms that exist today:
--   - Onboarding Step 2 roster (app/actions/onboarding.ts saveStep2Roster) —
--     the OWNER creates the Auth account + a temp password directly, during
--     their own onboarding wizard only.
--   - "Join a Team" (app/actions/joinAgency.ts) — anyone who has the agency's
--     own id (shown as an "Agency Invite Code" in Settings -> Team) can
--     self-serve join as a plain 'producer', no per-person targeting at all.
-- This table is additive — it does NOT replace either of the above, both of
-- which keep working exactly as they do today.
--
-- Flow: app/actions/teamInvites.ts's createTeamInvite() inserts a row here and
-- emails a link to https://<app>/accept-invite?token=<invite_token>. That page
-- (app/accept-invite/page.tsx) verifies the token via verifyTeamInvite(), the
-- invitee sets a password, and acceptTeamInvite() creates their real
-- auth.users + profiles row (same shape as saveStep2Roster's), then marks this
-- row 'accepted'.
--
-- Safe to run multiple times.
-- =============================================================================

create extension if not exists pgcrypto;

CREATE TABLE IF NOT EXISTS public.agency_invites (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  -- NULL = no specific office chosen yet (single-location agency, or the
  -- inviter left it unassigned) — acceptTeamInvite() falls back to the
  -- agency's first office, same fallback joinAgencyWithInviteCode already
  -- uses today.
  office_id uuid references public.offices(id) on delete set null,
  email text not null,
  first_name text,
  last_name text,
  -- Mirrors profiles.role's existing values (see DEFAULT_ROLES in
  -- components/SettingsTab.tsx) minus 'owner' — you cannot invite a second
  -- owner into an agency, that role is set once at agency creation.
  role text not null default 'producer',
  invite_token uuid not null default gen_random_uuid(),
  status text not null default 'pending',
  -- Who sent it (profiles.id) — purely informational, never used for access
  -- control. Nullable so a since-archived/deleted inviter never blocks
  -- managing their old invites.
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  constraint agency_invites_role_check check (role in ('admin', 'manager', 'producer', 'service')),
  constraint agency_invites_status_check check (status in ('pending', 'accepted', 'expired', 'revoked'))
);

create index if not exists agency_invites_agency_id_idx on public.agency_invites(agency_id);
create unique index if not exists agency_invites_token_idx on public.agency_invites(invite_token);
-- Only one LIVE pending invite per agency+email at a time (case-insensitive) —
-- this is what createTeamInvite()'s "already has a pending invite" check
-- relies on; a revoked/accepted/expired row never blocks re-inviting the same
-- address since the partial index only covers status = 'pending'.
create unique index if not exists agency_invites_agency_email_pending_idx
  on public.agency_invites (agency_id, lower(email))
  where status = 'pending';

comment on table public.agency_invites is
  'Per-person Team Member invites (Settings -> Team -> Invite Team Member). See app/actions/teamInvites.ts for the create/verify/accept flow and app/accept-invite/page.tsx for the link the invitee lands on.';

-- -----------------------------------------------------------------------------
-- RLS: unlike agency_custom_targets' "same agency" trust model, invites carry
-- real access to create accounts and assign roles, so this is scoped to
-- Owners/Admins of the agency specifically (matching isOwnerLevelRole() in
-- utils/roles.ts), not every team member.
--
-- In practice, every write path in this app (createTeamInvite,
-- resendTeamInviteEmail, verifyTeamInvite, acceptTeamInvite — all in
-- app/actions/teamInvites.ts) runs server-side via supabaseAdmin, which
-- bypasses RLS entirely and does its own explicit isOwnerLevelRole() check
-- against the caller's own profile before touching this table. These
-- policies are the defense-in-depth boundary for anything that ever queries
-- this table directly with a real user session and the anon key instead
-- (e.g. the Pending Invites list UI, and Revoke, both of which use the plain
-- client — see fetchTeamInvites/handleRevokeInvite in app/dashboard/page.tsx).
-- -----------------------------------------------------------------------------
alter table public.agency_invites enable row level security;

drop policy if exists "agency_invites_select" on public.agency_invites;
create policy "agency_invites_select" on public.agency_invites
  for select using (
    agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

drop policy if exists "agency_invites_insert" on public.agency_invites;
create policy "agency_invites_insert" on public.agency_invites
  for insert with check (
    agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

drop policy if exists "agency_invites_update" on public.agency_invites;
create policy "agency_invites_update" on public.agency_invites
  for update using (
    agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

drop policy if exists "agency_invites_delete" on public.agency_invites;
create policy "agency_invites_delete" on public.agency_invites
  for delete using (
    agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- -----------------------------------------------------------------------------
-- Email-lookup helper for createTeamInvite()'s "already an active team
-- member" check. profiles has no email column at all (it only ever lives on
-- auth.users), and auth.users isn't exposed over the normal PostgREST API —
-- even to the service role — so this SECURITY DEFINER function is the
-- supported way to do a single indexed lookup without listing every user in
-- the project. Locked to service_role only: this deliberately lets the
-- caller learn "is this email already registered", which is exactly the kind
-- of user-enumeration primitive that must never be reachable with the anon
-- or authenticated key.
-- -----------------------------------------------------------------------------
create or replace function public.find_profile_by_email(p_email text)
returns table(user_id uuid, agency_id uuid)
language sql
security definer
set search_path = public, auth
as $$
  select p.id, p.agency_id
  from auth.users u
  join public.profiles p on p.id = u.id
  where lower(u.email) = lower(p_email)
  limit 1;
$$;

revoke all on function public.find_profile_by_email(text) from public, anon, authenticated;
grant execute on function public.find_profile_by_email(text) to service_role;
