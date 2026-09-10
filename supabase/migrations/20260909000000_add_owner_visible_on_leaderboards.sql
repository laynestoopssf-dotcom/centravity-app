-- Owner leaderboard visibility toggle.
-- -----------------------------------------------------------------------------
-- Adds a single boolean column to `agencies` that controls whether the rest of
-- the team can see the Owner's (and any admin's) production in the new
-- isolated "Agency Owner" sections on Agency MTD (components/AgencyOverviewTab.tsx)
-- and Weekly Rank (components/WeeklyRankTab.tsx). The Owner Production callout
-- on the Team Scoreboard (components/DashboardTab.tsx) is unaffected by this
-- toggle - it has always been visible to whoever can see the Scoreboard at all.
--
-- Defaults to FALSE (owner production stays owner-only), which preserves the
-- pre-existing behavior of both pages - before this migration, owner/admin
-- production was excluded from Agency MTD and Weekly Rank entirely, so
-- defaulting to "not visible to the team" is the non-disruptive rollout choice.
-- An owner/admin has to explicitly opt in from Settings -> Team Management to
-- share their numbers agency-wide.
--
-- Regardless of this toggle, the owner/admin can ALWAYS see their own "Agency
-- Owner" section when logged in - the gating check in both tabs is
-- `agencySettings.owner_visible_on_leaderboards || isOwnerLevelRole(profile.role)`.
--
-- This mirrors the existing boolean-column-on-`agencies` feature-toggle pattern
-- (e.g. `target_vc_active`, `target_travel_active` - see
-- scripts/add_corporate_targets_toggles.sql) rather than introducing a new
-- table or a per-user preference.
--
-- Safe to run multiple times - IF NOT EXISTS guards the ADD COLUMN call.
-- =============================================================================

alter table public.agencies
  add column if not exists owner_visible_on_leaderboards boolean not null default false;

comment on column public.agencies.owner_visible_on_leaderboards is
  'Leaderboard visibility toggle: when true, the Owner''s (and any admin''s) production is shown to the whole team in an isolated "Agency Owner" section on Agency MTD (components/AgencyOverviewTab.tsx) and Weekly Rank (components/WeeklyRankTab.tsx). Defaults false (owner-only) to preserve pre-existing behavior; an owner opts in explicitly from Settings -> Team Management. Regardless of this toggle, the owner/admin themselves can always see their own section (isOwnerLevelRole(profile.role) check in each tab). Does not affect the Team Scoreboard''s Owner Production callout, which has always been visible to anyone who can see the Scoreboard.';
