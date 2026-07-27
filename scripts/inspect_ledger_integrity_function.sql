-- READ-ONLY: shows the full source of the trigger function found on `activities`
-- (trigger_ledger_integrity -> protect_ledger_integrity()). Run in Supabase SQL
-- Editor and paste the full output back - this determines whether it's safe to
-- drop the trigger outright or whether it needs to be narrowed/replaced instead.
select pg_get_functiondef(oid) as function_source
from pg_proc
where proname = 'protect_ledger_integrity';
