-- Team Profiles & Photos (punch list Phase 2): adds the column + storage bucket needed for
-- self-service avatar uploads. Nothing in the app used Supabase Storage before this - it's a
-- greenfield feature, so this creates the bucket and its RLS policies from scratch rather than
-- extending an existing setup.

alter table public.profiles
  add column if not exists avatar_url text null;

comment on column public.profiles.avatar_url is
  'Public URL of this user''s uploaded profile photo (Supabase Storage, `avatars` bucket, path `{user_id}/avatar.<ext>`). NULL falls back to an initials avatar everywhere it''s rendered (see components/ui/ProfileAvatar.tsx).';

-- Public bucket: profile photos aren't sensitive like client identifiers, and every consumer
-- (leaderboards, team roster, header) needs to render them without a signed-URL round trip.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Anyone can VIEW avatars (the bucket is public - this just makes it explicit/auditable),
-- but a user may only INSERT/UPDATE/DELETE objects inside their own `{user_id}/` folder,
-- keyed off `storage.foldername(name)` (the standard Supabase per-user-folder pattern) so one
-- producer can never overwrite a teammate's photo.
drop policy if exists "Avatar images are publicly accessible" on storage.objects;
create policy "Avatar images are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- profiles RLS: no policies exist anywhere in this repo's migrations (the table predates
-- versioned migrations), so this is a defensive addition only, guarded to be a no-op if RLS
-- was already configured live with the same intent. Lets a user update their own row (first/last
-- name + avatar_url via the new My Profile tab) without needing service-role for that one action.
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
