-- =============================================================================
-- READ-ONLY DIAGNOSTIC: find whatever is silently collapsing multi-row
-- inserts into `activities` / `policies` down to a single row.
-- Makes NO changes to any data or schema - pure SELECTs against the catalog.
-- Run this in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Paste the full output back so the exact object name can be identified and
-- a precise, minimal DROP script can be written for it.
-- =============================================================================

-- 1) Triggers (most likely culprit - a BEFORE INSERT trigger that RETURNs NULL
--    for a "duplicate-looking" row silently skips it with NO client-visible error)
select event_object_table as table_name,
       trigger_name,
       action_timing,
       event_manipulation,
       action_statement
from information_schema.triggers
where event_object_table in ('activities', 'policies')
order by event_object_table, trigger_name;

-- 2) Unique / primary key constraints (a composite UNIQUE constraint would
--    normally throw a 23505 error on the 2nd conflicting row - but worth ruling out)
select tc.table_name,
       tc.constraint_name,
       tc.constraint_type,
       kcu.column_name,
       kcu.ordinal_position
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
 and tc.table_schema = kcu.table_schema
where tc.table_schema = 'public'
  and tc.table_name in ('activities', 'policies')
  and tc.constraint_type in ('UNIQUE', 'PRIMARY KEY')
order by tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- 3) All indexes, including unique indexes not registered as a named
--    "constraint" (e.g. `CREATE UNIQUE INDEX ... ON activities (...)`)
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('activities', 'policies');

-- 4) Old-style Postgres RULEs (rare, but a rule can rewrite/no-op an INSERT
--    entirely without any error surfacing to the client)
select schemaname, tablename, rulename, definition
from pg_rules
where schemaname = 'public' and tablename in ('activities', 'policies');

-- 5) RLS policies (a restrictive INSERT policy's WITH CHECK clause can make
--    supabase-js report "success" while Postgres quietly inserts 0 rows for
--    ones that fail the check under a plain, non-upsert insert - worth ruling out)
select schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename in ('activities', 'policies');
