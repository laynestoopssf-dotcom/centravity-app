-- Defensive completeness fix: `agencies.daily_report_time` and `agencies.timezone` have been
-- read/written by the app (Settings > Notifications & Automation, and the eod_brief Edge
-- Function) since the EOD brief feature was built, but neither column was ever added by a
-- tracked migration in this repo - they must have been created directly against the live
-- database at some point (matching how several other early columns predate this migrations
-- folder). Without this, a fresh/rebuilt database would 500 on both the Settings save and the
-- eod_brief function's `agencies(timezone, daily_report_time)` join with a
-- "column not found in schema cache" error. Idempotent - `ADD COLUMN IF NOT EXISTS` is a no-op
-- against a database that already has these.
alter table public.agencies
  add column if not exists timezone text not null default 'America/Los_Angeles';

alter table public.agencies
  add column if not exists daily_report_time text not null default '18:00';

comment on column public.agencies.timezone is
  'IANA timezone name (e.g. America/Los_Angeles) used to resolve this agency''s local "today" for the EOD brief and other day-boundary logic. Defaults to Pacific if never configured in Settings.';

comment on column public.agencies.daily_report_time is
  'HH:MM (24h) local time the eod_brief Edge Function sends this agency''s End-of-Day brief email. Compared against the agency''s local hour (via `timezone` above) on every hourly cron tick.';
