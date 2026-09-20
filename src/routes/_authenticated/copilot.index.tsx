import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Image as ImageIcon, MessageSquare, Sparkles, Video } from "lucide-react";
import { pageHead } from "@/lib/seo";
import { AppIcon } from "@/components/hyper/AppIcon";
import { CopilotShell } from "@/components/hyper/CopilotShell";
import { CopilotComposer } from "@/components/hyper/CopilotComposer";
import { COPILOT_MODELS, createAndSendMessage } from "@/lib/copilot-store";

export const Route = createFileRoute("/_authenticated/copilot/")({
  head: () =>
    pageHead({
      path: "/copilot",
      title: "Copilot — Hyper Copilot",
      description: "Start a new conversation with Hyper Copilot.",
      noindex: true,
      keywords: ["Hyper Copilot", "AI assistant", "Copilot chat"],
    }),
  component: CopilotEmptyStatePage,
});

const STARTER_PROMPTS = [
  {
    icon: MessageSquare,
    label: "Nvidia Nemotron 3 Ultra Script",
    model: "nvidia-nemotron",
    prompt:
      "Write a high-retention 30-second video script for TikTok/Reels, complete with visual hooks, B-roll cues, and call to action.",
  },
  {
    icon: ImageIcon,
    label: "Pixazo Flux 1 Schnell Image",
    model: "pixazo-flux",
    prompt:
      "A cinematic shot of a futuristic cyberpunk city at twilight with glowing neon reflections on wet asphalt, 8k resolution.",
  },
  {
    icon: Video,
    label: "Pixazo LTX 2.5 Video Generation",
    model: "pixazo-ltx",
    prompt:
      "A slow dynamic camera zoom into a misty mountain sunrise with golden rays piercing through evergreen pine trees.",
  },
  {
    icon: Sparkles,
    label: "Multi-channel Launch Strategy",
    model: "nvidia-nemotron",
    prompt:
      "Create a 7-day multi-channel launch campaign for my product across social media, email, and community channels.",
  },
];

function CopilotEmptyStatePage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [model, setModel] = useState(COPILOT_MODELS[0]?.id ?? "nvidia-nemotron");
  const [pending, setPending] = useState(false);

  const handleStart = (promptText: string, forcedModel?: string) => {
    const text = promptText.trim();
    if ((!text && !attachment) || pending) return;
    setPending(true);
    const targetModel = forcedModel || model;
    const newChatId = createAndSendMessage(text, targetModel, attachment ?? undefined);
    void navigate({
      to: "/copilot/$chatId",
      params: { chatId: newChatId },
    });
  };

  return (
    <CopilotShell active="new">
      <section className="relative flex min-h-[calc(100vh-110px)] flex-col">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 pb-40 pt-8 text-center sm:px-6">
          <div className="flex flex-col items-center">
            <AppIcon className="h-14 w-14 rounded-2xl shadow-sm ring-1 ring-border" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              What would you like to create?
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Generate AI scripts with Nvidia Nemotron, create images with Pixazo Flux 1 Schnell, or
              produce motion with Pixazo LTX 2.5.
            </p>
          </div>

          <div className="mt-8 grid w-full grid-cols-1 gap-2.5 sm:grid-cols-2 text-left">
            {STARTER_PROMPTS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    setModel(item.model);
                    handleStart(item.prompt, item.model);
                  }}
                  className="group flex flex-col justify-between rounded-xl border border-border bg-surface p-3.5 text-left transition-all hover:border-border-strong hover:bg-surface-2 hover:shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      className="h-4 w-4 text-muted-foreground group-hover:text-foreground"
                      strokeWidth={2}
                    />
                    <span className="text-[13px] font-semibold text-foreground">{item.label}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
                    {item.prompt}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <CopilotComposer
          value={value}
          onValueChange={setValue}
          model={model}
          onModelChange={setModel}
          onSubmit={() => handleStart(value)}
          pending={pending}
          attachment={attachment}
          onAttachmentChange={setAttachment}
        />
      </section>
    </CopilotShell>
  );
}
