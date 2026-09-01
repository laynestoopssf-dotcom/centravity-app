-- =============================================================================
-- Reverses part of 20260805020000_add_manual_bonuses_policy_id.sql's FK-only
-- design: the Spiff Claim modal (components/CommissionTab.tsx) now takes a
-- freeform "Reference / Description" text field instead of requiring an
-- exact linked policy, so a team member can log a win even when there's no
-- matching bound/issued policy for that producer/month (e.g. a cross-sell
-- that was never logged as its own policy, or a customer not yet in the
-- pipeline).
--
-- Renames+retypes manual_bonuses.policy_id -> client_description (text)
-- rather than just widening the type in place - a column still named
-- "policy_id" that actually holds arbitrary text would be a foot-gun for any
-- future code/query that assumes it's still an FK to policies.id.
--
-- This stays a plain `text` column on purpose: the app never writes raw
-- plaintext into it. components/CommissionTab.tsx encrypts the description
-- client-side with the agency's shared E2EE key before insert - the exact
-- same utils/e2ee.ts AES-256-GCM mechanism the quote/bind pipeline uses for
-- policy identifiers (see 20260827040000_add_agency_encryption_keys.sql) -
-- and packs the resulting {ciphertext, iv} pair into one JSON string so a
-- single text column can hold both. Any authorized member of the agency can
-- decrypt it back to plaintext client-side, same as every other E2EE'd
-- field in this app.
--
-- LOCAL/TESTING ONLY - do not `supabase db push` this against the live
-- database until this has been reviewed (see chat instructions).
--
-- Safe to run multiple times.
-- =============================================================================

alter table public.manual_bonuses
  drop constraint if exists manual_bonuses_policy_id_fkey;

drop index if exists idx_manual_bonuses_policy_id;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'manual_bonuses' and column_name = 'policy_id'
  ) then
    alter table public.manual_bonuses
      alter column policy_id type text using policy_id::text;

    alter table public.manual_bonuses
      rename column policy_id to client_description;
  end if;
end $$;

comment on column public.manual_bonuses.client_description is
  'Client-side E2EE-encrypted "reference/description" for the Spiff Claim modal (components/CommissionTab.tsx) - a JSON string of {c: ciphertext, iv} produced by utils/e2ee.ts''s encryptIdentifierForAgency, using the same agency-wide shared key as policy identifiers. Never plaintext. Replaced the old policy_id FK (20260805020000_add_manual_bonuses_policy_id.sql) so a claim no longer requires an exact matching bound/issued policy for the producer/month. NULL for bonuses with no reference note (e.g. the "Custom Reason" flow).';
