-- Adds soft-delete ("Archive") support for team members.
--
-- Team members must never be hard-deleted from `profiles` - doing so would orphan every
-- historical policy/activity row that references their user_id via a foreign key, wiping out
-- past commission and YTD reporting for the whole agency. Instead, an "Archive" flag lets the
-- app stop surfacing a departed team member on active rosters/leaderboards/producer selectors
-- while their historical sales data stays fully intact for agency-wide YTD reporting.
--
-- Run this migration against the linked project (`supabase db push`) or paste it into the
-- Supabase SQL Editor once. It's idempotent - re-running it is a no-op if the column/index
-- already exist.

alter table public.profiles
  add column if not exists is_archived boolean not null default false;

-- Speeds up the two hot-path queries this flag was introduced for: the active roster fetch
-- (`agency_id` + `is_archived = false`) and the Settings > Team Management "Archived" section
-- (`agency_id` + `is_archived = true`).
create index if not exists idx_profiles_agency_archived on public.profiles(agency_id, is_archived);
