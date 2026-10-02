-- Bound Origin: which channel closed business came from ('call' | 'text' | 'inbound_other').
-- -----------------------------------------------------------------------------
-- Mirrors 20260923010000_add_quote_origin.sql exactly - same value set, same tables, same
-- NULL-means-unknown semantics - as a SEPARATE column so the two attributions never overwrite
-- each other. Binding an existing quote must not erase how the quote STARTED (quote_origin),
-- otherwise "which channel's quotes actually convert?" and "which channel closes?" could no
-- longer be compared (e.g. a Text-originated quote closed on a Call).
--
--   policies.quote_origin   how the quote started      (set when quoted)
--   policies.bound_origin   how the deal closed        (set when bound, or issued straight from quoted)
--   activities.quote_origin / activities.bound_origin  same, on the activity_type = 'quote' / 'bound' rows
--
-- Nullable + additive: existing rows (and bulk/historical import paths) stay NULL = unknown;
-- no existing query is affected. Safe to run multiple times.
-- =============================================================================

alter table public.policies   add column if not exists bound_origin text;
alter table public.activities add column if not exists bound_origin text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'policies_bound_origin_check') then
    alter table public.policies
      add constraint policies_bound_origin_check
      check (bound_origin is null or bound_origin in ('call', 'text', 'inbound_other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'activities_bound_origin_check') then
    alter table public.activities
      add constraint activities_bound_origin_check
      check (bound_origin is null or bound_origin in ('call', 'text', 'inbound_other'));
  end if;
end $$;

comment on column public.policies.bound_origin is
  'Channel the closed business came from: call | text | inbound_other. Set when a policy is bound (or issued directly from quoted). Independent of quote_origin. NULL = unknown/legacy.';
comment on column public.activities.bound_origin is
  'Channel the closed business came from: call | text | inbound_other. Only set on activity_type = ''bound'' rows. NULL = unknown/legacy.';
