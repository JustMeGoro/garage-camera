import { createClient } from "npm:@supabase/supabase-js@2";
import { getVapid } from "../_shared/push.ts";

// Returns the public Web Push key (creates the key pair on first use). The public key is public by design.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    const v = await getVapid(db);
    return new Response(JSON.stringify({ publicKey: v.public_key }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("push-key failed", (e as Error).message);
    return new Response(JSON.stringify({ error: "key unavailable" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
