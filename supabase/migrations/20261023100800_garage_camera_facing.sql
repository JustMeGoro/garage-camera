-- Which lens the camera uses: the back camera ('environment') or the front selfie camera ('user').

alter table public.cameras
  add column facing text not null default 'environment' check (facing in ('environment', 'user'));
grant select (facing) on public.cameras to authenticated;
grant update (facing) on public.cameras to authenticated;
