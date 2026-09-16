import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_TABLES = [
  "workflows",
  "generations",
  "virtual_models",
  "social_connections",
  "profiles",
  "jobs",
] as const;

type AllowedTable = (typeof ALLOWED_TABLES)[number];

/**
 * Enterprise Secure Record Modification Handler
 * Validates caller auth, verifies user ownership via RLS/service role checks,
 * sanitizes field inputs, executes updates or soft/hard deletes, and cleans up storage.
 */
export async function updateRecordHandler(params: {
  userId: string;
  table: AllowedTable;
  operation: "update" | "delete";
  recordId: string;
  data?: Record<string, unknown>;
}) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase configuration.");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Verify existence & ownership
  const { data: existing, error: findErr } = await supabase
    .from(params.table)
    .select("*")
    .eq("id", params.recordId)
    .maybeSingle();

  if (findErr || !existing) {
    throw new Error(`Record ${params.recordId} not found in ${params.table}.`);
  }

  if (existing.user_id && existing.user_id !== params.userId) {
    throw new Error("Unauthorized: Record does not belong to authenticated user.");
  }

  // 2. Perform Delete
  if (params.operation === "delete") {
    // If virtual model or generation, clean up storage assets if present
    if (params.table === "virtual_models" && existing.images) {
      const paths = Array.isArray(existing.images)
        ? existing.images
            .map((img: { path?: string }) => img?.path)
            .filter((p): p is string => Boolean(p))
        : [];
      if (paths.length > 0) {
        await supabase.storage.from("models").remove(paths);
      }
    } else if (params.table === "generations" && existing.output_url) {
      const pathMatch = existing.output_url.match(/generations\/(.+)$/);
      if (pathMatch) {
        await supabase.storage.from("generations").remove([pathMatch[1]]);
      }
    }

    const { error: delErr } = await supabase.from(params.table).delete().eq("id", params.recordId);

    if (delErr) throw new Error(delErr.message);

    return { ok: true, operation: "delete", table: params.table, id: params.recordId };
  }

  // 3. Perform Update
  if (params.operation === "update") {
    if (!params.data || Object.keys(params.data).length === 0) {
      throw new Error("Missing data payload for update operation.");
    }

    // Filter disallowed fields
    const sanitizedData = { ...params.data };
    delete sanitizedData.id;
    delete sanitizedData.user_id;
    delete sanitizedData.created_at;

    const { data: updated, error: updateErr } = await supabase
      .from(params.table)
      .update(sanitizedData)
      .eq("id", params.recordId)
      .select()
      .single();

    if (updateErr) throw new Error(updateErr.message);

    return { ok: true, operation: "update", table: params.table, record: updated };
  }

  throw new Error(`Unsupported operation: ${params.operation}`);
}

// --- Backend-only access guard (added by Lovable) ---
async function assertBackendCaller(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const token = (
    req.headers.get("x-worker-secret") ??
    url.searchParams.get("worker_secret") ??
    ""
  ).trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const auth = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

  if (serviceKey && auth && auth === serviceKey) return null;

  if (token) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    if (supabaseUrl && serviceKey) {
      try {
        const admin = createClient(supabaseUrl, serviceKey);
        const { data } = await admin.rpc("verify_worker_token", { p_token: token });
        if (data === true) return null;
      } catch (_e) {
        // fall through to reject
      }
    }
  }

  return new Response(JSON.stringify({ error: "Forbidden: backend-only endpoint." }), {
    status: 403,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
// --- end guard ---

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const __denied = await assertBackendCaller(req);
  if (__denied) return __denied;

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    let userId: string | null = null;

    // Check if worker secret was passed
    const workerSecret = req.headers.get("x-worker-secret");
    if (workerSecret && supabaseServiceKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const { data: runner } = await supabaseAdmin
        .from("job_runner")
        .select("worker_token")
        .eq("id", "default")
        .maybeSingle();

      if (runner?.worker_token && runner.worker_token === workerSecret) {
        userId = "system_worker";
      }
    }

    // Otherwise verify user token
    if (!userId && authHeader) {
      const userSupabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData } = await userSupabase.auth.getUser();
      userId = userData?.user?.id ?? null;
    }

    const body = await req.json();

    // Allow internal service invocations with target userId in body
    if (!userId && body.userId && authHeader.includes(supabaseServiceKey)) {
      userId = body.userId;
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized: Valid user token required." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const table = body.table as AllowedTable;
    if (!ALLOWED_TABLES.includes(table)) {
      return new Response(
        JSON.stringify({ error: `Invalid table: ${table}. Allowed: ${ALLOWED_TABLES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await updateRecordHandler({
      userId,
      table,
      operation: body.operation || "update",
      recordId: body.id || body.recordId,
      data: body.data,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
