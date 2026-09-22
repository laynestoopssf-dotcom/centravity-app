-- Pivot & Review activity tracking.
-- -----------------------------------------------------------------------------
-- Supports two new lightweight activity types logged from the Scoreboard's
-- "Pivot" and "Ask for Review" buttons (components/DashboardTab.tsx):
--   - activity_type = 'pivot'  - a producer pivoted a household to a
--     different product line than originally being discussed.
--   - activity_type = 'review' - a producer asked a household for a review.
--
-- Neither is a sale, so - deliberately, unlike Quote/Bound/Complex Resolution -
-- NEITHER writes a companion `policies` row. That keeps them completely
-- invisible to every status-based query across the app (Active Pipeline,
-- Commission math, Ledger's bound/quoted tables, Weekly Rank, Agency
-- Overview) with zero new special-casing required anywhere - `activities`
-- rows outside the small set of types those consumers explicitly look for
-- are already silently ignored today.
--
-- The `activities` table itself has no client-identifier columns at all
-- (only `policies` does), but both modals collect a free-text "Identifier"
-- (see components/dashboard/PivotReviewModals.tsx) so a producer can still
-- search/audit their own Pivots and Reviews later, exactly like every other
-- identifier in this app: hashed + trigram-indexed for search, and
-- separately encrypted for authorized later decryption. Never stored in
-- plain text.
--
-- `pivoted_to_line` additionally captures which product line a Pivot moved
-- to (free text, pulled from the agency's own custom_product_lines at log
-- time) - only ever populated for activity_type = 'pivot' rows.
--
-- All five columns are nullable and additive - every existing row and every
-- existing query against `activities` (none of which select these columns)
-- is completely unaffected. Safe to run multiple times.
-- =============================================================================

alter table public.activities
  add column if not exists client_identifier_hash text,
  add column if not exists client_identifier_trigrams text[],
  add column if not exists client_identifier_ciphertext text,
  add column if not exists client_identifier_iv text,
  add column if not exists pivoted_to_line text;

comment on column public.activities.client_identifier_hash is
  'Blind-index hash of the free-text Identifier captured on Pivot/Review activities (and any future identifier-bearing activity type). Mirrors policies.client_identifier_hash - see utils/crypto.ts. Null for every activity type that does not collect an identifier.';
comment on column public.activities.client_identifier_trigrams is
  'Padded trigram hashes of the same Identifier, enabling partial/substring search for Owners/Managers later. Mirrors policies.client_identifier_trigrams.';
comment on column public.activities.client_identifier_ciphertext is
  'AES-GCM ciphertext of the plaintext Identifier, decryptable by authorized agency members later. Mirrors policies.client_identifier_ciphertext - see utils/e2ee.ts.';
comment on column public.activities.client_identifier_iv is
  'AES-GCM initialization vector paired with client_identifier_ciphertext above. Mirrors policies.client_identifier_iv.';
comment on column public.activities.pivoted_to_line is
  'The product line a producer pivoted a household to - only ever set on activity_type = ''pivot'' rows, sourced from the agency''s agencies.custom_product_lines at log time. Null for every other activity type.';
