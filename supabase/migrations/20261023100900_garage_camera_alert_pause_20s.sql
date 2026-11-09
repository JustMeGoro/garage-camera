-- Default repeat interval for alerts while movement continues: 20 seconds.

alter table public.cameras alter column cooldown_s set default 20;
update public.cameras set cooldown_s = 20 where cooldown_s = 30;
