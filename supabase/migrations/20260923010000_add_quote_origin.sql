-- Quote Origin: which channel a Quote came from ('call' | 'text' | 'inbound_other').
-- -----------------------------------------------------------------------------
-- Added to BOTH tables a quote writes to (components/dashboard/LogActivityModal.tsx):
--   - policies.quote_origin   - the 'quoted' row. Stays on the row when it later flips to
--                               'bound'/'issued', so conversion rate by origin is simply
--                               "bound-or-issued policies grouped by quote_origin" with no join.
--                               The Data Ledger's Quotes table reads this column.
--   - activities.quote_origin - the activity_type = 'quote' row, for activity-based reporting.
--
-- Nullable + additive: every existing row (logged before this field, or via the bulk
-- "Log Past Data" paths that have no origin) stays NULL = unknown and every existing query is
-- unaffected. Only populated for quotes; Bound / Complex Resolution / Cross-Sell never set it.
-- Safe to run multiple times.
-- =============================================================================

alter table public.policies   add column if not exists quote_origin text;
alter table public.activities add column if not exists quote_origin text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'policies_quote_origin_check') then
    alter table public.policies
      add constraint policies_quote_origin_check
      check (quote_origin is null or quote_origin in ('call', 'text', 'inbound_other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'activities_quote_origin_check') then
    alter table public.activities
      add constraint activities_quote_origin_check
      check (quote_origin is null or quote_origin in ('call', 'text', 'inbound_other'));
  end if;
end $$;

comment on column public.policies.quote_origin is
  'Channel the quote originated from: call | text | inbound_other. NULL = unknown/legacy. Persists through quoted -> bound so conversions can be attributed by origin.';
comment on column public.activities.quote_origin is
  'Channel the quote originated from: call | text | inbound_other. Only set on activity_type = ''quote'' rows. NULL = unknown/legacy.';
