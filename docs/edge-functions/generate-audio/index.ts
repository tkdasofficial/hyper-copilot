import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.48.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-worker-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const EDGE_TTS_URL =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4";

const DEFAULT_VOICE = "en-US-ChristopherNeural";

function generateSSML(text: string, voice: string, rate = "+0%", pitch = "+0Hz", volume = "+0%"): string {
  return `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
  <voice name='${voice}'>
    <prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>
      ${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}
    </prosody>
  </voice>
</speak>`;
}

function synthesizeWithEdgeTTS(ssml: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(EDGE_TTS_URL);
    const audioChunks: Uint8Array[] = [];
    const requestId = crypto.randomUUID().replace(/-/g, "");
    const dateStr = new Date().toUTCString();

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error("Edge-TTS WebSocket synthesis timed out (15s)."));
    }, 15000);

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      // 1. Send speech.config
      const configMsg =
        `X-Timestamp:${dateStr}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        });
      ws.send(configMsg);

      // 2. Send SSML request
      const ssmlMsg =
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${dateStr}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;
      ws.send(ssmlMsg);
    };

    ws.onmessage = (event) => {
      if (typeof event.data === "string") {
        // Text messages: check for turn.end
        if (event.data.includes("Path:turn.end")) {
          clearTimeout(timeout);
          ws.close();

          // Concatenate binary chunks
          let totalLength = 0;
          for (const chunk of audioChunks) totalLength += chunk.byteLength;
          const merged = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of audioChunks) {
            merged.set(chunk, offset);
            offset += chunk.byteLength;
          }
          resolve(merged);
        }
      } else if (event.data instanceof ArrayBuffer) {
        // Binary message containing audio
        const buf = new Uint8Array(event.data);
        // Header length is encoded in the first 2 bytes (big endian)
        if (buf.byteLength >= 2) {
          const headerLen = (buf[0] << 8) | buf[1];
          const audioOffset = 2 + headerLen;
          if (buf.byteLength > audioOffset) {
            const rawAudio = buf.slice(audioOffset);
            audioChunks.push(rawAudio);
          }
        }
      }
    };

    ws.onerror = (err) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket connection error to Edge-TTS service: ${err}`));
    };

    ws.onclose = () => {
      clearTimeout(timeout);
      if (audioChunks.length > 0) {
        let totalLength = 0;
        for (const chunk of audioChunks) totalLength += chunk.byteLength;
        const merged = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of audioChunks) {
          merged.set(chunk, offset);
          offset += chunk.byteLength;
        }
        resolve(merged);
      }
    };
  });
}


// --- Backend-only access guard (added by Lovable) ---
async function assertBackendCaller(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const token = (req.headers.get("x-worker-secret") ?? url.searchParams.get("worker_secret") ?? "").trim();
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
    const body = await req.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return new Response(JSON.stringify({ error: "Missing required 'text' parameter." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const voice = body.voice || DEFAULT_VOICE;
    const rate = body.rate || "+0%";
    const pitch = body.pitch || "+0Hz";
    const volume = body.volume || "+0%";

    const ssml = generateSSML(text, voice, rate, pitch, volume);
    const audioBytes = await synthesizeWithEdgeTTS(ssml);

    // Format output
    const mode = body.format || body.mode || "stream";

    // 1. Raw MP3 stream
    if (mode === "raw" || mode === "stream" || body.stream === true) {
      return new Response(audioBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "audio/mpeg",
          "Content-Disposition": `inline; filename="speech.mp3"`,
        },
      });
    }

    // 2. Upload to Supabase Storage link
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if ((mode === "link" || body.upload === true || body.store === true) && supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const userId = body.userId || body.user_id || "public";
      const fileName = `${userId}/${crypto.randomUUID()}.mp3`;

      const { error: uploadError } = await supabase.storage
        .from("generations")
        .upload(fileName, audioBytes, {
          contentType: "audio/mpeg",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Failed to upload audio to Supabase Storage: ${uploadError.message}`);
      }

      const { data: signed } = await supabase.storage
        .from("generations")
        .createSignedUrl(fileName, 60 * 60 * 24);

      return new Response(
        JSON.stringify({
          ok: true,
          voice,
          format: "mp3",
          path: fileName,
          url: signed?.signedUrl ?? null,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // 3. Base64 audio response
    let binary = "";
    const len = audioBytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(audioBytes[i]);
    }
    const base64Audio = btoa(binary);

    return new Response(
      JSON.stringify({
        ok: true,
        voice,
        format: "mp3",
        audio: `data:audio/mpeg;base64,${base64Audio}`,
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
