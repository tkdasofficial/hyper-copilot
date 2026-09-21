import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CornerDownRight } from "lucide-react";
import { pageHead } from "@/lib/seo";
import { supabase } from "@/config";
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

const SUGGESTIONS = [
  {
    text: "Design a book cover for my life story",
    prompt:
      "A cinematic and evocative book cover design for a memoir titled 'The Journey Within', featuring elegant typography and soft atmospheric lighting, 8k resolution.",
    model: "copilot-flash",
  },
  {
    text: "Quiz me on film and cinema",
    prompt: "Quiz me on iconic film and cinema trivia. Start with question 1.",
    model: "copilot-speed",
  },
  {
    text: "Translate Hindi phrases",
    prompt: "Help me translate everyday conversational Hindi phrases into natural English.",
    model: "copilot-speed",
  },
  {
    text: "Create a cinematic video scene",
    prompt:
      "/video A slow dynamic camera zoom into a misty mountain sunrise with golden rays piercing through evergreen trees.",
    model: "copilot-heavy",
  },
];

function CopilotEmptyStatePage() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [attachment, setAttachment] = useState<string | null>(null);
  const [model, setModel] = useState(COPILOT_MODELS[1]?.id ?? "copilot-flash");
  const [pending, setPending] = useState(false);
  const [userName, setUserName] = useState("Tushar Kanti");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (user?.user_metadata?.full_name) {
        setUserName(user.user_metadata.full_name);
      } else if (user?.user_metadata?.name) {
        setUserName(user.user_metadata.name);
      } else if (user?.email) {
        if (user.email.toLowerCase().includes("tushar")) {
          setUserName("Tushar Kanti");
        } else {
          const prefix = user.email.split("@")[0];
          setUserName(prefix.charAt(0).toUpperCase() + prefix.slice(1));
        }
      }
    });
  }, []);

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
      <section className="relative flex min-h-[calc(100vh-110px)] flex-col justify-between">
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 pb-36 pt-8 text-center sm:px-6">
          {/* App Icon (dark / light responsive) */}
          <AppIcon className="h-12 w-12 rounded-2xl shadow-sm ring-1 ring-border/40 animate-in fade-in zoom-in-95 duration-300" />

          {/* Heading */}
          <h1 className="mt-5 text-2xl font-normal tracking-tight text-foreground sm:text-3xl leading-snug text-center">
            What can I help with,
            <br />
            {userName}?
          </h1>

          {/* Prompt templates centered horizontally on screen */}
          <div className="mt-10 flex w-full flex-col items-center justify-center space-y-3.5 text-center">
            {SUGGESTIONS.map((item) => (
              <button
                key={item.text}
                type="button"
                onClick={() => {
                  setModel(item.model);
                  handleStart(item.prompt, item.model);
                }}
                className="group inline-flex items-center justify-center gap-2.5 max-w-md transition-colors py-1 cursor-pointer text-center"
              >
                <CornerDownRight
                  className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground transition-colors shrink-0"
                  strokeWidth={2}
                />
                <span className="text-[14.5px] sm:text-[15px] text-muted-foreground group-hover:text-foreground transition-colors font-normal leading-snug">
                  {item.text}
                </span>
              </button>
            ))}
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
