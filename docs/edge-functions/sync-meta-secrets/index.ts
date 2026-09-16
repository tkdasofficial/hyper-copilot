import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NAMES = ["META_APP_ID", "META_APP_SECRET", "META_LOGIN_CONFIG_ID"] as const;

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const managementToken = Deno.env.get("SB_MANAGEMENT_ACCESS_TOKEN") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  if (!serviceKey || !managementToken || authorization !== `Bearer ${managementToken}`) {
    return new Response("Forbidden", { status: 403 });
  }

  const values = NAMES.map((name) => [name, (Deno.env.get(name) ?? "").trim()] as const);
  const missing = values.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    return Response.json({ ok: false, missing }, { status: 500 });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const [name, value] of values) {
    const { error } = await supabase.rpc("set_provider_secret", {
      p_name: name,
      p_value: value.replace(/^["']|["']$/g, ""),
    });
    if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, synced: NAMES });
});
