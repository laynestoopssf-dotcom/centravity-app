-- =============================================================================
-- Upgrades the Custom Corporate Targets engine (add_custom_targets_table.sql)
-- with:
--   1. A 'custom' date-range option (period = 'custom' + start_date/end_date)
--   2. Tiered milestones (tiers jsonb) - e.g. "10 apps = 5,000 credits"
--   3. Cascading/interconnected promos (feeds_into_target_id) - a mini-promo's
--      earned tier credits flow into a linked "master" target's progress.
--
-- Run add_custom_targets_table.sql FIRST if you haven't already. This script
-- is additive/idempotent and safe to run multiple times, in either order
-- relative to re-runs of the base script.
--
-- NOTE: kept the existing `period` column name (rather than renaming it to
-- `timeframe`) to avoid unnecessary churn across the app code that already
-- reads/writes it - 'custom' is just a new valid value alongside
-- 'weekly'/'monthly'/'ytd'. The Settings UI labels this field "Timeframe".
-- =============================================================================

-- Widen the period check to allow 'custom' (requires start_date/end_date below).
alter table public.agency_custom_targets drop constraint if exists agency_custom_targets_period_check;
alter table public.agency_custom_targets
  add constraint agency_custom_targets_period_check check (period in ('weekly', 'monthly', 'ytd', 'custom'));

alter table public.agency_custom_targets add column if not exists start_date timestamptz;
alter table public.agency_custom_targets add column if not exists end_date timestamptz;

alter table public.agency_custom_targets drop constraint if exists agency_custom_targets_custom_dates_check;
alter table public.agency_custom_targets
  add constraint agency_custom_targets_custom_dates_check check (
    period <> 'custom' or (start_date is not null and end_date is not null and end_date >= start_date)
  );

-- Tiered milestones: [{ id: 1, name: 'Tier 1', threshold_metric: 10, reward_credit_value: 5000 }, ...]
-- threshold_metric is compared against this target's OWN raw tracked metric (e.g. life apps).
-- reward_credit_value is added on top of whatever target this one feeds_into (see below) once
-- that tier's threshold is met - it does NOT affect this target's own progress bar.
alter table public.agency_custom_targets add column if not exists tiers jsonb not null default '[]'::jsonb;

-- Cascading link: this ("mini-promo") target feeds its earned tier credits into a "master"
-- target's progress once linked. NULL = standalone target (the common case).
alter table public.agency_custom_targets add column if not exists feeds_into_target_id uuid
  references public.agency_custom_targets(id) on delete set null;

alter table public.agency_custom_targets drop constraint if exists agency_custom_targets_no_self_feed;
alter table public.agency_custom_targets
  add constraint agency_custom_targets_no_self_feed check (feeds_into_target_id is null or feeds_into_target_id <> id);

create index if not exists agency_custom_targets_feeds_into_idx on public.agency_custom_targets(feeds_into_target_id);

comment on column public.agency_custom_targets.tiers is
  'JSONB array of milestone tiers: [{ id, name, threshold_metric, reward_credit_value }]. threshold_metric compares against this target''s own raw metric; reward_credit_value flows into feeds_into_target_id''s progress (if set) once earned.';
comment on column public.agency_custom_targets.feeds_into_target_id is
  'Optional link to a "master" target. When set, this target''s earned tier reward_credit_value amounts are added on top of the master target''s own raw progress. NULL = standalone target.';
comment on column public.agency_custom_targets.start_date is 'Required when period = ''custom''. Ignored otherwise.';
comment on column public.agency_custom_targets.end_date is 'Required when period = ''custom''. Ignored otherwise.';

-- Multi-hop chains (A feeds B feeds C) are supported by the calculation engine
-- (utils/customTargets.ts), which resolves them recursively with cycle protection.
-- Direct A<->B two-way cycles are still possible at the DB level (only the trivial
-- A->A self-loop is blocked above) - the calculation engine breaks any cycle it
-- detects at runtime by falling back to that target's raw value, but for cleanliness
-- avoid manually creating cycles in the Target Builder UI.
