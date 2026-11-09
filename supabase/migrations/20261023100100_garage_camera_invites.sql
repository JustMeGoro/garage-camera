-- One-time invite codes. A new login can do nothing until it redeems a code, which grants its role.

create table public.invites (
  code text primary key,
  role text not null check (role in ('viewer', 'camera')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
alter table public.invites enable row level security;

create policy "viewers read invites" on public.invites
  for select to authenticated
  using (private.has_role('viewer'));
create policy "viewers delete invites" on public.invites
  for delete to authenticated
  using (private.has_role('viewer'));

create function public.create_invite(p_role text) returns text
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
  if p_role not in ('viewer', 'camera') then
    raise exception 'bad role';
  end if;
  for i in 0..9 loop
    c := c || substr(chars, (get_byte(b, i) % 32) + 1, 1);
  end loop;
  insert into public.invites (code, role, created_by) values (c, p_role, (select auth.uid()));
  return c;
end
$$;

create function public.redeem_invite(p_code text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  inv public.invites;
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'login required';
  end if;
  if exists (select 1 from public.profiles where user_id = uid) then
    raise exception 'this account already has a role';
  end if;
  select * into inv from public.invites
    where code = upper(trim(p_code)) and used_at is null and expires_at > now()
    for update;
  if not found then
    raise exception 'invalid or expired code';
  end if;
  insert into public.profiles (user_id, role) values (uid, inv.role);
  update public.invites set used_by = uid, used_at = now() where code = inv.code;
  return inv.role;
end
$$;

revoke execute on function public.create_invite(text) from public, anon;
revoke execute on function public.redeem_invite(text) from public, anon;
grant execute on function public.create_invite(text) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
