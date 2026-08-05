-- Finalizes the commission math engine's "Exclude Renewals" rule: commission (and every
-- threshold/accelerator that gates it) is only ever earned on New Business. Before this column
-- existed there was no way to mark an individual policy row as a Renewal transaction at all, so
-- the producer commission engine (utils/commissionMath.ts) had nothing to filter on.
--
-- Defaults to false (New Business) so every existing row - and every row inserted by a code path
-- that doesn't yet set it explicitly (CSV bulk import, historical import, etc.) - is treated as
-- commission-eligible New Business, matching today's actual behavior. The bulk CSV importer
-- already silently drops any row whose Activity/Status column contains "renew" before it's ever
-- inserted (see app/dashboard/page.tsx's handleCsvUpload), so no historical data needs backfilling
-- here.
alter table public.policies
  add column if not exists is_renewal boolean not null default false;

comment on column public.policies.is_renewal is
  'True if this row represents a Renewal transaction rather than New Business. Renewal-flagged policies are fully excluded from the commission engine (utils/commissionMath.ts): they earn no payout and do not count toward any unlock threshold or accelerator metric.';

create index if not exists idx_policies_is_renewal on public.policies (is_renewal) where is_renewal = true;
