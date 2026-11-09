-- Camera codes shortened to 12 characters with mixed case and symbols (about 72 bits, case-sensitive).

create or replace function public.create_camera(p_name text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  -- 65 symbols, no look-alikes (no 0 O 1 I l), no quotes, backslash or spaces
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?+=';
  b bytea := extensions.gen_random_bytes(12);
  s text := '';
  i int;
begin
  if not private.has_role('viewer') then
    raise exception 'not allowed';
  end if;
  for i in 0..11 loop
    s := s || substr(chars, (get_byte(b, i) % length(chars)) + 1, 1);
  end loop;
  insert into public.cameras (name, secret_hash, created_by)
  values (left(coalesce(nullif(trim(p_name), ''), 'Camera'), 40),
          encode(extensions.digest(s, 'sha256'), 'hex'),
          (select auth.uid()));
  return s;
end
$$;
