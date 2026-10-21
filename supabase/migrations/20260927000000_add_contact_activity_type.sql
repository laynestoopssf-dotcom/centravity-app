-- Add "Contact" as a funnel stage between Touches and Quotes.
-- -----------------------------------------------------------------------------
-- A Contact = a successful connection with a prospect (two-way conversation, answered call, or
-- replied text). The Quick Log "🗣️ Contact" button (components/DashboardTab.tsx, QuickActionsBar,
-- the /logger pop-out) inserts an `activities` row with activity_type = 'contact'.
--
-- WHY A NEW activity_type (and not a touchpoint + flag):
--   Every Touches consumer (Scoreboard, streaks, Weekly Rank, Agency Overview, Coaching, Custom
--   Targets, reverse goal math, EOD brief...) filters on activity_type = 'touchpoint'. A separate
--   value means Contacts can never inflate Touches, the Touches target, or Call-to-Quote ratios,
--   and every one of those consumers keeps working unchanged (rows of an unknown type are
--   ignored by queries that don't ask for them).
--
-- NO SCHEMA CHANGE IS NORMALLY NEEDED: activity_type is a free-form text column and the app has
-- already introduced new values this way before ('pivot', 'review', 'cross_sell', ...). This
-- migration is a safety net for databases where activity_type is restricted:
--   * enum column            -> adds the 'contact' label
--   * CHECK constraint (list) -> raises a clear error telling you which constraint to extend,
--                                instead of leaving the Contact button silently failing
-- Safe to run multiple times.
-- =============================================================================

do $$
declare
  col_udt  text;
  con      record;
begin
  select c.udt_name into col_udt
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'activities' and c.column_name = 'activity_type';

  -- Enum-typed column: add the new label.
  if exists (select 1 from pg_type t where t.typname = col_udt and t.typtype = 'e') then
    execute format('alter type public.%I add value if not exists %L', col_udt, 'contact');
  end if;

  -- CHECK constraint that restricts activity_type to a fixed list that doesn't include 'contact'.
  for con in
    select c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.conrelid = 'public.activities'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%activity_type%'
      and pg_get_constraintdef(c.oid) not ilike '%contact%'
  loop
    raise exception
      'activities constraint "%" restricts activity_type and does not allow ''contact''. Drop it and recreate it with ''contact'' added: %',
      con.conname, con.def;
  end loop;
end $$;
