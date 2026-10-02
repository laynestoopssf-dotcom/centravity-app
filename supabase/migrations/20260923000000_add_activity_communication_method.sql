-- Split Outbound Touch into Call vs. Text.
-- -----------------------------------------------------------------------------
-- Adds a nullable `communication_method` column to `activities` ('call' | 'text')
-- instead of introducing new activity_type values like 'touch_call' / 'touch_text'.
--
-- WHY A METADATA COLUMN (and not new activity types):
--   Every consumer of the Touches metric - Scoreboard MTD/week/today, streaks
--   (supabase/functions/midnight_streaks), Weekly Rank, Agency Overview, Coaching,
--   Custom Targets, EOD brief, dynamic_targets, Reports, demo seeders - filters on
--   activity_type = 'touchpoint'. Keeping that value for BOTH Calls and Texts means
--   "Total Touches" and all historical pacing / targets / streaks keep aggregating
--   exactly as before with zero changes to any of them.
--
-- LEGACY DATA:
--   Existing rows (and any row logged by an older client / bulk "Log Past Data" path)
--   have communication_method = NULL. The app treats NULL as a Call everywhere it
--   needs a split (Scoreboard breakdown: Calls = Total Touches - Texts; Ledger badge),
--   so nothing is backfilled and nothing needs rewriting.
--
-- Only meaningful for activity_type = 'touchpoint'; always NULL for other types.
-- Additive and nullable: safe to run multiple times, no existing query is affected.
-- =============================================================================

alter table public.activities
  add column if not exists communication_method text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'activities_communication_method_check'
  ) then
    alter table public.activities
      add constraint activities_communication_method_check
      check (communication_method is null or communication_method in ('call', 'text'));
  end if;
end $$;

comment on column public.activities.communication_method is
  'How an outbound touchpoint was made: ''call'' or ''text''. Only set on activity_type = ''touchpoint'' rows. NULL = legacy generic touch, treated as a Call by the app. Both values still count toward Total Touches.';
