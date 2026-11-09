-- Core schema: roles, cameras' events, the private photo bucket and the row-level security rules.
-- Only people with the 'viewer' role can read anything. Cameras never read; they upload through an edge function.

create schema if not exists private;
grant usage on schema private to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer', 'camera')),
  label text
);
alter table public.profiles enable row level security;

create function private.has_role(r text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where user_id = (select auth.uid()) and role = r
  )
$$;
revoke all on function private.has_role(text) from public, anon;
grant execute on function private.has_role(text) to authenticated;

create policy "read own profile" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = user_id);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  camera_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'motion' check (kind in ('motion', 'test')),
  photo_path text not null,
  motion_pct numeric
);
create index events_created_at_idx on public.events (created_at desc);
alter table public.events enable row level security;

create policy "camera inserts own events" on public.events
  for insert to authenticated
  with check (private.has_role('camera') and camera_id = (select auth.uid()));
create policy "viewers read events" on public.events
  for select to authenticated
  using (private.has_role('viewer'));
create policy "viewers delete events" on public.events
  for delete to authenticated
  using (private.has_role('viewer'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('garage-photos', 'garage-photos', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

create policy "camera uploads photos" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'garage-photos'
    and private.has_role('camera')
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "viewers read photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'garage-photos' and private.has_role('viewer'));
create policy "viewers delete photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'garage-photos' and private.has_role('viewer'));
