import { SUPABASE_URL } from "@/config";

export type CopilotActionType =
  "text" | "text-to-image" | "image-to-video" | "image-analyse" | "text-to-audio" | "check-video";

export type CopilotApiResponse = {
  ok: boolean;
  type?: "text" | "image" | "video" | "audio";
  text?: string;
  model?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  requestId?: string;
  status?: "PENDING" | "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "ERROR";
  error?: string;
};

const COPILOT_EDGE_URL = `${SUPABASE_URL}/functions/v1/copilot`;

export async function executeCopilotApi(payload: {
  action: CopilotActionType;
  modelTier?: "speed" | "flash" | "heavy";
  prompt?: string;
  text?: string;
  messages?: Array<{ role: string; content: string }>;
  imageUrl?: string;
  voice?: string;
  aspect?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  requestId?: string;
}): Promise<CopilotApiResponse> {
  try {
    const res = await fetch(COPILOT_EDGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as CopilotApiResponse;
    if (!res.ok || !json.ok) {
      throw new Error(json.error || `Copilot execution failed with status ${res.status}`);
    }
    return json;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}

export async function pollVideoStatus(
  requestId: string,
  onProgress?: (status: string) => void,
  maxAttempts = 40,
  intervalMs = 3000,
): Promise<{ status: string; videoUrl?: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(`${COPILOT_EDGE_URL}?requestId=${encodeURIComponent(requestId)}`);
      if (res.ok) {
        const data = await res.json();
        const status = (data.status || "PROCESSING").toUpperCase();
        onProgress?.(status);
        if (status === "COMPLETED" && data.videoUrl) {
          return { status: "COMPLETED", videoUrl: data.videoUrl };
        }
        if (status === "FAILED" || status === "ERROR") {
          return { status: "FAILED", error: data.error || "Video rendering failed." };
        }
      }
    } catch {
      // Continue polling through transient network blips
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { status: "PROCESSING", error: "Video is still processing in background." };
}
