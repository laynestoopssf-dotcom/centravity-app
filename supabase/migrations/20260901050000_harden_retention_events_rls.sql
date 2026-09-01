-- Hardens retention_events RLS to use the same get_my_agency_id() SECURITY DEFINER
-- helper the (battle-tested) `policies` table's "Users can insert/update/view agency
-- policies" policies already use, instead of a correlated subquery against `profiles`
-- that runs as the CALLING role and is therefore subject to `profiles`' own RLS.
--
-- CONTEXT: A live diagnostic (signing in as a real profiles.role = 'service' demo
-- account and issuing the exact insert RetentionLoggingWidget.tsx sends) did NOT
-- reproduce an RLS violation against the currently-deployed
-- 20260901020000_add_retention_events.sql / 20260901030000_retention_events_multi_product_lines.sql
-- policies - `profiles` SELECT is wide open to any authenticated user (see "Allow
-- viewing profiles" / "MVP: Select Profiles" / "Profiles are viewable by authenticated
-- users"), so the subquery already resolves correctly for every role today. This
-- migration is defense-in-depth, not a confirmed-bug fix: get_my_agency_id() is
-- SECURITY DEFINER, so it keeps working even if `profiles`' own SELECT policies are
-- ever tightened later (e.g. to stop showing every teammate's row to every role),
-- which would silently break the inline-subquery version without touching this file.
drop policy if exists "retention_events_insert" on public.retention_events;
drop policy if exists "retention_events_select" on public.retention_events;

create policy "retention_events_insert" on public.retention_events
  for insert
  with check (
    team_member_id = auth.uid()
    and agency_id = public.get_my_agency_id()
  );

create policy "retention_events_select" on public.retention_events
  for select
  using (
    team_member_id = auth.uid()
    or (
      agency_id = public.get_my_agency_id()
      and exists (
        select 1 from public.profiles
        where profiles.id = auth.uid()
          and profiles.role = any (array['owner', 'admin', 'manager'])
      )
    )
  );

-- NOTE on Complex Resolution ("positive"/"negative" activity_type + a `policies` row
-- with product_line = 'Complex Resolution'): audited public.policies' and
-- public.activities' INSERT policies live (pg_policies) and reproduced the exact
-- LogActivityModal.tsx complex_res payload as a real service-role demo account - both
-- inserts succeeded. Every INSERT policy on both tables checks agency_id match only
-- (no role restriction at all - "MVP: Insert Activities" is even just
-- `auth.uid() IS NOT NULL`), so there is no role-based RLS bug to fix there. Not
-- touching those policies here since they're shared by every logging flow in the app
-- (quotes, binds, cross-sells) and are already maximally permissive for same-agency
-- writes.
