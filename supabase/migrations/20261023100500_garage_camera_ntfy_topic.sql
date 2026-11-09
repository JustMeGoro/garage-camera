-- Optional ntfy topic per camera (an extra alert route; its free tier has a daily message limit).

alter table public.cameras
  add column ntfy_topic text check (ntfy_topic is null or ntfy_topic ~ '^[A-Za-z0-9_-]{6,64}$');
grant select (ntfy_topic) on public.cameras to authenticated;
grant update (ntfy_topic) on public.cameras to authenticated;
