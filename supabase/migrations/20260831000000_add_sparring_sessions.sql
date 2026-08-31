-- =============================================================================
-- `sparring_sessions` — persistence for the AI Objection Simulator / Sparring
-- Ring (components/coaching/SparringRing.tsx, app/api/ai/sparring/route.ts).
-- That route is currently entirely stateless (the client holds the full turn
-- history and re-sends it every call) — this table is the landing spot for a
-- future "save this session" step: one row per completed sparring round, with
-- the full turn-by-turn transcript, an AI-generated summary, and a final
-- score.
--
-- Mirrors the same agency_id + auth.uid()-scoped RLS shape as
-- coaching_sessions/deal_autopsies (20260827010000_add_coaching_module.sql):
-- `agency_id` is carried directly (not derived via a join through profiles)
-- so every RLS check below is a single indexed column comparison, and so
-- agency-wide data tools (demo-seed cleanup, etc.) can target this table
-- directly like every other multi-tenant one.
--
-- Deliberately NO update/delete policies — only select + insert were asked
-- for, so this behaves as a write-once session log (a producer can log a new
-- sparring session but never edit/delete a past score after the fact; same
-- restriction applies to owners/managers, who can only ever SELECT). Add
-- update/delete policies later if a "delete this session" or "re-score"
-- feature is ever needed.
--
-- Safe to run multiple times.
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.sparring_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_line text,
  transcript jsonb,
  summary text,
  score integer
);

create index if not exists sparring_sessions_user_id_idx on public.sparring_sessions(user_id, created_at desc);
create index if not exists sparring_sessions_agency_id_idx on public.sparring_sessions(agency_id);

comment on table public.sparring_sessions is
  'One row per completed AI Sparring Ring session: full turn transcript, AI summary, and final score. See components/coaching/SparringRing.tsx and app/api/ai/sparring/route.ts.';

alter table public.sparring_sessions enable row level security;

-- Standard users: only their own rows. Owners/admins/managers: every row in
-- their own agency, same "manager-level" role set as isManagerLevelRole()
-- (utils/roles.ts) and every other coaching-adjacent RLS policy in this app.
drop policy if exists "sparring_sessions_select" on public.sparring_sessions;
create policy "sparring_sessions_select" on public.sparring_sessions
  for select using (
    user_id = auth.uid()
    or agency_id in (
      select agency_id from public.profiles
      where id = auth.uid() and role in ('owner', 'admin', 'manager')
    )
  );

-- Insert: a user may only ever log a session as themselves, and only into
-- their own agency — `agency_id` is never trusted as freely-settable, it
-- must match the caller's own profiles.agency_id.
drop policy if exists "sparring_sessions_insert" on public.sparring_sessions;
create policy "sparring_sessions_insert" on public.sparring_sessions
  for insert with check (
    user_id = auth.uid()
    and agency_id in (
      select agency_id from public.profiles
      where id = auth.uid()
    )
  );
