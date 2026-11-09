import { createClient } from "npm:@supabase/supabase-js@2";
import { sendPush } from "../_shared/push.ts";

// Test alert sent through the same server path the real alerts use.
// Authorization is the caller's own login token: the camera row is read with it, so row-level
// security only lets a signed-in viewer through. No token or no viewer role means no camera row.
// Change VIEWER_URL to the address of your own viewer page.
const VIEWER_URL = "https://justmegoro.github.io/garage-camera/demo/viewer.html";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return reply(405, { ok: false, error: "POST only" });

  let id = "";
  try { id = String((await req.json()).id ?? ""); } catch (_) { return reply(400, { ok: false, error: "bad request" }); }

  const userDb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
  );
  const { data: cam } = await userDb.from("cameras").select("id, name, ntfy_topic").eq("id", id).maybeSingle();
  if (!cam) return reply(403, { ok: false, error: "not allowed" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const text = `${cam.name}: this is a test. If you can read it, motion alerts will arrive too.`;

  // Web Push to every device with notifications enabled (optional extra).
  let push = null;
  try {
    push = await sendPush(db, { title: "Test alert", body: text, url: VIEWER_URL, tag: "garage-test" });
  } catch (e) {
    console.error("test: web push failed", (e as Error).message);
  }

  // ntfy through its JSON API (UTF-8 safe). The answer is shown as it came back.
  let ntfy: { status?: number; error?: string; topic?: string; detail?: string } | null = null;
  if (cam.ntfy_topic) {
    try {
      const r = await fetch("https://ntfy.sh/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: cam.ntfy_topic,
          title: "Test alert",
          message: text,
          priority: 4,
          tags: ["white_check_mark", "camera"],
          click: VIEWER_URL,
        }),
        signal: AbortSignal.timeout(15000),
      });
      ntfy = { status: r.status, topic: cam.ntfy_topic, detail: (await r.text()).slice(0, 300) };
    } catch (e) {
      ntfy = { error: `Could not reach ntfy: ${(e as Error).message}` };
    }
  }

  const ok = (push !== null && push.sent > 0) || (ntfy !== null && ntfy.status !== undefined && ntfy.status >= 200 && ntfy.status < 300);
  return reply(200, { ok, push, ntfy });
});
