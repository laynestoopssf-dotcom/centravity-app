-- =============================================================================
-- DOCUMENTARY / IDEMPOTENT MIGRATION — no-op against the live database.
-- -----------------------------------------------------------------------------
-- `public.waitlist` and `public.waitlist_status` already exist live (created
-- out-of-band, before this table was ever tracked in migrations/) and are
-- read/written by an external approval tool plus this app's own
-- app/actions/waitlist.ts (verifyWaitlistInvite, joinWaitlist),
-- app/signup/page.tsx (the invite "Token Catcher"), and
-- app/onboarding/page.tsx (waitlist-data prefill). This file exists purely so
-- the schema is tracked in version control like every other table, and so a
-- fresh database ends up with the same shape — every statement below is
-- guarded (IF NOT EXISTS / duplicate_object catch) specifically so it does
-- NOT touch the already-populated live table or its existing rows.
--
-- Confirmed live shape (via the PostgREST OpenAPI schema) before writing this:
--   id uuid primary key default gen_random_uuid()
--   email text not null                    -- unique (see waitlist_email_unique below)
--   first_name text not null default ''
--   last_name text not null default ''
--   agency_name text not null default ''
--   status public.waitlist_status not null default 'pending'
--   created_at timestamptz not null default now()
--   invite_token uuid                      -- nullable; set on approval, burned on signup
-- RLS is already enabled with NO public policies — the table is reachable
-- ONLY via the service-role client from Server Actions, never directly from
-- the browser's anon key. Do not add an anon-facing policy here; the public
-- "Join Waitlist" flow (app/actions/waitlist.ts's joinWaitlist) goes through
-- a Server Action specifically to preserve that.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE public.waitlist_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text NOT NULL DEFAULT '',
  last_name text NOT NULL DEFAULT '',
  agency_name text NOT NULL DEFAULT '',
  status public.waitlist_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  invite_token uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_email_unique ON public.waitlist (email);

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
