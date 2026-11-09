import webpush from "npm:web-push@3.6.7";

// Shared Web Push helpers. Keys live in public.push_config (service role only).
// Change SUBJECT to the address of your own GitHub Pages site.
const SUBJECT = "https://justmegoro.github.io/garage-camera/";

// deno-lint-ignore no-explicit-any
type Db = any;

function toB64url(bytes: Uint8Array) {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string) {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function getVapid(db: Db): Promise<{ public_key: string; private_key: string }> {
  const existing = await db.from("push_config").select("public_key, private_key").eq("id", 1).maybeSingle();
  if (existing.data) return existing.data;

  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const x = fromB64url(jwk.x!);
  const y = fromB64url(jwk.y!);
  const pub = new Uint8Array(65);
  pub[0] = 4;
  pub.set(x, 1);
  pub.set(y, 33);
  await db.from("push_config").upsert(
    { id: 1, public_key: toB64url(pub), private_key: jwk.d! },
    { onConflict: "id", ignoreDuplicates: true },
  );
  // Re-read so that two simultaneous first calls agree on the same key.
  const again = await db.from("push_config").select("public_key, private_key").eq("id", 1).single();
  if (again.error) throw new Error(again.error.message);
  return again.data;
}

export type PushResult = { devices: number; sent: number; failed: number; removed: number };

export async function sendPush(
  db: Db,
  payload: { title: string; body: string; url: string; tag: string },
): Promise<PushResult> {
  const vapid = await getVapid(db);
  webpush.setVapidDetails(SUBJECT, vapid.public_key, vapid.private_key);
  const { data: subs } = await db.from("push_subscriptions").select("id, endpoint, p256dh, auth");
  const list = (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[];
  const res: PushResult = { devices: list.length, sent: 0, failed: 0, removed: 0 };
  await Promise.all(list.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 3600, urgency: "high" },
      );
      res.sent++;
    } catch (e) {
      // deno-lint-ignore no-explicit-any
      const err = e as any;
      if (err.statusCode === 404 || err.statusCode === 410) {
        // The device unsubscribed or the browser dropped the subscription.
        await db.from("push_subscriptions").delete().eq("id", s.id);
        res.removed++;
      } else {
        res.failed++;
        console.error("push failed", err.statusCode, String(err.body ?? err.message).slice(0, 200));
      }
    }
  }));
  return res;
}
