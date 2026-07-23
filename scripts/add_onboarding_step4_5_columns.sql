-- =============================================================================
-- ADDITIVE MIGRATION — safe to run any number of times, never drops/deletes data.
-- Supports Steps 4 & 5 of the OnboardingWizard (Agency Baseline, Goals & Comp)
-- and the wizard's per-step "resume where you left off" tracking.
-- -----------------------------------------------------------------------------
-- IMPORTANT ARCHITECTURE NOTE: almost everything Steps 4 & 5 collect already
-- has a live, actively-read column on public.offices (populated today via
-- Settings → Office Goals in components/SettingsTab.tsx, and consumed by the
-- Revenue/VC engine in app/dashboard/page.tsx):
--
--   book_size_auto / book_size_fire / book_size_life / book_size_health
--   prior_pif_auto / prior_pif_fire                      (policy counts)
--   ytd_lapse_cancel_auto / ytd_lapse_cancel_fire        (retention/lapse %)
--   annual_target_auto_apps / _fire_apps / _life_apps / _health_apps / _commercial_apps
--   base_comm_auto / base_comm_fire / base_comm_life / base_comm_health
--   current_vc_rate                                      (exists on BOTH
--                                                          offices AND agencies)
--
-- There is a deliberate prior rule in this codebase (see the comment above
-- sumOfficeBookSizes in app/dashboard/page.tsx): "Book sizes live on `offices`
-- only ... Never read agency.book_size_*." Onboarding Steps 4 & 5 write into
-- those SAME existing offices columns (the primary office created in Step 1)
-- instead of minting a second, parallel, never-read set of columns on
-- agencies — so filling out onboarding immediately populates Settings and the
-- Revenue tab instead of writing data nothing ever displays.
--
-- The only genuinely new columns needed are Life/Health policy counts (the
-- existing prior_pif_* pair only covers Auto/Fire) and an explicit step
-- pointer so the wizard knows exactly which step to resume on.
-- =============================================================================

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS prior_pif_life numeric NOT NULL DEFAULT 0;

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS prior_pif_health numeric NOT NULL DEFAULT 0;

-- Tracks the next onboarding step the owner should resume on (1-6; 6 means
-- "past the last step, fully done"). Only ever set on the OWNER's own profile
-- row — team members don't participate in the wizard themselves.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step smallint NOT NULL DEFAULT 1;
