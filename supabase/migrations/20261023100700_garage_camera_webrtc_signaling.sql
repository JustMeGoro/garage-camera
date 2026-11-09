-- WebRTC live video: the viewer writes an offer, the camera answers through the edge function.
-- Both are plain text columns on the camera row (no extra signalling server needed).

alter table public.cameras
  add column rtc_offer text,
  add column rtc_answer text;
grant select (rtc_offer, rtc_answer) on public.cameras to authenticated;
grant update (rtc_offer, rtc_answer) on public.cameras to authenticated;
