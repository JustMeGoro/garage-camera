-- Camera settings live on the server and are edited from the viewer; the camera syncs them every few seconds.

alter table public.cameras
  add column sensitivity int not null default 6 check (sensitivity between 1 and 100),
  add column cooldown_s int not null default 30 check (cooldown_s between 5 and 600),
  add column adapt_s int not null default 60 check (adapt_s between 10 and 300),
  add column armed boolean not null default true,
  add column snapshot_requested boolean not null default false,
  add column motion_now numeric,
  add column pinged_at timestamptz;

grant select (sensitivity, cooldown_s, adapt_s, armed, snapshot_requested, motion_now, pinged_at)
  on public.cameras to authenticated;
grant update (name, sensitivity, cooldown_s, adapt_s, armed, snapshot_requested)
  on public.cameras to authenticated;

create policy "viewers update cameras" on public.cameras
  for update to authenticated
  using (private.has_role('viewer'))
  with check (private.has_role('viewer'));

alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check check (kind in ('motion', 'test', 'snapshot'));
