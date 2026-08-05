-- =============================================================================
-- Patches a PII leak in manual_bonuses: the Spiff Claim modal (CommissionTab)
-- used to ask for a free-text "Customer First Name" + "Last Initial" and fold
-- the result straight into `bonus_name` (e.g. "Google Review — John D."),
-- which put a plaintext name in a column with no hashing, no normalization,
-- and no compliance safeguards at all - a leak entirely outside the blind-
-- indexing work done on `policies`/`activities`.
--
-- Fix: a spiff claim now links directly to the `policies` row of the customer
-- who earned it, via a real foreign key, instead of typing their name in
-- again. `bonus_name` goes back to naming only the bonus TYPE (e.g. "Google
-- Review") - identical to how it's used for manager-entered "Custom Reason"
-- bonuses today, which were never customer-specific and are unaffected.
--
-- `policy_id` is nullable: plenty of bonuses (the "Custom Reason" flow, team-
-- wide spiffs, etc.) never were and still aren't tied to a specific customer.
-- on delete set null (not cascade) - a bonus that was legitimately earned and
-- paid stays on the books as a historical record even if the linked policy is
-- later deleted; it just loses its "which customer" link at that point.
--
-- NOTE ON EXISTING ROWS: any `manual_bonuses` rows already claimed through the
-- old modal have the customer's "First L." folded into `bonus_name` as
-- plaintext (format: "<bonus type> — <First L.>"). This migration does not
-- touch that historical data - same reasoning as deferring the `customer_name`
-- backfill on `policies` (see 20260805000000_add_client_identifier_hash.sql):
-- mutating/scrubbing it is a one-way, PII-relevant decision that shouldn't
-- happen silently inside a schema migration. Decide separately whether to
-- export, hand-scrub, or leave those historical rows as-is.
-- =============================================================================

alter table public.manual_bonuses
  add column if not exists policy_id uuid references public.policies(id) on delete set null;

comment on column public.manual_bonuses.policy_id is
  'Optional FK to the policies row this spiff/bonus was earned against, so a claim can be verified/audited without ever storing the customer''s name in this table. NULL for bonuses with no specific linked customer (e.g. the manager "Custom Reason" flow). See CommissionTab.tsx''s Spiff Claim modal.';

create index if not exists idx_manual_bonuses_policy_id on public.manual_bonuses(policy_id) where policy_id is not null;
