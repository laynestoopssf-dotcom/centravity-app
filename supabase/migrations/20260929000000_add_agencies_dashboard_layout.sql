-- Scoreboard Customization: which optional dashboard widgets an agency shows.
-- -----------------------------------------------------------------------------
-- One JSONB column on `agencies` (the table the app calls "agency settings") instead of a boolean
-- column per widget, so new optional widgets can be added later without another migration:
--
--   dashboard_layout = {
--     "show_contacts":          true,   -- Contact quick-log button, Contacts count, Contact ratios
--     "show_pivots":            true,   -- Pivot button + Pivots count
--     "show_reviews":           true,   -- Ask for Review button + Reviews count
--     "show_conversion_panels": true    -- Daily / Month-to-Date Conversion tiles
--   }
--
-- A MISSING key means "shown" (utils/dashboardLayout.ts), so the default '{}' leaves every existing
-- agency's dashboard exactly as it is today until the owner opts something out in
-- Settings -> Dashboard Layout. Hiding a widget never deletes any data - it only stops rendering it.
--
-- Safe to run multiple times.
-- =============================================================================

alter table public.agencies
  add column if not exists dashboard_layout jsonb not null default '{}'::jsonb;

comment on column public.agencies.dashboard_layout is
  'Optional dashboard widget visibility: {show_contacts, show_pivots, show_reviews, show_conversion_panels}. Missing key = shown. See utils/dashboardLayout.ts.';
