-- Progressive Setup checklist (components/DashboardSetupWidget.tsx): a dismissible
-- nudge on the Scoreboard that walks an owner/manager through 3 gaps onboarding
-- intentionally leaves open (agency timezone, per-producer daily targets, comp
-- plans). Per-task "done" ticks live in localStorage - this is the one piece of
-- state that has to persist across devices/sessions: "never show me this card again".

alter table public.profiles
  add column if not exists hide_setup_widget boolean not null default false;

comment on column public.profiles.hide_setup_widget is
  'Self-dismiss flag for the Progressive Setup checklist (components/DashboardSetupWidget.tsx) on the Scoreboard. Set true once a user closes the card; the 3 individual task-completion ticks inside it are tracked client-side in localStorage, not here.';

-- profiles RLS predates versioned migrations (see supabase/migrations/20260826010000_add_profile_avatars.sql's
-- note) - this defensive add is a no-op if the self-update policy already exists live,
-- and only matters here because the widget's dismiss action updates this column
-- directly from the browser as the signed-in user, same as avatar_url/first_name/last_name.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can update their own profile'
  ) then
    create policy "Users can update their own profile"
      on public.profiles for update
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end $$;
