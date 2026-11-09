-- Run this ONCE in the Supabase SQL editor of a fresh project.
-- A new project has no viewer yet, so nobody can create the first invite code.
-- This creates a one-time viewer invite (valid for 3 days) and returns it.
-- Create your account on the viewer page, then enter this code when it asks for one.

with b as (select extensions.gen_random_bytes(10) as b),
code as (
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (get_byte(b.b, i) % 32) + 1, 1), '' order by i) as c
  from b, generate_series(0, 9) as i
)
insert into public.invites (code, role, expires_at)
select c, 'viewer', now() + interval '3 days' from code
returning code, role, expires_at;
