-- =============================================================================
-- Coaching Suite: `coaching_sessions` (Feature 1 - weekly 1-on-1 notes/commitments)
-- and `deal_autopsies` (Feature 2 - AI-assisted objection review on tagged Quoted
-- deals). Backs the new /dashboard/coaching page.
--
-- Both tables add `agency_id` beyond what the request literally listed - every
-- other multi-tenant table in this app (policies, activities, agency_invites,
-- etc.) carries it for the same two reasons: (1) RLS below needs an indexed,
-- direct column to scope on rather than a join through profiles/policies on
-- every row check, and (2) it makes "wipe this agency's data" / demo-seed
-- cleanup scripts able to target these tables directly like every other one.
--
-- Safe to run multiple times.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- coaching_sessions - one row per weekly 1-on-1. `commitments` is what the
-- producer committed to THIS session (free text, same as `notes`) - next
-- week's UI reads last week's row to show "committed vs. actual production"
-- side-by-side (computed live from policies/activities, not stored here).
-- -----------------------------------------------------------------------------
create table if not exists public.coaching_sessions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  producer_id uuid not null references public.profiles(id) on delete cascade,
  manager_id uuid not null references public.profiles(id) on delete set null,
  notes text,
  commitments text,
  created_at timestamptz not null default now()
);

create index if not exists coaching_sessions_producer_id_idx on public.coaching_sessions(producer_id, created_at desc);
create index if not exists coaching_sessions_agency_id_idx on public.coaching_sessions(agency_id);

comment on table public.coaching_sessions is
  'Weekly 1-on-1 coaching notes + commitments, logged by a manager against a producer. See app/dashboard/coaching/page.tsx.';

alter table public.coaching_sessions enable row level security;

drop policy if exists "coaching_sessions_select" on public.coaching_sessions;
create policy "coaching_sessions_select" on public.coaching_sessions
  for select using (
    producer_id = auth.uid()
    or agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

drop policy if exists "coaching_sessions_insert" on public.coaching_sessions;
create policy "coaching_sessions_insert" on public.coaching_sessions
  for insert with check (
    manager_id = auth.uid()
    and agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

drop policy if exists "coaching_sessions_update" on public.coaching_sessions;
create policy "coaching_sessions_update" on public.coaching_sessions
  for update using (
    manager_id = auth.uid()
    and agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

drop policy if exists "coaching_sessions_delete" on public.coaching_sessions;
create policy "coaching_sessions_delete" on public.coaching_sessions
  for delete using (
    manager_id = auth.uid()
    and agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

-- -----------------------------------------------------------------------------
-- deal_autopsies - one row per "Send to Coaching" tag on a Quoted policy
-- (Feature 2). The producer types the objection they hit; the AI talk-path
-- response is cached here (ai_talk_path) rather than re-generated every time
-- the row is viewed, so re-opening it doesn't re-spend a Gemini call.
-- -----------------------------------------------------------------------------
create table if not exists public.deal_autopsies (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  producer_id uuid not null references public.profiles(id) on delete cascade,
  objection_text text,
  ai_talk_path text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deal_autopsies_status_check check (status in ('open', 'reviewed'))
);

create index if not exists deal_autopsies_producer_id_idx on public.deal_autopsies(producer_id, created_at desc);
create index if not exists deal_autopsies_agency_id_idx on public.deal_autopsies(agency_id);
-- One open autopsy per policy at a time - re-sending the same Quoted deal to
-- Coaching should reuse/update the existing row instead of piling up
-- duplicates in the list.
create unique index if not exists deal_autopsies_policy_open_idx on public.deal_autopsies(policy_id) where status = 'open';

comment on table public.deal_autopsies is
  '"Send to Coaching" tags on Quoted policies + the objection the producer typed + the cached AI talk-path response. See app/dashboard/coaching/page.tsx and app/api/ai/deal-autopsy.';

alter table public.deal_autopsies enable row level security;

drop policy if exists "deal_autopsies_select" on public.deal_autopsies;
create policy "deal_autopsies_select" on public.deal_autopsies
  for select using (
    producer_id = auth.uid()
    or agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

-- Insert: the producer tagging their OWN deal, or a manager/admin/owner tagging a
-- teammate's deal from their agency-wide Active Pipeline view (DashboardTab.tsx's
-- "Send to Coaching" button is visible to both) - either way `agency_id` must match
-- the caller's own, so this can never plant a row in a different agency.
drop policy if exists "deal_autopsies_insert" on public.deal_autopsies;
create policy "deal_autopsies_insert" on public.deal_autopsies
  for insert with check (
    agency_id in (
      select agency_id from public.profiles
      where id = auth.uid()
        and (id = producer_id or role in ('owner', 'admin', 'manager'))
    )
  );

drop policy if exists "deal_autopsies_update" on public.deal_autopsies;
create policy "deal_autopsies_update" on public.deal_autopsies
  for update using (
    producer_id = auth.uid()
    or agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

drop policy if exists "deal_autopsies_delete" on public.deal_autopsies;
create policy "deal_autopsies_delete" on public.deal_autopsies
  for delete using (
    producer_id = auth.uid()
    or agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );
