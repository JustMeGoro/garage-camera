import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPush } from "../_shared/push.ts";

// Called by a camera phone that holds only a secret code (no account).
// Public by design (verify_jwt off): the secret is checked here against a stored SHA-256 hash.
//   POST ?action=sync    JSON {level}            -> heartbeat + current settings (+ pending WebRTC offer)
//   POST ?action=notify  JSON {type, seconds}    -> alert: ntfy (JSON API) plus optional Web Push
//   POST ?action=answer  JSON {id, sdp}          -> WebRTC answer for the viewer's offer
//   POST ?action=live    JPEG body               -> newest live-view frame (overwrites one file, no event)
//   POST ?kind=...       JPEG body               -> store a photo
// Change VIEWER_URL to the address of your own viewer page.
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_SDP = 32 * 1024;
const VIEWER_URL = "https://justmegoro.github.io/garage-camera/demo/viewer.html";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-camera-secret, apikey, authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function isLive(until: string | null) {
  return !!until && new Date(until).getTime() > Date.now();
}

function duration(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m} min ${s} s` : `${m} min`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { error: "POST only" });

  // Case-sensitive: codes mix upper/lower case and symbols.
  const secret = (req.headers.get("x-camera-secret") ?? "").trim();
  if (secret.length < 8 || secret.length > 64) return reply(401, { error: "invalid camera code" });

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: cam } = await db
    .from("cameras")
    .select("id, name, ntfy_topic, sensitivity, cooldown_s, adapt_s, armed, snapshot_requested, live_until, rtc_offer, facing")
    .eq("secret_hash", await sha256Hex(secret))
    .maybeSingle();
  if (!cam) return reply(401, { error: "invalid camera code" });

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  if (action === "sync") {
    let level: number | null = null;
    try {
      const j = await req.json();
      if (typeof j.level === "number" && Number.isFinite(j.level)) {
        level = Math.max(0, Math.min(100, j.level));
      }
    } catch (_) { /* heartbeat without a level is fine */ }
    await db.from("cameras").update({ pinged_at: new Date().toISOString(), motion_now: level }).eq("id", cam.id);
    return reply(200, {
      sensitivity: cam.sensitivity,
      cooldown_s: cam.cooldown_s,
      adapt_s: cam.adapt_s,
      armed: cam.armed,
      snapshot: cam.snapshot_requested,
      live: isLive(cam.live_until),
      rtc_offer: cam.rtc_offer,
      facing: cam.facing,
    });
  }

  if (action === "notify") {
    // The camera decides when movement is confirmed and how often to repeat; we only deliver the text.
    // A failed notification never fails the request (it is logged and reported in the answer).
    let j: { type?: unknown; seconds?: unknown } = {};
    try { j = await req.json(); } catch (_) { /* defaults below */ }
    const ongoing = j.type === "ongoing";
    const secs = Math.max(0, Math.min(86400, Math.round(Number(j.seconds) || 0)));
    const title = ongoing ? "Motion still detected" : "Motion in the garage";
    const text = ongoing
      ? `${cam.name}: still moving for ${duration(secs)}. Tap to open the viewer.`
      : `${cam.name}: movement confirmed. Tap to open the viewer.`;

    // 1) ntfy through its JSON API: pops up as a banner with sound on the phone (priority 4).
    let ntfy: { status?: number; error?: string } | null = null;
    if (cam.ntfy_topic) {
      try {
        const r = await fetch("https://ntfy.sh/", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: cam.ntfy_topic,
            title,
            message: text,
            priority: 4,
            tags: [ongoing ? "rotating_light" : "warning", "camera"],
            click: VIEWER_URL,
          }),
          signal: AbortSignal.timeout(15000),
        });
        ntfy = { status: r.status };
        if (!r.ok) console.error(`notify: ntfy answered ${r.status}`, (await r.text()).slice(0, 300));
      } catch (e) {
        ntfy = { error: (e as Error).message };
        console.error("notify: ntfy unreachable", (e as Error).message);
      }
    }

    // 2) Optional extra: Web Push to devices that enabled it in the viewer.
    const push = await sendPush(db, { title, body: text, url: VIEWER_URL, tag: `garage-${cam.id}` })
      .catch((e) => { console.error("notify: web push failed", (e as Error).message); return null; });

    return reply(200, { ntfy, push });
  }

  if (action === "answer") {
    let j: { id?: unknown; sdp?: unknown } = {};
    try { j = await req.json(); } catch (_) { return reply(400, { error: "bad json" }); }
    if (typeof j.id !== "string" || typeof j.sdp !== "string" || j.sdp.length > MAX_SDP) {
      return reply(400, { error: "bad answer" });
    }
    await db.from("cameras").update({ rtc_answer: JSON.stringify({ id: j.id, sdp: j.sdp }) }).eq("id", cam.id);
    return reply(200, { ok: true });
  }

  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length < 4 || body.length > MAX_BYTES) return reply(413, { error: "bad photo size" });
  if (body[0] !== 0xff || body[1] !== 0xd8) return reply(415, { error: "not a jpeg" });

  if (action === "live") {
    // Re-read live_until so the camera stops soon after the viewer closes the live view.
    const { data: fresh } = await db.from("cameras").select("live_until").eq("id", cam.id).single();
    if (!isLive(fresh?.live_until ?? null)) return reply(200, { live: false });
    const up = await db.storage.from("garage-photos").upload(`live/${cam.id}.jpg`, body, {
      contentType: "image/jpeg",
      upsert: true,
      cacheControl: "0",
    });
    if (up.error) return reply(500, { error: "live upload failed" });
    return reply(200, { live: true });
  }

  const kindParam = url.searchParams.get("kind");
  const kind = kindParam === "snapshot" || kindParam === "test" ? kindParam : "motion";
  const pctRaw = Number(url.searchParams.get("pct"));
  const pct = Number.isFinite(pctRaw) && url.searchParams.get("pct") !== "" ? pctRaw : null;

  const path = `${cam.id}/${Date.now()}.jpg`;
  const up = await db.storage.from("garage-photos").upload(path, body, { contentType: "image/jpeg" });
  if (up.error) return reply(500, { error: "upload failed" });

  const ins = await db.from("events").insert({ camera_id: cam.id, kind, photo_path: path, motion_pct: pct });
  if (ins.error) return reply(500, { error: "event failed" });

  const patch: Record<string, unknown> = { last_seen: new Date().toISOString() };
  if (kind === "snapshot") patch.snapshot_requested = false;
  await db.from("cameras").update(patch).eq("id", cam.id);
  return reply(200, { ok: true });
});
