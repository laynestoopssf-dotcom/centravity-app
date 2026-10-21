-- =============================================================================
-- Coaching Insights history: a permanent, append-only log of every Coaching Insight a manager
-- has ACKNOWLEDGED ("Mark as Addressed") from the Coaching tab. Each row snapshots the exact math
-- and raw volume the manager was looking at when they acknowledged it, so the log doubles as a
-- historical coaching record - and the most recent row per (producer, metric) is what snoozes
-- that flag for the cooldown period (see utils/coachingMath.ts, ACK_COOLDOWN_DAYS = 14) so the
-- same alert doesn't re-fire every day while the producer is working on it.
--
-- Append-only by design: there are intentionally NO update/delete policies - an acknowledged
-- flag stays on the record.
--
-- ACCESS CONTROL follows the app's custom RBAC instead of hardcoded role names: a user may read/
-- write this table when their role has the `manage_coaching` permission - exactly what the Coaching
-- tab itself checks (components/CoachingTab.tsx:
--   agencies.custom_roles[role].permissions.manage_coaching ?? <owner/admin/manager default>).
-- See public.user_has_manage_coaching below, which mirrors that expression in SQL.
--
-- NOTE: coaching_sessions and deal_autopsies (20260827010000_add_coaching_module.sql) still use the
-- older hardcoded ('owner','admin','manager') check; only this table uses the permission function.
--
-- Safe to run multiple times (the function is CREATE OR REPLACE and the policies are dropped and
-- recreated), so re-running this file after an earlier version of it was applied is fine.
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.coaching_insights_history (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  -- The producer whose metric was flagged.
  producer_id uuid not null references public.profiles(id) on delete cascade,
  -- The manager who acknowledged it. Kept (nulled) if that manager is later deleted so the log survives.
  resolved_by uuid references public.profiles(id) on delete set null,
  -- Which funnel ratio was flagged.
  metric text not null,
  -- Ratios as decimals (0.12 = 12%) at the moment of acknowledgement.
  t30_ratio numeric not null,
  baseline_ratio numeric not null,
  -- Raw trailing-30-day counts behind t30_ratio, e.g. {"touches": 240, "quotes": 29, "apps": 6}.
  volume_context jsonb not null default '{}'::jsonb,
  resolved_at timestamptz not null default now(),
  constraint coaching_insights_history_metric_check check (metric in ('call-to-quote', 'quote-to-app'))
);

-- -----------------------------------------------------------------------------
-- user_has_manage_coaching(agency) - SQL mirror of the client's permission check:
--
--   roleConfig = agencies.custom_roles.find(r => r.id === profile.role)
--   allowed    = roleConfig?.permissions?.manage_coaching ?? ['owner','admin','manager'].includes(profile.role)
--
-- i.e. an explicit true/false on the caller's role in their agency's custom_roles wins (so an
-- agency can grant or revoke coaching access per role from Settings -> Roles & Permissions); if the
-- role has no entry, or no manage_coaching key, it falls back to the same owner/admin/manager
-- default the UI uses. The caller must belong to `p_agency_id`.
--
-- SECURITY DEFINER (with a pinned search_path) so the lookup of the caller's own profile + agency
-- roles doesn't depend on the caller's RLS on those tables; it only ever inspects auth.uid()'s own
-- row, so it can't be used to probe anyone else.
-- -----------------------------------------------------------------------------
create or replace function public.user_has_manage_coaching(p_agency_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(
        -- Explicit permission on the caller's role in custom_roles (true/false). A missing role
        -- entry, missing key, or non-boolean value yields NULL and falls through to the default.
        (
          select case r->'permissions'->'manage_coaching'
                   when 'true'::jsonb then true
                   when 'false'::jsonb then false
                 end
          from jsonb_array_elements(
                 case when jsonb_typeof(to_jsonb(a.custom_roles)) = 'array' then to_jsonb(a.custom_roles) else '[]'::jsonb end
               ) as r
          where r->>'id' = p.role::text
          limit 1
        ),
        p.role::text in ('owner', 'admin', 'manager')
      )
      from public.profiles p
      join public.agencies a on a.id = p.agency_id
      where p.id = auth.uid()
        and p.agency_id = p_agency_id
    ),
    false
  );
$$;

revoke all on function public.user_has_manage_coaching(uuid) from public;
grant execute on function public.user_has_manage_coaching(uuid) to authenticated;

comment on function public.user_has_manage_coaching(uuid) is
  'True when the signed-in user belongs to the agency and their role has the manage_coaching permission (agencies.custom_roles override, else the owner/admin/manager default). Mirrors components/CoachingTab.tsx.';

-- Serves the snooze lookup: "latest acknowledgement for this producer + metric".
create index if not exists coaching_insights_history_lookup_idx
  on public.coaching_insights_history(agency_id, producer_id, metric, resolved_at desc);

comment on table public.coaching_insights_history is
  'Append-only log of acknowledged Coaching Insights (trailing-30-day conversion drops). The latest row per producer+metric snoozes that flag for the cooldown window. See components/coaching/CoachingInsightsPanel.tsx and utils/coachingMath.ts.';
comment on column public.coaching_insights_history.volume_context is
  'Raw T30 counts at acknowledgement time, e.g. {"touches": 240, "quotes": 29, "apps": 6}.';

alter table public.coaching_insights_history enable row level security;

drop policy if exists "coaching_insights_history_select" on public.coaching_insights_history;
create policy "coaching_insights_history_select" on public.coaching_insights_history
  for select using (
    public.user_has_manage_coaching(agency_id)
  );

-- Insert: a user holding manage_coaching in the SAME agency, recording themselves as resolved_by, about a
-- producer that actually belongs to that agency - so a row can't be planted in another agency or
-- attributed to someone else.
drop policy if exists "coaching_insights_history_insert" on public.coaching_insights_history;
create policy "coaching_insights_history_insert" on public.coaching_insights_history
  for insert with check (
    resolved_by = auth.uid()
    and public.user_has_manage_coaching(agency_id)
    and exists (
      select 1 from public.profiles p
      where p.id = producer_id and p.agency_id = coaching_insights_history.agency_id
    )
  );
