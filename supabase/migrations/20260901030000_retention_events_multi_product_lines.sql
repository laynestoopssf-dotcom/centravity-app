-- =============================================================================
-- Widens `retention_events.product_line` (single text value) into
-- `product_lines` (text[]) so components/RetentionLoggingWidget.tsx can log a
-- single save/cancel event that covers a whole household's bundled policies
-- (e.g. Auto + Home/Renters saved together in one call).
--
-- `retention_events` itself was added by 20260901020000_add_retention_events.sql,
-- which is ALREADY LIVE on the remote database - this is a follow-up ALTER,
-- not an edit to that original file, so migration history stays honest about
-- what actually ran, in what order, against the real database.
--
-- LOCAL/TESTING ONLY - do not `supabase db push` this against the live
-- database until the feature has been reviewed (see chat instructions). The
-- table is expected to still be empty in production, but the backfill step
-- below is included anyway so this stays safe to run even if that's changed
-- by the time it's actually pushed.
--
-- Safe to run multiple times.
-- =============================================================================

alter table public.retention_events
  add column if not exists product_lines text[] not null default '{}';

-- Backfill any rows logged under the old single-value column before it's dropped.
update public.retention_events
  set product_lines = array[product_line]
  where product_line is not null and coalesce(array_length(product_lines, 1), 0) = 0;

alter table public.retention_events
  drop column if exists product_line;

-- Note: array_length(arr, 1) returns NULL (not 0) for an empty array, and a NULL CHECK
-- result is treated as passing - cardinality() is the version that actually returns 0.
alter table public.retention_events
  drop constraint if exists retention_events_product_lines_not_empty;
alter table public.retention_events
  add constraint retention_events_product_lines_not_empty check (cardinality(product_lines) > 0);

comment on column public.retention_events.product_lines is
  'One or more product lines covered by this save/cancel decision (e.g. a bundled Auto+Home household) - see the fixed checkbox group in components/RetentionLoggingWidget.tsx (Auto, Home/Renters, Life, Health, Commercial). Always non-empty.';
