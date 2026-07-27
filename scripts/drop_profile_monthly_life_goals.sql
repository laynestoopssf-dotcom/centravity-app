-- =============================================================================
-- Drop dead monthly Life goal columns from `profiles`
-- -----------------------------------------------------------------------------
-- Context: producer Life goals used to be edited as MONTHLY figures
-- (monthly_target_life_apps / monthly_target_life_premium) in the "Monthly
-- Goals & Pay" column of the Team edit modal (components/SettingsTab.tsx).
-- They were written to `profiles` on every save but never read by any
-- pacing/calculation logic anywhere in the app — MyPerformanceTab, LifeTab,
-- and the dashboard's YTD/leaderboard widgets have always read
-- annual_target_life_apps / annual_target_life_premium instead, deriving a
-- monthly pace from that annual figure on demand (annual / 12) wherever one
-- is actually needed, rather than storing it separately.
--
-- The UI has been updated to only collect the annual figures (see the
-- "Life / Annual" section in SettingsTab.tsx), and app/dashboard/page.tsx's
-- handleSaveTeamTargets no longer writes monthly_target_life_apps/premium.
-- This migration removes the now fully write-only, dead columns.
--
-- Safe to run any time after that code deploys — nothing reads these columns
-- today, so dropping them can't break any live calculation. IF EXISTS guards
-- make this a no-op (not an error) if it's ever run twice or against an
-- environment that never had these columns.
-- =============================================================================

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS monthly_target_life_apps,
  DROP COLUMN IF EXISTS monthly_target_life_premium;
