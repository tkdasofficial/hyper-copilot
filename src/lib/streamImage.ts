/**
 * Streaming image generation helper.
 *
 * POSTs a prompt to the server route `/api/generate-image`, which forwards to the
 * Lovable AI Gateway with `stream: true`. SSE events arrive as the model produces
 * partial frames (blurred previews) and finally a completed image.
 *
 * Event shape (Gemini image models via the gateway):
 *   event: image_generation.partial_image
 *   data: {"type":"image_generation.partial_image","created_at":...,"b64_json":"..."}
 * and a final `image_generation.completed` event. OpenAI models instead deliver
 * `parsed.image.delta` frames — both are handled here.
 *
 * The callback receives `(dataUrl, isFinal)` for each frame; render the data URL and
 * keep it blurred until `isFinal` is true.
 */

function base64ToDataUrl(b64: string): string {
  return `data:image/png;base64,${b64}`;
}

export async function streamImage(
  endpoint: string,
  prompt: string,
  model: string,
  onFrame: (dataUrl: string, isFinal: boolean) => void,
): Promise<void> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Image generation failed: ${res.status} ${await res.text().catch(() => "")}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Split the buffer into complete SSE events. Events are separated by a blank line.
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      // The event name is optional but present from the gateway; read the data line.
      const dataLine = part
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.slice(5)
        .trim();
      if (!dataLine) continue;

      try {
        const parsed = JSON.parse(dataLine);
        if (parsed.image?.delta) {
          // OpenAI image model shape: { image: { delta, is_final } }
          onFrame(parsed.image.delta, !!parsed.image.is_final);
        } else if (parsed.b64_json) {
          // Gemini image model shape: { type, b64_json }
          const isFinal = parsed.type === "image_generation.completed";
          onFrame(base64ToDataUrl(parsed.b64_json), isFinal);
        }
      } catch {
        // Ignore non-JSON keep-alive lines.
      }
    }
  }

  // A stream that ends with zero events is a gateway hiccup: replay once
  // with streaming off to recover the finished image from the JSON body.
  // The client handles this by checking whether any frame was delivered.
}