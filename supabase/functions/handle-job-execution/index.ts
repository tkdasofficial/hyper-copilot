import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export type JobExecutionResult = {
  jobId: string;
  kind: string;
  status: "completed" | "requeued" | "failed";
  generationId?: string;
  resultUrl?: string;
  error?: string;
};

interface JobInput {
  prompt?: string;
  aspect?: string;
  resolution?: string;
  steps?: number;
  seed?: number;
  text?: string;
  voice?: string;
  [key: string]: unknown;
}

interface JobToProcess {
  id: string;
  kind: string;
  user_id?: string;
  label?: string;
  input?: JobInput;
  attempts?: number;
  max_attempts?: number;
  generation_id?: string | null;
  [key: string]: unknown;
}

async function callNvidiaFluxDev(
  supabase: any,
  prompt: string,
  imageUrl?: string,
  seed?: number,
): Promise<string> {
  let nvidiaKey = Deno.env.get("NVIDIA_API_KEY") ?? "";
  if (!nvidiaKey) {
    const { data } = await supabase.rpc("get_provider_secret", { p_name: "NVIDIA_API_KEY" });
    if (typeof data === "string" && data.trim()) nvidiaKey = data.trim();
  }
  if (!nvidiaKey) throw new Error("NVIDIA_API_KEY is not configured in environment or vault.");

  const endpoints = [
    "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
    "https://integrate.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev",
  ];

  const payload: Record<string, unknown> = {
    prompt,
    mode: imageUrl ? "canny" : "base",
    width: 1024,
    height: 1024,
    steps: 30,
    cfg_scale: 3.5,
    samples: 1,
    ...(imageUrl ? { image: imageUrl } : {}),
    ...(seed !== undefined ? { seed } : {}),
  };

  let lastErr: Error | null = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${nvidiaKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Nvidia Flux 1 (Dev) error [${res.status}]: ${text.slice(0, 300)}`);
      }
      const data = await res.json();
      const b64 =
        data.artifacts?.[0]?.base64 ||
        data.artifacts?.[0]?.b64_json ||
        data.data?.[0]?.b64_json ||
        data.image ||
        data.output;
      if (!b64) throw new Error("Nvidia Flux 1 (Dev) returned no image.");
      if (typeof b64 === "string" && (b64.startsWith("http://") || b64.startsWith("https://"))) {
        return b64;
      }
      return b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}`;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr ?? new Error("Failed to call Nvidia Flux 1 (Dev).");
}

async function uploadDataUrlToStorage(
  supabase: any,
  bucket: string,
  userId: string,
  dataUrlOrHttp: string,
): Promise<string> {
  let bytes: Uint8Array;
  let contentType = "image/jpeg";
  if (dataUrlOrHttp.startsWith("data:")) {
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrlOrHttp);
    contentType = match?.[1] || "image/jpeg";
    const binary = atob(match?.[2] || "");
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } else {
    const res = await fetch(dataUrlOrHttp);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    contentType = res.headers.get("content-type") || "image/jpeg";
    bytes = new Uint8Array(await res.arrayBuffer());
  }

  const fileName = `${userId}/${crypto.randomUUID()}.${contentType.includes("png") ? "png" : "jpg"}`;
  const { error } = await supabase.storage.from(bucket).upload(fileName, bytes, { contentType });
  if (error) throw new Error(`Failed to upload to storage: ${error.message}`);
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(fileName, 60 * 60 * 24);
  return signed?.signedUrl ?? fileName;
}

/**
 * Enterprise Job Execution Handler for asynchronous studio operations
 * Claims leased background tasks (image/video/model tasks), delegates generation to
 * corresponding AI models or endpoints, and marks persistence in Supabase.
 */
