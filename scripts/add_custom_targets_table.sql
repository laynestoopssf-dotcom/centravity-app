-- =============================================================================
-- "Custom Corporate Targets" engine with visibility routing.
-- -----------------------------------------------------------------------------
-- Lets an agency owner define arbitrary named targets (e.g. "Q3 Commercial
-- Push", "New Agent Ramp Goal") on top of a real tracked metric (touches,
-- quotes, apps by line, issued premium), and route each one to either:
--   - 'scoreboard' -> visible to the whole team on the Team Scoreboard tab
--   - 'revenue'    -> owner-only, visible on the Revenue & VC tab
--
-- This is separate from the target_vc_active / target_travel_active toggles
-- added in add_corporate_targets_toggles.sql, which only gate the existing
-- hardcoded VC/Travel widgets. Custom targets are a fully independent,
-- owner-defined list.
--
-- Safe to run multiple times.
-- =============================================================================

create extension if not exists pgcrypto;

CREATE TABLE IF NOT EXISTS public.agency_custom_targets (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  -- NULL office_id = the target is scoped to "All Locations" combined.
  office_id uuid references public.offices(id) on delete cascade,
  name text not null,
  -- One of the metric keys defined in utils/customTargets.ts (CUSTOM_TARGET_METRICS)
  -- e.g. 'touchpoints', 'quotes', 'auto_apps', 'life_premium', 'total_premium'.
  metric_type text not null,
  -- Rolling window the metric is measured over.
  period text not null default 'monthly',
  target_value numeric not null default 0,
  -- Visibility routing (this migration's whole point): where the target renders.
  display_location text not null default 'scoreboard',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_custom_targets_period_check check (period in ('weekly', 'monthly', 'ytd')),
  constraint agency_custom_targets_display_location_check check (display_location in ('scoreboard', 'revenue'))
);

create index if not exists agency_custom_targets_agency_id_idx on public.agency_custom_targets(agency_id);

comment on table public.agency_custom_targets is
  'Owner-defined custom targets (Settings -> Corporate Targets -> Custom Target Builder). display_location routes each target to the team-visible Scoreboard or the owner-only Revenue tab.';
comment on column public.agency_custom_targets.display_location is
  'scoreboard = team-visible on the Dashboard Scoreboard tab. revenue = owner-only, rendered on the Revenue & VC tab instead.';

-- -----------------------------------------------------------------------------
-- RLS: mirrors the simple "same agency" trust model already used elsewhere in
-- this app (fine-grained manage_settings/role gating is enforced at the app
-- layer via canManageSettings, same as every other Settings write path).
-- If your existing tables use stricter per-role DB policies, tighten these to
-- match before relying on them in production.
-- -----------------------------------------------------------------------------
alter table public.agency_custom_targets enable row level security;

drop policy if exists "agency_custom_targets_select" on public.agency_custom_targets;
create policy "agency_custom_targets_select" on public.agency_custom_targets
  for select using (
    agency_id in (select agency_id from public.profiles where id = auth.uid())
  );

drop policy if exists "agency_custom_targets_insert" on public.agency_custom_targets;
create policy "agency_custom_targets_insert" on public.agency_custom_targets
  for insert with check (
    agency_id in (select agency_id from public.profiles where id = auth.uid())
  );

drop policy if exists "agency_custom_targets_update" on public.agency_custom_targets;
create policy "agency_custom_targets_update" on public.agency_custom_targets
  for update using (
    agency_id in (select agency_id from public.profiles where id = auth.uid())
  );

drop policy if exists "agency_custom_targets_delete" on public.agency_custom_targets;
create policy "agency_custom_targets_delete" on public.agency_custom_targets
  for delete using (
    agency_id in (select agency_id from public.profiles where id = auth.uid())
  );
