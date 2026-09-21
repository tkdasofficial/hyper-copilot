import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COPILOT_MODELS } from "@/lib/copilot-store";

export function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className}>
      <path d="M6 3 21 12 6 21Z" fill="currentColor" />
    </svg>
  );
}

function ModelSelector({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const selected = COPILOT_MODELS.find((option) => option.id === value) ?? COPILOT_MODELS[1];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 rounded-full px-2.5 text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
        >
          <span className="font-semibold text-foreground">{selected?.label}</span>
          <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" strokeWidth={2.2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56 rounded-xl p-1 shadow-lg">
        {COPILOT_MODELS.map((option) => {
          const isSelected = option.id === value;
          return (
            <DropdownMenuItem
              key={option.id}
              onSelect={() => onChange(option.id)}
              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 cursor-pointer transition-colors"
            >
              <div className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-semibold text-foreground leading-tight">
                  {option.label}
                </span>
                <span className="block text-[10.5px] text-muted-foreground mt-0.5">
                  {option.detail}
                </span>
              </div>
              {isSelected ? (
                <Check className="h-4 w-4 text-foreground shrink-0" strokeWidth={2.4} />
              ) : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CopilotComposer({
  value,
  onValueChange,
  model,
  onModelChange,
  onSubmit,
  pending,
  inputRef,
  attachment,
  onAttachmentChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  onSubmit: () => void;
  pending: boolean;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  attachment?: string | null;
  onAttachmentChange?: (attachment: string | null) => void;
}) {
  const localRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? localRef;
  const fileRef = useRef<HTMLInputElement>(null);
  const [localAttachment, setLocalAttachment] = useState<string | null>(null);

  const activeAttachment = attachment !== undefined ? attachment : localAttachment;
  const updateAttachment = (url: string | null) => {
    if (onAttachmentChange) onAttachmentChange(url);
    else setLocalAttachment(url);
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 44), 160)}px`;
  }, [value, textareaRef]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      if (dataUrl) {
        updateAttachment(dataUrl);
        if (model === "copilot-speed") {
          onModelChange("copilot-flash");
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!pending && (value.trim() || activeAttachment)) {
        onSubmit();
      }
    }
  };

  const placeholderText =
    model === "copilot-speed"
      ? "Ask anything..."
      : model === "copilot-flash"
        ? "Ask anything, create images or audio..."
        : "Ask anything, render video or analyse...";

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 lg:left-[248px] lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="pointer-events-auto rounded-xl border border-border-strong bg-surface shadow-float focus-within:ring-1 focus-within:ring-ring transition-all">
          {/* Active Image Attachment */}
          {activeAttachment ? (
            <div className="flex items-center gap-2.5 px-3 pt-2.5">
              <div className="relative group inline-block overflow-hidden rounded-lg border border-border">
                <img
                  src={activeAttachment}
                  alt="Attachment preview"
                  className="h-12 w-12 object-cover rounded-md"
                />
                <button
                  type="button"
                  onClick={() => updateAttachment(null)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/70 p-0.5 text-white hover:bg-black transition-colors"
                  title="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <span className="text-[11px] text-muted-foreground">Image attached</span>
            </div>
          ) : null}

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={value}
            rows={1}
            aria-label="Message Copilot"
            placeholder={placeholderText}
            onChange={(event) => onValueChange(event.target.value)}
            onKeyDown={handleKeyDown}
            className="block max-h-[160px] min-h-[44px] w-full resize-none overflow-y-auto bg-transparent px-3 pb-1 pt-2.5 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground"
          />

          {/* Action Row */}
          <div className="flex items-center justify-between px-2 pb-2 pt-0.5">
            <div className="flex items-center gap-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Attach file"
                title="Attach image"
                onClick={() => fileRef.current?.click()}
                className="h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="h-3.5 w-3.5" strokeWidth={1.9} />
              </Button>

              <ModelSelector value={model} onChange={onModelChange} />
            </div>

            {/* Old Run Button Restored */}
            <Button
              type="button"
              onClick={onSubmit}
              disabled={pending || (!value.trim() && !activeAttachment)}
              aria-label={pending ? "Running" : "Run"}
              title={pending ? "Running" : "Run"}
              size="icon"
              className="h-7 w-7 rounded-full"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.4} />
              ) : (
                <PlayIcon className="h-2.5 w-2.5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