export async function handleJobExecution(options?: {
  jobId?: string;
  limit?: number;
}): Promise<{ processed: number; results: JobExecutionResult[] }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Missing Supabase credentials in Edge Function environment.");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const results: JobExecutionResult[] = [];

  // Claim due jobs atomically using Postgres RPC or fallback SELECT
  let jobsToProcess: JobToProcess[] = [];

  if (options?.jobId) {
    const { data: job } = await supabase
      .from("jobs")
      .select("*")
      .eq("id", options.jobId)
      .maybeSingle();
    if (job) jobsToProcess = [job];
  } else {
    // Attempt claim_jobs RPC
    const { data: claimed, error: claimErr } = await supabase.rpc("claim_jobs", {
      p_limit: options?.limit ?? 3,
      p_lease_seconds: 600,
    });

    if (!claimErr && claimed && claimed.length > 0) {
      jobsToProcess = claimed;
    } else {
      const nowIso = new Date().toISOString();
      const { data: fallback } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "queued")
        .lte("next_run_at", nowIso)
        .order("next_run_at", { ascending: true })
        .limit(options?.limit ?? 3);
      jobsToProcess = fallback ?? [];
    }
  }

  for (const job of jobsToProcess) {
    // Lock row
    await supabase
      .from("jobs")
      .update({
        status: "running",
        lease_until: new Date(Date.now() + 10 * 60_000).toISOString(),
      })
      .eq("id", job.id);

    try {
      const kind = job.kind;
      const input = job.input || {};

      let resultUrl: string | undefined;

      // 1. Image Job (Flux 1 Schnell - FREE or Stable Diffusion v1-5 for img2img)
      if (kind === "image") {
        const refUrl = input.imageUrl || (Array.isArray(input.referenceUrls) ? input.referenceUrls[0] : undefined);
        const genRes = await fetch(`${supabaseUrl}/functions/v1/generate-image`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            prompt: input.prompt,
            imageUrl: refUrl,
            model: refUrl ? "stable-diffusion-v1-5" : (input.model || "flux-1-schnell"),
            aspect: input.aspect,
            resolution: input.resolution,
            steps: input.steps,
            seed: input.seed,
          }),
        });
        const genJson = await genRes.json();
        if (!genRes.ok || !genJson.ok) {
          throw new Error(genJson.error || "Image generation failed");
        }
        resultUrl = genJson.url;
      }
      // 2. Video Clip Job (LTX 2.5 - FREE)
      else if (kind === "video") {
        const vidRes = await fetch(`${supabaseUrl}/functions/v1/generate-video`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(input),
        });
        const vidJson = await vidRes.json();
        if (!vidRes.ok || !vidJson.ok) {
          throw new Error(vidJson.error || "Video clip generation failed");
        }
        resultUrl = vidJson.url;
      }
      // 3. Audio (TTS) Job (Edge TTS)
      else if (kind === "audio" || kind === "speech") {
        const audRes = await fetch(`${supabaseUrl}/functions/v1/generate-audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            text: input.text || input.prompt,
            voice: input.voice || "en-US-ChristopherNeural",
            format: "link",
            userId: job.user_id,
          }),
        });
        const audJson = await audRes.json();
        if (!audRes.ok || !audJson.ok) {
          throw new Error(audJson.error || "Audio generation failed");
        }
        resultUrl = audJson.url;
      }
      // 4. Virtual Model Generation — Generate Model via Nvidia Flux 1 (Dev)
      else if (kind === "virtual-model") {
        const modelName = String(input.name || "New Model");
        const identityPrompt = String(input.identityPrompt || input.prompt || "");
        const seed = Number(input.seed) || Math.floor(Math.random() * 1000000);

        // Generate headshot with Flux 1 (Dev) via NVIDIA NIM
        const imgData = await callNvidiaFluxDev(
          supabase,
          `close-up headshot portrait of ${identityPrompt}, facing camera, neutral studio background, photorealistic, 8k, tack sharp`,
          undefined,
          seed,
        );

        const storageUrl = await uploadDataUrlToStorage(
          supabase,
          "virtual-models",
          String(job.user_id || "public"),
          imgData,
        );

        // Create or update virtual model row
        const { data: vmRow, error: vmErr } = await supabase
          .from("virtual_models")
          .insert({
            user_id: job.user_id,
            name: modelName,
            description: String(input.description || "Flux 1 (Dev) Virtual Model"),
            identity_prompt: identityPrompt,
            seed,
            status: "ready",
            headshot_path: storageUrl,
            images: [{ view: "headshot", path: storageUrl }],
          })
          .select("id")
          .single();

        if (vmErr) throw new Error(vmErr.message);
        resultUrl = storageUrl;
      }
      // 5. Virtual Model Generation — Generate Content with Model via Nvidia Flux 1 (Dev)
      else if (kind === "character-image") {
        const prompt = String(input.prompt || "Model portrait photoshoot");
        let refHeadshot: string | undefined = undefined;

        if (input.modelId) {
          const { data: vm } = await supabase
            .from("virtual_models")
            .select("headshot_path, identity_prompt")
            .eq("id", input.modelId)
            .maybeSingle();
          if (vm?.headshot_path) refHeadshot = vm.headshot_path;
        }

        const imgData = await callNvidiaFluxDev(
          supabase,
          prompt,
          refHeadshot,
          input.seed ? Number(input.seed) : undefined,
        );

        const storageUrl = await uploadDataUrlToStorage(
          supabase,
          "generations",
          String(job.user_id || "public"),
          imgData,
        );
        resultUrl = storageUrl;
      }

      // Record generation entry in user's library
      let generationId: string | undefined;
      if (resultUrl) {
        const { data: genRow } = await supabase
          .from("generations")
          .insert({
            user_id: job.user_id,
            type: kind,
            prompt: input.prompt || job.label || "",
            output_url: resultUrl,
            metadata: { ...input, source_job_id: job.id },
          })
          .select("id")
          .single();
        generationId = genRow?.id;
      }

      // Mark Job Completed
      await supabase
        .from("jobs")
        .update({
          status: "completed",
          result: { id: generationId ?? job.id, url: resultUrl },
          generation_id: generationId,
          finished_at: new Date().toISOString(),
          lease_until: null,
          error: null,
        })
        .eq("id", job.id);

      results.push({
        jobId: job.id,
        kind,
        status: "completed",
        generationId,
        resultUrl,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await supabase
        .from("jobs")
        .update({
          status: "failed",
          error: errorMsg,
          finished_at: new Date().toISOString(),
          lease_until: null,
        })
        .eq("id", job.id);

      results.push({
        jobId: job.id,
        kind: job.kind,
        status: "failed",
        error: errorMsg,
      });
    }
  }

  return { processed: results.length, results };
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

  try {
    let jobId: string | undefined;
    let limit: number | undefined;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        jobId = body.jobId || body.job_id;
        limit = body.limit ? Number(body.limit) : undefined;
      } catch {
        // empty body ok
      }
    } else if (req.method === "GET") {
      const url = new URL(req.url);
      jobId = url.searchParams.get("jobId") || url.searchParams.get("job_id") || undefined;
      limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined;
    }

    const report = await handleJobExecution({ jobId, limit });

    return new Response(
      JSON.stringify({
        ok: true,
        timestamp: new Date().toISOString(),
        ...report,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
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
