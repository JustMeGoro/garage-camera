-- Picture-mode live view: while a viewer keeps live_until in the future, the camera sends small frames.

alter table public.cameras add column live_until timestamptz;
grant select (live_until) on public.cameras to authenticated;
grant update (live_until) on public.cameras to authenticated;
