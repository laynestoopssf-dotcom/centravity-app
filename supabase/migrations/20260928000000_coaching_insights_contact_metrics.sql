-- Coaching Insights: Contact funnel metrics.
-- -----------------------------------------------------------------------------
-- The funnel is now Touches -> Contacts -> Quotes -> Apps, so Coaching Insights flags three ratios:
--   touch-to-contact  (Contacts / Touches)   NEW
--   contact-to-quote  (Quotes / Contacts)    NEW - replaces call-to-quote
--   quote-to-app      (Apps / Quotes)        unchanged
--
-- coaching_insights_history.metric was CHECK-restricted to ('call-to-quote', 'quote-to-app').
-- Without this change, acknowledging a Touch-to-Contact / Contact-to-Quote flag would be rejected by
-- the database. 'call-to-quote' stays allowed so acknowledgements already on record remain valid
-- (the app simply no longer generates that metric).
--
-- Safe to run multiple times.
-- =============================================================================

do $$
begin
  if to_regclass('public.coaching_insights_history') is null then
    raise notice 'coaching_insights_history does not exist yet - run 20260926000000_add_coaching_insights_history.sql first.';
    return;
  end if;

  alter table public.coaching_insights_history
    drop constraint if exists coaching_insights_history_metric_check;

  alter table public.coaching_insights_history
    add constraint coaching_insights_history_metric_check
    check (metric in ('call-to-quote', 'touch-to-contact', 'contact-to-quote', 'quote-to-app'));
end $$;
