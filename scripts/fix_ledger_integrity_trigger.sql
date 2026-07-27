-- =============================================================================
-- Fix: protect_ledger_integrity() was silently discarding legitimate
-- multi-line quote/bound submissions.
--
-- Root cause (Rule 2, "Anti-Spam & Ghost Click Prevention"): it counted rows
-- with the SAME user_id + activity_type inserted within the last 3 seconds,
-- and RETURN NULL'd (silently, no error) any new row if one was found. Any
-- multi-unit submission from the Log Quote/Bound modal writes several rows
-- for the same user within milliseconds of each other by design - so row #1
-- always succeeded and every row after it in the same submission was always
-- silently dropped, no matter how the client staggered timestamps or ids.
--
-- This keeps Rule 1 ("No Time Travel" - rejects activities logged more than
-- 5 minutes in the future) intact, and keeps the existing trigger attached to
-- `activities` exactly as-is (CREATE OR REPLACE FUNCTION only swaps the
-- function body - the trigger_ledger_integrity trigger does not need to be
-- touched or recreated).
--
-- The double-click protection Rule 2 was trying to provide is being moved to
-- the correct layer instead: the app now disables the "Save" button for the
-- duration of a submission (see app/dashboard/page.tsx), so an accidental
-- double-click can no longer fire two separate form submissions in the first
-- place - which is a precise, intentional guard instead of a blunt
-- same-user/same-type/3-second heuristic that can't tell a double-click
-- apart from 6 legitimate line items.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.protect_ledger_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- RULE 1: No Time Travel (prevents logging activities dated in the future,
  -- e.g. to game a future day's scoreboard).
  IF NEW.logged_at > NOW() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Data Integrity Error: Cannot log activities in the future.';
  END IF;

  RETURN NEW;
END;
$function$;
