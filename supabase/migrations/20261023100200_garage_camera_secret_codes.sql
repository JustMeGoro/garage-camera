-- Cameras have no account any more: a viewer creates a camera and gets a secret code (shown once).
-- Only a SHA-256 hash of the code is stored. Cameras upload through the camera-upload edge function.

create table public.cameras (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  secret_hash text not null unique,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);
alter table public.cameras enable row level security;

-- Viewers may list cameras but never read the secret hash.
revoke select on public.cameras from authenticated;
grant select (id, name, created_at, last_seen) on public.cameras to authenticated;
grant delete on public.cameras to authenticated;

create policy "viewers read cameras" on public.cameras
  for select to authenticated
  using (private.has_role('viewer'));
create policy "viewers delete cameras" on public.cameras
  for delete to authenticated
  using (private.has_role('viewer'));

-- Cameras no longer have accounts: uploads go through the camera-upload edge function.
drop policy "camera inserts own events" on public.events;
drop policy "camera uploads photos" on storage.objects;
alter table public.events drop constraint events_camera_id_fkey;
alter table public.events alter column camera_id drop default;
alter table public.events
  add constraint events_camera_id_fkey foreign key (camera_id) references public.cameras(id) on delete cascade;

create function public.create_camera(p_name text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(24);
  s text := '';
  i int;
begin
  if not private.has_role('viewer') then
    raise exception 'not allowed';
  end if;
  for i in 0..23 loop
    s := s || substr(chars, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  insert into public.cameras (name, secret_hash, created_by)
  values (left(coalesce(nullif(trim(p_name), ''), 'Camera'), 40),
          encode(extensions.digest(s, 'sha256'), 'hex'),
          (select auth.uid()));
  return s;
end
$$;
revoke execute on function public.create_camera(text) from public, anon;
grant execute on function public.create_camera(text) to authenticated;

-- Camera role invites are obsolete.
create or replace function public.create_invite(p_role text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(10);
  c text := '';
  i int;
begin
  if not private.has_role('viewer') then
    raise exception 'not allowed';
  end if;
  if p_role <> 'viewer' then
    raise exception 'only viewer invites exist; cameras use secret codes';
  end if;
  for i in 0..9 loop
    c := c || substr(chars, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  insert into public.invites (code, role, created_by) values (c, p_role, (select auth.uid()));
  return c;
end
$$;
