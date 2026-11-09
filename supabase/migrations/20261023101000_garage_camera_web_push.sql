-- Web Push: the signing keys (server only) and one row per device that turned notifications on.

-- Server-side signing keys. Only the edge functions (service role) can touch this.
create table public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null
);
alter table public.push_config enable row level security;
revoke all on public.push_config from anon, authenticated;

-- One row per device a viewer enabled notifications on.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  label text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

create policy "viewers read own devices" on public.push_subscriptions
  for select to authenticated
  using (private.has_role('viewer') and user_id = (select auth.uid()));
create policy "viewers add own devices" on public.push_subscriptions
  for insert to authenticated
  with check (private.has_role('viewer') and user_id = (select auth.uid()));
create policy "viewers update own devices" on public.push_subscriptions
  for update to authenticated
  using (private.has_role('viewer') and user_id = (select auth.uid()))
  with check (private.has_role('viewer') and user_id = (select auth.uid()));
create policy "viewers remove own devices" on public.push_subscriptions
  for delete to authenticated
  using (private.has_role('viewer') and user_id = (select auth.uid()));
