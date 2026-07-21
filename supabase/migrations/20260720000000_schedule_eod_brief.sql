-- Schedules the eod_brief Edge Function to run every hour.
--
-- ROOT CAUSE of "EOD briefs never send": nothing in this project was ever triggering
-- eod_brief at all - there's no vercel.json cron, no GitHub Actions workflow, and (until this
-- migration) no pg_cron job either. The function itself checks each agency's configured
-- "End-of-Day Report Time" (daily_report_time) against the current local hour and only sends
-- when they match, so it's designed to be invoked roughly once per hour, every hour, and skip
-- itself for every agency whose local time doesn't match.
--
-- Run this migration against the linked project (`supabase db push`) or paste it into the
-- Supabase SQL Editor once. It's idempotent - re-running it just re-registers the same job name.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('eod-brief-hourly') where exists (
  select 1 from cron.job where jobname = 'eod-brief-hourly'
);

select cron.schedule(
  'eod-brief-hourly',
  '0 * * * *', -- top of every hour, UTC - the function itself resolves each agency's local hour
  $$
  select net.http_post(
    url := 'https://onnydmmyzreatfyevlrp.supabase.co/functions/v1/eod_brief',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
