-- =============================================================================
-- Explicit Owner/Manager cross-team SELECT access on `policies` and `activities`.
-- -----------------------------------------------------------------------------
-- Reported symptom: an Agency Owner searching the Identifier search box (Active
-- Pipeline, components/DashboardTab.tsx) still couldn't find a team member's
-- policy. That turned out to be a CLIENT-side query-scoping bug, not RLS - see
-- app/dashboard/page.tsx's fetchPipeline(), which now ignores the currently
-- "viewed" producer filter for Owner/Manager roles and always fetches the full
-- office/agency (fixed in a prior commit). Empirically re-checked directly
-- against this project's live data before writing this file: an authenticated
-- PRODUCER's own `select * from policies` (no filters) already returns every
-- row for the whole agency, not just their own - meaning `policies`/`activities`
-- currently have either no RLS enabled, or an existing policy already broad
-- enough to cover this. Either way, nothing here was actually blocking the
-- Owner/Manager at the database level.
--
-- This migration exists anyway because the request explicitly asked for a
-- self-contained, explicit RLS rule that doesn't rely on client-side scoping
-- being correct - defense in depth, and it makes the intended access model
-- readable directly in the database rather than only inferred from app code.
-- It is purely ADDITIVE: a Postgres SELECT policy is OR'd together with every
-- other permissive SELECT policy already on the table, so this can only WIDEN
-- read access, never narrow it - it will not break the (already-working)
-- producer/service "own rows only" client-side scoping.
--
-- Scope model:
--   - owner/admin  -> any row in their own agency_id (agency-wide).
--   - manager      -> any row in their own office_id (office-wide). A manager
--                     profile with no office_id assigned falls back to
--                     agency-wide, same as owner/admin, rather than matching
--                     nothing.
--   - everyone else (producer/service) -> unchanged: user_id = auth.uid() only.
--
-- IMPORTANT — if RLS is currently DISABLED on either table (see the two RAISE
-- NOTICE checks below, visible in the SQL Editor's output when this runs),
-- this new policy has NO effect until it's turned on, because Postgres skips
-- all policies entirely for a table with row level security disabled. Do not
-- flip that on blindly - some other legitimate access path may currently be
-- relying on it being off. Confirm in Database > Tables > (table) > RLS in the
-- Supabase dashboard before enabling it.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'policies' and rowsecurity = true
  ) then
    raise notice 'RLS is currently DISABLED on public.policies - the policy this migration creates will have NO effect until you run: alter table public.policies enable row level security;';
  end if;

  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'activities' and rowsecurity = true
  ) then
    raise notice 'RLS is currently DISABLED on public.activities - the policy this migration creates will have NO effect until you run: alter table public.activities enable row level security;';
  end if;
end $$;

drop policy if exists "owner_manager_view_team_policies" on public.policies;
create policy "owner_manager_view_team_policies"
on public.policies
for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.agency_id = policies.agency_id
      and (
        p.role in ('owner', 'admin')
        or (p.role = 'manager' and (p.office_id = policies.office_id or p.office_id is null))
      )
  )
);

drop policy if exists "owner_manager_view_team_activities" on public.activities;
create policy "owner_manager_view_team_activities"
on public.activities
for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.agency_id = activities.agency_id
      and (
        p.role in ('owner', 'admin')
        or (p.role = 'manager' and (p.office_id = activities.office_id or p.office_id is null))
      )
  )
);
