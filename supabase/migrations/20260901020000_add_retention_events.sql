-- =============================================================================
-- `retention_events` — one row per Service & Retention team member's "did we
-- keep this policy" decision (components/RetentionLoggingWidget.tsx), feeding
-- the Owner/Manager "Premium Rescued" tile (components/dashboard/RetentionMetricsTile.tsx).
--
-- This is a NET-NEW event log, not a replacement for anything: it does not
-- touch `activities`/`policies`, and is independent of the existing
-- `ytd_lapse_cancel_*` baseline-rate columns on `agencies`/`offices` (those
-- are onboarding-collected starting rates, not a per-event log) and of the
-- existing `complex_res`/`cross_sell` activity types (those already have
-- their own Weekly Sentiment / Cross-Sell metrics — see app/dashboard/page.tsx).
-- "Premium at risk" here specifically means "a customer threatened to cancel
-- and a rep worked the save," which none of those track today.
--
-- Mirrors the same agency_id + auth.uid()-scoped RLS shape as
-- sparring_sessions (20260831000000_add_sparring_sessions.sql): `agency_id`
-- is carried directly (not derived via a join through profiles) so every RLS
-- check below is a single indexed column comparison.
--
-- Deliberately NO update/delete policies — only select + insert were asked
-- for, so this behaves as a write-once event log (a rep can log a new
-- outcome but never edit/delete a past entry; same restriction applies to
-- owners/managers, who can only ever SELECT). Add update/delete policies
-- later if a "correct a misslogged event" feature is ever needed.
--
-- Safe to run multiple times.
--
-- LOCAL/TESTING ONLY - do not `supabase db push` this against the live
-- database until the feature has been reviewed (see chat instructions).
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.retention_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  office_id uuid references public.offices(id) on delete set null,
  team_member_id uuid not null references public.profiles(id) on delete cascade,
  product_line text not null,
  premium_at_risk numeric not null default 0,
  outcome text not null,
  constraint retention_events_outcome_check check (outcome in ('saved', 'cancelled'))
);

create index if not exists retention_events_team_member_id_idx on public.retention_events(team_member_id, created_at desc);
create index if not exists retention_events_agency_id_idx on public.retention_events(agency_id, created_at desc);
create index if not exists retention_events_office_id_idx on public.retention_events(office_id);

comment on table public.retention_events is
  'One row per Service & Retention save/loss decision logged via components/RetentionLoggingWidget.tsx. premium_at_risk is the annualized premium of the policy that was at risk of lapsing/cancelling; outcome is ''saved'' if the rep retained it, ''cancelled'' if not. Powers components/dashboard/RetentionMetricsTile.tsx''s MTD Premium Rescued + Opportunity Save Rate metrics.';

alter table public.retention_events enable row level security;

-- Standard users: only their own rows. Owners/admins/managers: every row in
-- their own agency, same "manager-level" role set as isManagerLevelRole()
-- (utils/roles.ts) and every other manager-visibility RLS policy in this app.
drop policy if exists "retention_events_select" on public.retention_events;
create policy "retention_events_select" on public.retention_events
  for select using (
    team_member_id = auth.uid()
    or agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

-- Insert: a user may only ever log an event as themselves, and only into
-- their own agency — `agency_id` is never trusted as freely-settable, it
-- must match the caller's own profiles.agency_id.
drop policy if exists "retention_events_insert" on public.retention_events;
create policy "retention_events_insert" on public.retention_events
  for insert with check (
    team_member_id = auth.uid()
    and agency_id in (
      select agency_id from public.profiles
      where id = auth.uid()
    )
  );
