import { createFileRoute } from "@tanstack/react-router";

// Image models available through the gateway. The default is the newest high-quality
// Gemini image model; more models get added here as they're enabled.
const DEFAULT_MODEL = "google/gemini-3.1-flash-image";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // stream: false is the client's zero-event replay (see streamImage.ts).
        const { prompt, model, stream = true } = (await request.json()) as {
          prompt: string;
          model?: string;
          stream?: boolean;
        };
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) {
          return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        }

        const chosen = model ?? DEFAULT_MODEL;
        const isGemini = chosen.startsWith("google/");

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/images/generations",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(
              isGemini
                ? {
                    model: chosen,
                    messages: [{ role: "user", content: prompt }],
                    modalities: ["image", "text"],
                    ...(stream ? { stream: true } : {}),
                  }
                : {
                    model: chosen,
                    prompt,
                    quality: "low",
                    ...(stream ? { stream: true, partial_images: 1 } : {}),
                  },
            ),
          },
        );

        if (!upstream.ok || !upstream.body) {
          return new Response(await upstream.text(), { status: upstream.status });
        }
        if (!stream) {
          return new Response(upstream.body, {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});