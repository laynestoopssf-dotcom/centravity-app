-- Manual goal override for Team Management.
-- -----------------------------------------------------------------------------
-- By default (is_manual_goals = false) a producer's Daily/Weekly Calls, Quotes and Apps goals are
-- DERIVED from their Monthly App Target by the reverse goal math (utils/goalMath.ts), which leans on
-- their historical conversion ratios. If a producer under-logs unproductive calls, those ratios look
-- artificially good and the derived call goal comes out too low. Setting is_manual_goals = true lets
-- the agency owner hard-code the Daily/Weekly targets instead; the reverse math is then bypassed for
-- that producer entirely and the stored daily_/weekly_target_* values are used exactly as typed.
--
-- Everything downstream (Scoreboard, Weekly Rank, pacing) just reads daily_/weekly_target_* - it
-- never needs to know which mode produced them.
--
-- Idempotent: safe to run more than once.
-- =============================================================================

alter table public.profiles
  add column if not exists is_manual_goals boolean not null default false;

comment on column public.profiles.is_manual_goals is
  'When true, the owner hard-coded this producer''s daily/weekly goals and the Monthly-App-Target reverse math is bypassed. When false (default), those goals are derived from monthly_target_bound.';
